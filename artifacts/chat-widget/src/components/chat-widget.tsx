import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Send, Building2, Loader2 } from "lucide-react";
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
  answerText: string;
  dictId: number | null;
  isCustom: boolean;
};

const QUESTIONS = [
  { id: "q1", key: "experience_area" },
  { id: "q2", key: "experience_years" },
  { id: "q3", key: "education" },
  { id: "q4", key: "goals" },
] as const;

// ─── API helpers (native fetch, no SDK needed) ─────────────────────────────

async function apiChat(
  conversationId: number,
  content: string
): Promise<{ reply: string; messageId: number }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiQualify(
  conversationId: number,
  sessionId: number
): Promise<{ leadId: number; leadScore: number; leadTemperature: string; qualification: any; aiBrief: string }> {
  const res = await fetch("/api/qualify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversationId, sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Component ─────────────────────────────────────────────────────────────

export function ChatWidget() {
  const [step, setStep] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [leadId, setLeadId] = useState<number | null>(null);

  const [customInput, setCustomInput] = useState("");
  const [activeCustomQ, setActiveCustomQ] = useState<string | null>(null);

  const createSession = useCreateSession();
  const createConversation = useCreateConversation();
  const saveDiagnosticAnswers = useSaveDiagnosticAnswers();

  useEffect(() => {
    createSession.mutate(undefined, {
      onSuccess: (data) => setSessionId(data.sessionId),
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

  // ─── Add bot message (from AI or local) ──────────────────────────────────

  const addBotMessage = (content: string | React.ReactNode) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString() + Math.random(), role: "bot", content },
    ]);
  };

  // ─── Call AI and show reply ───────────────────────────────────────────────

  const sendToAI = async (convId: number, userText: string): Promise<string> => {
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

  // ─── Step 0 → Step 1: "Начать диагностику" ───────────────────────────────

  const handleStart = () => {
    setStep(1);
    // Show the fixed welcome message from the knowledge base (no API call needed yet — no conv_id)
    addBotMessage(
      "Здравствуйте.\n\nЯ помогу понять, подходит ли вам обучение по строительной экспертизе и какой вариант стоит рассмотреть.\n\nСначала задам 4 коротких вопроса.\n\nЭто займёт около 2 минут."
    );
  };

  // ─── Step 1 → Step 2: "Начать" button ────────────────────────────────────

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

          const userMsg = "Начать";
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: "user", content: userMsg },
          ]);

          try {
            await sendToAI(convId, userMsg);
          } catch {
            // error already shown by sendToAI
          }
        },
        onError: () => {
          setIsTyping(false);
          addBotMessage("Не удалось начать диалог. Обновите страницу.");
        },
      }
    );
  };

  // ─── Handle chip / answer selection ──────────────────────────────────────

  const handleOptionSelect = (qIndex: number, dictItem: any, isCustom: boolean) => {
    if (isCustom) {
      setActiveCustomQ(QUESTIONS[qIndex].id);
      setCustomInput("");
      return;
    }
    submitAnswer(qIndex, dictItem.label, dictItem.id, false);
  };

  const submitCustomAnswer = (qIndex: number) => {
    if (!customInput.trim()) return;
    submitAnswer(qIndex, customInput.trim(), null, true);
    setActiveCustomQ(null);
  };

  const submitAnswer = (
    qIndex: number,
    answerText: string,
    dictId: number | null,
    isCustom: boolean
  ) => {
    const q = QUESTIONS[qIndex];
    const newAnswer: DiagnosticAnswer = {
      questionNumber: qIndex + 1,
      questionKey: q.key,
      answerText,
      dictId,
      isCustom,
    };

    const allAnswers = [...answers, newAnswer];
    setAnswers(allAnswers);

    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", content: answerText },
    ]);

    const nextStep = step + 1;
    setStep(nextStep);

    if (!conversationId || !sessionId) return;
    const convId = conversationId;
    const sessId = sessionId;

    if (qIndex < QUESTIONS.length - 1) {
      // More questions — send to AI, it will ask next question
      sendToAI(convId, answerText).catch(() => {});
    } else {
      // Last answer — save diagnostic answers, then qualify
      setIsTyping(true);
      saveDiagnosticAnswers.mutate(
        { data: { conversationId: convId, answers: allAnswers } },
        {
          onSuccess: async () => {
            try {
              await sendToAI(convId, answerText);
            } catch {
              // non-fatal — proceed to qualify
            }

            // Qualify the lead
            try {
              const result = await apiQualify(convId, sessId);
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

  // ─── Render chips ─────────────────────────────────────────────────────────

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
            key={opt.id}
            data-testid={`chip-${q.id}-${opt.id}`}
            onClick={() => handleOptionSelect(qIndex, opt, false)}
            className="px-3 py-1.5 text-sm rounded-full border transition-all duration-200 bg-white text-foreground border-border hover:border-primary hover:text-primary"
          >
            {opt.label}
          </button>
        ))}

        <button
          key={customId}
          data-testid={`chip-${q.id}-5`}
          onClick={() => handleOptionSelect(qIndex, { id: "5", label: "Другое" }, true)}
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

  // ─── Render ───────────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-6 animate-in fade-in zoom-in duration-500 bg-white">
        <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary mb-4">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div className="space-y-3 max-w-[320px]">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Подходит ли вам профессия строительного эксперта?
          </h1>
          <p className="text-muted-foreground text-base">
            Ответьте на несколько вопросов и получите предварительную рекомендацию.
          </p>
        </div>
        <div className="pt-4 w-full max-w-[280px]">
          <Button
            data-testid="button-start-diagnostic"
            onClick={handleStart}
            size="lg"
            className="w-full rounded font-medium px-6 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground transition-all"
            disabled={!sessionId}
          >
            {!sessionId ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
            Начать диагностику
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3 bg-[#002B5C] text-white z-10">
        <div className="w-10 h-10 rounded flex items-center justify-center shrink-0 border border-white/20 bg-white/10">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-[15px] text-white leading-tight">ИНОБР Ассистент</h2>
          <p className="text-[13px] text-white/70 flex items-center gap-1.5 mt-0.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            Консультант онлайн
          </p>
        </div>
      </div>

      {/* Messages */}
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
                  <div className="w-8 h-8 rounded bg-[#002B5C]/10 border border-[#002B5C]/20 flex items-center justify-center shrink-0 mt-1">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap border ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-lg rounded-tr-sm border-transparent"
                      : "bg-secondary text-foreground rounded-lg rounded-tl-sm border-border"
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
                <div className="w-8 h-8 rounded bg-[#002B5C]/10 border border-[#002B5C]/20 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-secondary border border-border rounded-lg rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
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
