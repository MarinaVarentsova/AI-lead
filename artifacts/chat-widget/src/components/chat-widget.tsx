import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Send, Loader2 } from "lucide-react";
import inobrLogo from "@assets/image_1782127452755.png";
import {
  useCreateSession,
  useCreateConversation,
  useSaveDiagnosticAnswers,
  useGetDictionary,
  getGetDictionaryQueryKey,
  GetDictionaryType,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  id: string;
  role: "bot" | "user";
  content: string | React.ReactNode;
};

type DiagnosticAnswer = {
  questionNumber: number;
  questionKey: string;
  code: string;
  raw: string;
};

const QUESTIONS = [
  { id: "q1", key: "experience_area" },
  { id: "q2", key: "experience_years" },
  { id: "q3", key: "education" },
  { id: "q4", key: "goals" },
] as const;

// ─── API helpers (native fetch) ────────────────────────────────────────────────

async function apiChat(
  conversationId: string,
  message: string
): Promise<{ reply: string; messageId: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiQualify(
  conversationId: string
): Promise<{ leadId: string; leadScore: number; leadTemperature: string; qualification: unknown; aiBrief: string }> {
  const res = await fetch("/api/qualify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function ChatWidget() {
  const [step, setStep] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);

  const [customInput, setCustomInput] = useState("");
  const [activeCustomQ, setActiveCustomQ] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);

  const createSession = useCreateSession();
  const createConversation = useCreateConversation();
  const saveDiagnosticAnswers = useSaveDiagnosticAnswers();

  useEffect(() => {
    createSession.mutate(undefined, {
      onSuccess: (data) => setSessionId(data.sessionId),
      onError: () => setSessionError(true),
    });
  }, []);

  const currentQIndex = Math.max(0, step - 2);
  const currentQuestionKey = QUESTIONS[currentQIndex]?.key;
  const dictionaryType = currentQuestionKey as GetDictionaryType;
  const { data: currentDictionary, isLoading: isDictLoading } = useGetDictionary(
    { type: dictionaryType },
    {
      query: {
        queryKey: getGetDictionaryQueryKey({ type: dictionaryType }),
        enabled: step >= 2 && step <= QUESTIONS.length + 1 && Boolean(currentQuestionKey),
      },
    }
  );

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, activeCustomQ, currentDictionary]);

  const addBotMessage = (content: string | React.ReactNode) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString() + Math.random(), role: "bot", content },
    ]);
  };

  const sendToAI = async (convId: string, userText: string): Promise<string> => {
    setIsTyping(true);
    try {
      const { reply } = await apiChat(convId, userText);
      setIsTyping(false);
      addBotMessage(reply);
      return reply;
    } catch (err) {
      setIsTyping(false);
      addBotMessage("Что-то пошло не так. Попробуйте ещё раз.");
      throw err;
    }
  };

  // ─── Step 0 → Step 1: "Начать диагностику" ─────────────────────────────────

  const handleStart = () => {
    setStep(1);
    addBotMessage(
      "Здравствуйте.\n\nЯ помогу понять, подходит ли вам обучение по строительной экспертизе и какой вариант стоит рассмотреть.\n\nСначала задам 4 коротких вопроса.\n\nЭто займёт около 2 минут."
    );
  };

  // ─── Step 1 → Step 2: "Начать" button ──────────────────────────────────────

  const handleBeginQuestions = () => {
    if (!sessionId) return;
    setIsTyping(true);

    createConversation.mutate(
      { data: { sessionId } },
      {
        onSuccess: async (data) => {
          const convId = data.conversationId;
          setConversationId(convId);
          setStep(2);

          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: "user", content: "Начать" },
          ]);

          try {
            await sendToAI(convId, "Начать");
          } catch {
            // error shown by sendToAI
          }
        },
        onError: () => {
          setIsTyping(false);
          addBotMessage("Не удалось начать диалог. Обновите страницу.");
        },
      }
    );
  };

  // ─── Handle chip / answer selection ────────────────────────────────────────

  const handleOptionSelect = (qIndex: number, dictItem: { code: string; name: string }, isCustom: boolean) => {
    if (isCustom) {
      setActiveCustomQ(QUESTIONS[qIndex].id);
      setCustomInput("");
      return;
    }
    submitAnswer(qIndex, dictItem.code, dictItem.name);
  };

  const submitCustomAnswer = (qIndex: number) => {
    if (!customInput.trim()) return;
    submitAnswer(qIndex, "other", customInput.trim());
    setActiveCustomQ(null);
  };

  const submitAnswer = (qIndex: number, code: string, raw: string) => {
    const q = QUESTIONS[qIndex];
    const newAnswer: DiagnosticAnswer = {
      questionNumber: qIndex + 1,
      questionKey: q.key,
      code,
      raw,
    };

    const allAnswers = [...answers, newAnswer];
    setAnswers(allAnswers);

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: raw },
    ]);

    const nextStep = step + 1;
    setStep(nextStep);

    if (!conversationId) return;
    const convId = conversationId;

    if (qIndex < QUESTIONS.length - 1) {
      sendToAI(convId, raw).catch(() => {});
    } else {
      setIsTyping(true);

      const diagnosticData = {
        conversationId: convId,
        experienceArea: allAnswers[0]?.code,
        experienceAreaRaw: allAnswers[0]?.raw,
        experienceYears: allAnswers[1]?.code,
        experienceYearsRaw: allAnswers[1]?.raw,
        educationType: allAnswers[2]?.code,
        educationTypeRaw: allAnswers[2]?.raw,
        goal: allAnswers[3]?.code,
        goalRaw: allAnswers[3]?.raw,
      };

      saveDiagnosticAnswers.mutate(
        { data: diagnosticData },
        {
          onSuccess: async () => {
            try {
              await sendToAI(convId, raw);
            } catch {
              // non-fatal
            }

            try {
              const result = await apiQualify(convId);
              setLeadId(result.leadId);

              const tempLabel: Record<string, string> = {
                hot: "🔥 Горячий",
                warm: "🌤 Тёплый",
                cold: "🧊 Холодный",
                info: "ℹ️ Информационный",
              };

              setIsTyping(false);
              addBotMessage(
                <div className="flex flex-col gap-3">
                  <p>Диагностика завершена. Спасибо за ваши ответы.</p>
                  <p>
                    Предварительная оценка:{" "}
                    <span className="font-semibold">
                      {tempLabel[result.leadTemperature] ?? result.leadTemperature}
                    </span>
                  </p>
                  <p>Менеджер свяжется с вами для подробной консультации.</p>
                  <div
                    className="mt-2 flex items-center gap-2 text-primary"
                    data-testid="status-completion"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Ваши данные сохранены</span>
                  </div>
                </div>
              );
            } catch {
              setIsTyping(false);
              addBotMessage(
                <div className="flex flex-col gap-3">
                  <p>Диагностика завершена. Спасибо за ваши ответы.</p>
                  <p>Ваши данные сохранены. Менеджер свяжется с вами.</p>
                  <div
                    className="mt-2 flex items-center gap-2 text-primary"
                    data-testid="status-completion"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="text-sm font-medium">Сохранено</span>
                  </div>
                </div>
              );
            }
          },
          onError: () => {
            setIsTyping(false);
            addBotMessage("Данные сохранены. Менеджер свяжется с вами.");
          },
        }
      );
    }
  };

  // ─── Render chips ───────────────────────────────────────────────────────────

  const renderChips = (qIndex: number) => {
    const q = QUESTIONS[qIndex];
    if (step !== qIndex + 2) return null;
    if (isTyping) return null;

    if (isDictLoading) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-muted-foreground px-4 mt-2"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Загрузка...</span>
        </motion.div>
      );
    }

    const dictItems = currentDictionary || [];
    const customId = `custom_${q.id}`;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-2 mt-4 px-4"
      >
        {dictItems.map((opt) => (
          <button
            key={opt.code}
            data-testid={`chip-${q.id}-${opt.code}`}
            onClick={() => handleOptionSelect(qIndex, opt, false)}
            className="px-3 py-1.5 text-sm rounded-full border transition-all duration-200 bg-white text-foreground border-border hover:border-primary hover:text-primary"
          >
            {opt.name}
          </button>
        ))}

        <button
          key={customId}
          data-testid={`chip-${q.id}-other`}
          onClick={() => handleOptionSelect(qIndex, { code: "other", name: "Другое" }, true)}
          className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${
            activeCustomQ === q.id
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-white text-foreground border-border hover:border-primary hover:text-primary"
          }`}
        >
          Другое
        </button>

        {activeCustomQ === q.id && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="w-full mt-2"
          >
            <div className="flex gap-2 relative">
              <Textarea
                data-testid={`input-${q.id}-custom`}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Напишите ваш вариант..."
                className="min-h-[80px] text-sm resize-none pr-12 bg-white border-border rounded"
                autoFocus
              />
              <Button
                data-testid="button-submit-custom"
                size="icon"
                onClick={() => submitCustomAnswer(qIndex)}
                className="absolute bottom-2 right-2 h-8 w-8 rounded bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={!customInput.trim()}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-5 py-3 flex items-center gap-3 bg-[#18181E] text-white shrink-0">
          <div className="h-9 w-[78px] overflow-hidden shrink-0 rounded">
            <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
          </div>
          <div>
            <h2 className="font-semibold text-[14px] text-white leading-tight">ИНОБР Ассистент</h2>
            <p className="text-[12px] text-white/60">Институт образования</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center space-y-6 animate-in fade-in zoom-in duration-500">
          <div className="h-16 w-[140px] overflow-hidden rounded-lg mb-2">
            <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
          </div>
          <div className="space-y-3 max-w-[320px]">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Подходит ли вам профессия строительного эксперта?
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ответьте на несколько вопросов и получите предварительную рекомендацию.
            </p>
          </div>
          <div className="pt-2 w-full max-w-[260px]">
            {sessionError ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-red-600">
                  Сервис временно недоступен. Попробуйте обновить страницу.
                </p>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full rounded-md font-semibold px-6 py-2.5 uppercase tracking-wide text-sm"
                  onClick={() => {
                    setSessionError(false);
                    createSession.mutate(undefined, {
                      onSuccess: (data) => setSessionId(data.sessionId),
                      onError: () => setSessionError(true),
                    });
                  }}
                >
                  Попробовать снова
                </Button>
              </div>
            ) : (
              <Button
                data-testid="button-start-diagnostic"
                onClick={handleStart}
                size="lg"
                className="w-full rounded-md font-semibold px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground transition-all uppercase tracking-wide text-sm"
                disabled={!sessionId}
              >
                {!sessionId ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                Начать диагностику
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      <div className="px-5 py-3 flex items-center gap-3 bg-[#18181E] text-white z-10 shrink-0">
        <div className="h-9 w-[78px] overflow-hidden shrink-0 rounded">
          <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
        </div>
        <div>
          <h2 className="font-semibold text-[14px] text-white leading-tight">ИНОБР Ассистент</h2>
          <p className="text-[12px] text-white/60 flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>
            Консультант онлайн
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 px-4 py-6 bg-muted/30" ref={scrollRef}>
        <div className="space-y-6 pb-20">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {msg.role === "bot" && (
                  <div className="w-8 h-8 overflow-hidden rounded shrink-0 mt-1">
                    <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
                  </div>
                )}
                <div
                  className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap border ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-lg rounded-tr-sm border-transparent"
                      : "bg-white text-foreground rounded-lg rounded-tl-sm border-border shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-3 max-w-[80%] mr-auto items-center"
              >
                <div className="w-8 h-8 overflow-hidden rounded shrink-0">
                  <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
                </div>
                <div className="bg-white border border-border shadow-sm rounded-lg rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce"></span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {step === 1 && !isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-11"
            >
              <Button
                data-testid="button-begin-questions"
                onClick={handleBeginQuestions}
                className="rounded bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2"
              >
                Начать
              </Button>
            </motion.div>
          )}

          {renderChips(0)}
          {renderChips(1)}
          {renderChips(2)}
          {renderChips(3)}
        </div>
      </ScrollArea>
    </div>
  );
}
