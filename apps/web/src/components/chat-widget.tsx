import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { createChatScroll } from "@/lib/chat-scroll";
import { sendConsultantTurn, ConsultantLimitError, CONSULTANT_ERROR } from "@/lib/consultant-chat";
import { submitContact, CONTACT_ERROR, type ContactPayload } from "@/lib/contact";
import {
  completeDiagnostic, DIAGNOSTIC_ERROR,
  type DiagnosticPayload, type DiagnoseResponse, type StructuredDiagnosticResult,
} from "@/lib/diagnostic-result";

// ─── Types ─────────────────────────────────────────────────────────────────────

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

type ContactPhase = "channel" | "details" | "submitted";

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTIONS = [
  { id: "q1", key: "experience_area" as GetDictionaryType },
  { id: "q2", key: "experience_years" as GetDictionaryType },
  { id: "q3", key: "education" as GetDictionaryType },
  { id: "q4", key: "goals" as GetDictionaryType },
] as const;

// Короткие отображаемые метки чипов (код из БД не меняется)
const DISPLAY_LABELS: Record<string, string> = {
  // experience_area
  construction: "Строительство",
  design: "Проектирование / сметы",
  supervision: "Технадзор / стройконтроль",
  legal_expertise: "Юриспруденция / оценка",
  no_experience: "Опыта пока нет",
  other: "Другое",
  // experience_years
  none: "Нет опыта",
  up_to_3: "До 3 лет",
  from_3_to_10: "3–10 лет",
  more_than_10: "Более 10 лет",
  related_experience: "Смежный опыт",
  need_clarification: "Нужно уточнить",
  // education
  higher_technical: "Высшее техническое",
  secondary_technical: "Среднее техническое",
  non_profile: "Непрофильное",
  school_only: "Только школа",
  diploma_not_available: "Диплом есть, но не на руках",
  // goals
  extra_income: "Дополнительный доход",
  new_profession: "Новая профессия",
  expand_services: "Расширить услуги",
  apartment_acceptance: "Приемка квартир",
  construction_expertise: "Строительная экспертиза",
  research_only: "Пока изучаю",
};

// Фиксированные тексты вопросов диагностики (только вопрос, без вариантов)
const QUESTION_TEXTS = [
  "С какой сферой связан ваш опыт?",
  "Какой у вас стаж?",
  "Какое у вас образование?",
  "Какая цель вам ближе?",
];

const CONTACT_CHANNELS = [
  { code: "call", label: "Звонок", placeholder: "Ваш номер телефона", type: "tel" },
  { code: "whatsapp", label: "WhatsApp", placeholder: "Номер WhatsApp", type: "tel" },
  { code: "telegram", label: "Telegram", placeholder: "@username или номер", type: "text" },
  { code: "max", label: "MAX", placeholder: "Номер телефона", type: "tel" },
  { code: "email", label: "E-mail", placeholder: "Ваш e-mail", type: "email" },
];

// ─── API helpers ──────────────────────────────────────────────────────────────


// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="px-4 pb-3 pt-1 shrink-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Вопрос {current} из {total}
        </span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-border overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function ResultCard({
  result,
  onAskQuestion,
  onGetConsultation,
}: {
  result: StructuredDiagnosticResult;
  onAskQuestion: () => void;
  onGetConsultation: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <span className="font-semibold text-[15px] text-foreground">Диагностика завершена</span>
      </div>

      <div className="text-sm text-foreground leading-[1.6] whitespace-pre-wrap">
        <p>{result.summary}</p>
        <dl className="space-y-2 mt-3">
          {([
            ["Опыт", result.experience],
            ["Стаж", result.experienceYears],
            ["Образование", result.education],
            ["Цель", result.goal],
            ["Рекомендация", result.recommendation],
          ] as const).map(([label, value]) => (
            <div key={label}>
              <dt className="font-semibold">{label}:</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {result.importantNote !== null && (
          <div className="rounded-lg bg-secondary p-3 mt-3">
            <p className="font-semibold">Важно</p>
            <p>{result.importantNote}</p>
          </div>
        )}
      </div>


      <Button
        data-testid="button-ask-question"
        variant="outline"
        onClick={onAskQuestion}
        className="w-full rounded-lg text-sm font-medium border-primary text-primary"
      >
        Задать вопрос
      </Button>
      <Button
        data-testid="button-get-consultation"
        onClick={onGetConsultation}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium"
      >
        Связаться с менеджером
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatWidget() {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [activeCustomQ, setActiveCustomQ] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState(false);

  const [diagnosticStatus, setDiagnosticStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnoseResponse | null>(null);
  const [postDiagnosticState, setPostDiagnosticState] = useState<"result" | "post-diagnostic-ready">("result");
  const [questionDraft, setQuestionDraft] = useState("");
  const [consultantMessages, setConsultantMessages] = useState<Message[]>([]);
  const [consultantLoading, setConsultantLoading] = useState(false);
  const [consultantError, setConsultantError] = useState(false);
  const [consultantLimitReached, setConsultantLimitReached] = useState(false);
  const consultantRequest = useRef<{ question: string; id: string } | null>(null);
  const consultantBusy = useRef(false);
  const failedQuestion = useRef<string | null>(null);
  const diagnosticBusy = useRef(false);
  const pendingDiagnostic = useRef<DiagnosticPayload | null>(null);
  const answeredCount = useRef(0);

  // Contact form
  const [contactPhase, setContactPhase] = useState<ContactPhase | null>(null);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [contactInput, setContactInput] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState(false);
  const contactBusy = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const consultantInputRef = useRef<HTMLDivElement>(null);
  const scrollTarget = useRef<"bottom" | "consultant">("bottom");
  const scrollController = useRef<ReturnType<typeof createChatScroll> | null>(null);
  const forceScroll = useRef(false);
  const showNextStep = () => { forceScroll.current = true; };

  const createSession = useCreateSession();
  const createConversation = useCreateConversation();
  const saveDiagnosticAnswers = useSaveDiagnosticAnswers();

  // Current question index (0-based) for chip loading
  const currentQIndex = step >= 2 && step <= 5 ? step - 2 : 0;
  const dictionaryType = QUESTIONS[currentQIndex]?.key;

  const { data: currentDictionary, isLoading: isDictLoading } = useGetDictionary(
    { type: dictionaryType },
    {
      query: {
        queryKey: getGetDictionaryQueryKey({ type: dictionaryType }),
        enabled: step >= 2 && step <= 5,
      },
    }
  );

  // Create session on mount
  useEffect(() => {
    createSession.mutate(undefined, {
      onSuccess: (data) => setSessionId(data.sessionId),
      onError: () => setSessionError(true),
    });
  }, []);

  const chatVisible = step > 0;
  useEffect(() => {
    if (!scrollRef.current || !bottomRef.current) return;
    const controller = createChatScroll(scrollRef.current, bottomRef.current);
    scrollController.current = controller;
    return () => { controller.dispose(); scrollController.current = null; };
  }, [chatVisible]);

  // Effects run after the new DOM exists; RAF also covers layout/animation updates.
  useEffect(() => {
    scrollController.current?.schedule(forceScroll.current,
      (scrollTarget.current === "consultant" ? consultantInputRef.current : bottomRef.current) ?? undefined);
    forceScroll.current = false;
  }, [step, messages, isTyping, currentDictionary, activeCustomQ, contactPhase, contactError,
    diagnosticStatus, postDiagnosticState, consultantMessages, consultantLoading, consultantError]);

  const uid = () => Date.now().toString() + Math.random().toString(36).slice(2);

  const addBotMessage = (content: string | React.ReactNode) => {
    setMessages((prev) => [...prev, { id: uid(), role: "bot", content }]);
  };

  // ─── Launch screen → Welcome ────────────────────────────────────────────────

  const handleStart = () => {
    showNextStep();
    setStep(1);
    addBotMessage(
      "Здравствуйте.\n\nЯ помогу понять, подходит ли вам обучение по строительной экспертизе и какой вариант стоит рассмотреть.\n\nСначала задам 4 коротких вопроса.\n\nЭто займет около 2 минут."
    );
  };

  // ─── Welcome → Q1 ──────────────────────────────────────────────────────────

  const handleBeginQuestions = () => {
    if (!sessionId) return;
    showNextStep();
    setIsTyping(true);

    createConversation.mutate(
      { data: { sessionId } },
      {
        onSuccess: (data) => {
          const convId = data.conversationId;
          setConversationId(convId);
          setMessages((prev) => [
            ...prev,
            { id: uid(), role: "user", content: "Начать" },
          ]);
          setIsTyping(false);
          // Показываем Q1 напрямую — без вызова OpenAI
          addBotMessage(QUESTION_TEXTS[0]);
          setStep(2);
        },
        onError: () => {
          setIsTyping(false);
          addBotMessage("Не удалось начать диагностику. Проверьте соединение и попробуйте снова.");
        },
      }
    );
  };

  // ─── Chip selection ─────────────────────────────────────────────────────────

  const handleOptionSelect = (qIndex: number, code: string, displayName: string, isCustom: boolean) => {
    showNextStep();
    if (isCustom) {
      setActiveCustomQ(QUESTIONS[qIndex].id);
      setCustomInput("");
      return;
    }
    submitAnswer(qIndex, code, displayName);
  };

  const submitCustomAnswer = (qIndex: number) => {
    if (!customInput.trim()) return;
    setActiveCustomQ(null);
    submitAnswer(qIndex, "other", customInput.trim());
  };

  const generateResult = async (payload: DiagnosticPayload) => {
    if (diagnosticBusy.current) return;
    diagnosticBusy.current = true;
    pendingDiagnostic.current = payload;
    setDiagnosticStatus("loading");
    try {
      const response = await completeDiagnostic(payload, (data) =>
        saveDiagnosticAnswers.mutateAsync({ data }),
      );
      setDiagnosticResult(response);
      setDiagnosticStatus("success");
    } catch {
      setDiagnosticStatus("error");
    } finally {
      diagnosticBusy.current = false;
    }
  };

  const submitAnswer = (qIndex: number, code: string, raw: string) => {
    // Synchronous guards also cover repeated clicks before React re-renders.
    if (!conversationId || diagnosticBusy.current || qIndex !== answeredCount.current) return;
    showNextStep();
    answeredCount.current++;
    const q = QUESTIONS[qIndex];
    const newAnswer: DiagnosticAnswer = { questionNumber: qIndex + 1, questionKey: q.key, code, raw };
    const allAnswers = [...answers, newAnswer];
    setAnswers(allAnswers);
    setMessages((prev) => [...prev, { id: uid(), role: "user", content: raw }]);
    setStep(qIndex + 3);

    if (qIndex < QUESTIONS.length - 1) {
      addBotMessage(QUESTION_TEXTS[qIndex + 1]);
    } else {
      void generateResult({
        conversationId,
        experienceArea: allAnswers[0].code,
        experienceAreaRaw: allAnswers[0].raw,
        experienceYears: allAnswers[1].code,
        experienceYearsRaw: allAnswers[1].raw,
        educationType: allAnswers[2].code,
        educationTypeRaw: allAnswers[2].raw,
        goal: allAnswers[3].code,
        goalRaw: allAnswers[3].raw,
      });
    }
  };

  const handleConsultantSubmit = async () => {
    const question = questionDraft.trim();
    if (consultantLimitReached || consultantBusy.current || !conversationId || !question || question.length > 4000) return;
    showNextStep();
    scrollTarget.current = "consultant";
    consultantBusy.current = true;
    setConsultantLoading(true);
    setConsultantError(false);
    if (failedQuestion.current !== question) {
      setConsultantMessages((previous) => [...previous, { id: uid(), role: "user", content: question }]);
    }
    failedQuestion.current = question;
    try {
      if (consultantRequest.current?.question !== question) consultantRequest.current = { question, id: crypto.randomUUID() };
      const reply = await sendConsultantTurn(conversationId, question, consultantRequest.current.id);
      if (reply.limitReached) scrollTarget.current = "bottom";
      setConsultantLimitReached(reply.limitReached);
      consultantRequest.current = null;
      setConsultantMessages((previous) => [...previous, { id: uid(), role: "bot", content: reply.message }]);
      setQuestionDraft("");
      failedQuestion.current = null;
    } catch (error) {
      if (error instanceof ConsultantLimitError) { scrollTarget.current = "bottom"; setConsultantLimitReached(true); }
      else setConsultantError(true);
    } finally {
      consultantBusy.current = false;
      setConsultantLoading(false);
    }
  };

  // ─── Contact form ────────────────────────────────────────────────────────────

  const handleSelectChannel = (code: string) => {
    scrollTarget.current = "bottom";
    showNextStep();
    setContactError(false);
    setSelectedChannel(code);
    setContactInput("");
    setContactPhase("details");
  };

  const handleSubmitContact = async () => {
    if (contactBusy.current || !conversationId || !selectedChannel || !contactInput.trim()) return;
    contactBusy.current = true;
    setContactError(false);
    setContactSubmitting(true);

    const channelCode = selectedChannel;
    const payload: ContactPayload = {
      conversationId,
      contactChannel: channelCode,
    };

    if (channelCode === "email") payload.email = contactInput.trim();
    else if (channelCode === "telegram") payload.telegram = contactInput.trim();
    else payload.phone = contactInput.trim();

    try {
      await submitContact(payload, () => setContactPhase("submitted"));
    } catch {
      setContactError(true);
    } finally {
      contactBusy.current = false;
      setContactSubmitting(false);
    }
  };

  // ─── Chips renderer ─────────────────────────────────────────────────────────

  const renderChips = (qIndex: number) => {
    const q = QUESTIONS[qIndex];
    if (step !== qIndex + 2) return null;
    if (isTyping) return null;

    if (isDictLoading) {
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-muted-foreground px-4 mt-3"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Загружаем варианты...</span>
        </motion.div>
      );
    }

    const dictItems = currentDictionary || [];

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-2 mt-4 px-4"
      >
        {dictItems.map((opt) => {
          const label = DISPLAY_LABELS[opt.code] ?? opt.name;
          return (
            <button
              key={opt.code}
              data-testid={`chip-${q.id}-${opt.code}`}
              onClick={() => handleOptionSelect(qIndex, opt.code, label, false)}
              aria-label={label}
              className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border-2 border-primary text-primary bg-white transition-all duration-150 hover:bg-secondary hover:text-primary active:bg-primary active:text-primary-foreground"
            >
              {label}
            </button>
          );
        })}

        <button
          data-testid={`chip-${q.id}-other`}
          onClick={() => handleOptionSelect(qIndex, "other", "Другое", true)}
          aria-label="Другой вариант"
          className={`min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border-2 transition-all duration-150 ${
            activeCustomQ === q.id
              ? "border-primary bg-primary text-primary-foreground"
              : "border-primary text-primary bg-white hover:bg-secondary"
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
            <div className="relative">
              <Textarea
                data-testid={`input-${q.id}-custom`}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Напишите ваш вариант..."
                aria-label="Введите свой вариант ответа"
                className="min-h-[80px] text-sm resize-none pr-12 bg-white border-border rounded-xl"
                autoFocus
              />
              <Button
                data-testid="button-submit-custom"
                size="icon"
                onClick={() => submitCustomAnswer(qIndex)}
                aria-label="Отправить ответ"
                className="absolute bottom-2 right-2 h-8 w-8 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
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

  // ─── Contact section ─────────────────────────────────────────────────────────

  const renderContactSection = () => {
    if (!contactPhase) return null;

    if (contactPhase === "submitted") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-4 rounded-xl border border-border bg-white shadow-sm p-4"
          data-testid="status-completion"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <span className="font-semibold text-[15px]">Заявка принята</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Специалист ИНОБР свяжется с вами в ближайшее время для консультации.
          </p>
        </motion.div>
      );
    }

    if (contactPhase === "channel") {
      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-4 rounded-xl border border-border bg-white shadow-sm p-4 space-y-3"
        >
          <div>
            <p className="font-semibold text-[15px] text-foreground mb-0.5">
              Получить персональную консультацию
            </p>
            <p className="text-sm text-muted-foreground">
              Как вам удобнее продолжить?
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {CONTACT_CHANNELS.map((ch) => (
              <button
                key={ch.code}
                onClick={() => handleSelectChannel(ch.code)}
                aria-label={`Связаться через ${ch.label}`}
                className="min-h-[44px] px-4 py-2 text-sm font-medium rounded-xl border-2 border-primary text-primary bg-white hover:bg-secondary transition-all duration-150"
              >
                {ch.label}
              </button>
            ))}
          </div>
        </motion.div>
      );
    }

    if (contactPhase === "details") {
      const ch = CONTACT_CHANNELS.find((c) => c.code === selectedChannel);
      if (!ch) return null;

      return (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-4 rounded-xl border border-border bg-white shadow-sm p-4 space-y-3"
        >
          <p className="text-sm text-muted-foreground">
            Специалист ИНОБР поможет уточнить программу, документы и условия обучения.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {ch.label}
            </label>
            <Input
              type={ch.type}
              disabled={contactSubmitting}
              value={contactInput}
              onChange={(e) => setContactInput(e.target.value)}
              placeholder={ch.placeholder}
              aria-label={ch.placeholder}
              className="bg-white border-border rounded-lg text-sm"
              autoFocus
            />
          </div>
          {contactError && <p role="alert" className="text-sm text-destructive">{CONTACT_ERROR}</p>}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-lg text-sm border-border"
              onClick={() => setContactPhase("channel")}
              disabled={contactSubmitting}
            >
              Назад
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm"
              onClick={handleSubmitContact}
              disabled={!contactInput.trim() || contactSubmitting}
            >
              {contactSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Отправить"
              )}
            </Button>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  // ─── Launch screen ────────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="chat-widget flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
        {/* Header */}
        <header
          className="px-5 flex items-center gap-3 bg-[#24313B] text-white shrink-0"
          style={{ minHeight: "64px" }}
        >
          <div className="h-8 w-[70px] overflow-hidden shrink-0 rounded">
            <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
          </div>
          <div>
            <h2 className="font-semibold text-[13px] text-white leading-tight">Консультант ИНОБР</h2>
            <p className="text-[11px] text-white/50">Предварительная диагностика</p>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-col items-center justify-start sm:justify-center flex-1 min-h-0 overflow-y-auto px-6 py-6 text-center">
          <div className="h-14 w-[120px] overflow-hidden rounded-lg mb-6">
            <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
          </div>

          <div className="space-y-3 max-w-[320px] mb-8">
            <h1 className="text-xl font-semibold tracking-tight text-foreground leading-snug">
              Подбор направления обучения
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Ответьте на 4 коротких вопроса — система подготовит предварительную рекомендацию.
            </p>
          </div>

          <div className="w-full max-w-[260px] space-y-2">
            {sessionError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">
                  Не удалось начать диагностику. Проверьте соединение и попробуйте снова.
                </p>
                <Button
                  variant="outline"
                  className="w-full rounded-lg text-sm border-border"
                  onClick={() => {
                    setSessionError(false);
                    createSession.mutate(undefined, {
                      onSuccess: (d) => setSessionId(d.sessionId),
                      onError: () => setSessionError(true),
                    });
                  }}
                >
                  Повторить
                </Button>
              </div>
            ) : (
              <>
                <Button
                  data-testid="button-start-diagnostic"
                  onClick={handleStart}
                  size="lg"
                  aria-label="Начать диагностику"
                  className="w-full rounded-lg font-semibold px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground transition-all text-sm uppercase tracking-wide"
                  disabled={!sessionId}
                >
                  {!sessionId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Подготовка...
                    </>
                  ) : (
                    "Пройти диагностику"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Это займёт около 2 минут.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Diagnostic step (steps 2-5) progress ────────────────────────────────────

  const isDiagnosticStep = step >= 2 && step <= 5;
  const questionNumber = isDiagnosticStep ? step - 1 : 0;

  // ─── Chat screen ──────────────────────────────────────────────────────────────

  return (
    <div className="chat-widget flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
      {/* Header */}
      <header
        className="px-5 flex items-center gap-3 bg-[#24313B] text-white z-10 shrink-0"
        style={{ minHeight: "64px" }}
      >
        <div className="h-8 w-[70px] overflow-hidden shrink-0 rounded">
          <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
        </div>
        <div>
          <h2 className="font-semibold text-[13px] text-white leading-tight">Консультант ИНОБР</h2>
          <p className="text-[11px] text-white/60 flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            Онлайн
          </p>
        </div>
      </header>

      {/* Progress bar (during questions) */}
      {isDiagnosticStep && (
        <ProgressBar current={questionNumber} total={4} />
      )}

      {/* Messages */}
      <div className="chat-dialogue min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-5 bg-muted/40" ref={scrollRef} tabIndex={0} aria-label="Диалог">
        <div className="space-y-4 pb-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2.5 max-w-[88%] ${
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {msg.role === "bot" && (
                  <div className="w-7 h-7 overflow-hidden rounded shrink-0 mt-1">
                    <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
                  </div>
                )}
                <div
                  className={`px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
                      : "bg-white text-foreground rounded-2xl rounded-tl-sm border border-border shadow-sm"
                  }`}
                >
                  {msg.content}
                </div>
              </motion.div>
            ))}

            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-2.5 max-w-[80%] mr-auto items-center"
              >
                <div className="w-7 h-7 overflow-hidden rounded shrink-0">
                  <img src={inobrLogo} alt="ИНОБР" className="h-full w-auto max-w-none" />
                </div>
                <div className="bg-white border border-border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {diagnosticStatus === "loading" && (
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground px-4">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Формируем результат диагностики...
            </div>
          )}
          {diagnosticStatus === "error" && (
            <div role="alert" className="rounded-xl border border-border bg-white p-4 space-y-3">
              <p className="text-sm">{DIAGNOSTIC_ERROR}</p>
              <Button onClick={() => {
                if (pendingDiagnostic.current) void generateResult(pendingDiagnostic.current);
              }} className="rounded-lg" data-testid="button-retry-diagnostic">
                Повторить
              </Button>
            </div>
          )}
          {diagnosticStatus === "success" && diagnosticResult && (
            <ResultCard
              result={diagnosticResult.structuredResult}
              onAskQuestion={() => { scrollTarget.current = "consultant"; showNextStep(); setPostDiagnosticState("post-diagnostic-ready"); scrollController.current?.schedule(true, consultantInputRef.current ?? undefined); }}
              onGetConsultation={() => { scrollTarget.current = "bottom"; showNextStep(); setContactPhase((phase) => phase ?? "channel"); scrollController.current?.schedule(true, bottomRef.current ?? undefined); }}
            />
          )}
          {consultantMessages.map((message) => (
            <div key={message.id} className={`max-w-[88%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
              message.role === "user" ? "ml-auto bg-primary text-primary-foreground rounded-tr-sm" : "mr-auto bg-white border border-border shadow-sm rounded-tl-sm"
            }`}>
              {message.content}
            </div>
          ))}
          {consultantLoading && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />Готовим ответ...
          </div>}
          {postDiagnosticState === "post-diagnostic-ready" && !consultantLimitReached && (
            <div ref={consultantInputRef} className="rounded-xl border border-border bg-white p-4 space-y-2">
              <Textarea
                value={questionDraft}
                disabled={consultantLoading}
                maxLength={4000}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void handleConsultantSubmit();
                  }
                }}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="Что хотите уточнить?"
                aria-label="Что хотите уточнить?"
                className="min-h-[80px] text-sm resize-none rounded-xl"
              />
              {consultantError && <p role="alert" className="text-sm text-destructive">{CONSULTANT_ERROR}</p>}
              <Button onClick={() => void handleConsultantSubmit()}
                disabled={consultantLoading || !questionDraft.trim() || !conversationId}
                className="rounded-lg text-sm">
                {consultantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : consultantError ? "Повторить" : "Отправить"}
              </Button>
            </div>
          )}

          {consultantLimitReached && <Button className="w-full" onClick={() => {
            scrollTarget.current = "bottom"; showNextStep(); setContactPhase(phase => phase ?? "channel");
          }}>Продолжить с менеджером</Button>}

          {/* "Начать" button (step 1) */}
          {step === 1 && !isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="pl-9"
            >
              <Button
                data-testid="button-begin-questions"
                onClick={handleBeginQuestions}
                aria-label="Начать диагностику"
                className="rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 text-sm font-medium"
              >
                Начать
              </Button>
            </motion.div>
          )}

          {/* Chips */}
          {renderChips(0)}
          {renderChips(1)}
          {renderChips(2)}
          {renderChips(3)}
          {/* Forms share the same viewport, so long results cannot squeeze them out. */}
          {renderContactSection()}
          <div ref={bottomRef} data-testid="chat-bottom-anchor" className="h-px" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
