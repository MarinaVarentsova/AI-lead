import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, CheckCircle2, ChevronRight, ArrowUpRight, X,
  FileText, Users, ChartNoAxesColumnIncreasing } from "lucide-react";
import {
  useCreateSession,
  useCreateConversation,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { createChatScroll, createQuestionFocusGate } from "@/lib/chat-scroll";
import { sendConsultantTurn, createConsultantRequestId, CONSULTANT_ERROR } from "@/lib/consultant-chat";
import { loadManagerFormContext, MANAGER_CONTEXT_ERROR, MANAGER_SUBMIT_ERROR,
  submitManagerForm } from "@/lib/manager-form";
import {
  completePersistedDiagnostic, DIAGNOSTIC_ERROR,
  type DiagnosticPayload, type DiagnoseResponse, type StructuredDiagnosticResult,
} from "@/lib/diagnostic-result";
import { getDiagnosticSchema, type DiagnosticSchemaQuestion } from "@/lib/diagnostic-schema";
import { recordDiagnosticAnswer, recordDiagnosticQuestion } from "@/lib/diagnostic-dialogue";
import { recordManagerContactClick } from "@/lib/events";

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

type ContactPhase = "loading" | "ready" | "submitted";

// ─── Constants ────────────────────────────────────────────────────────────────

const INOBR_LOGO_SRC = "/inobr-logo.jpg";

// ─── API helpers ──────────────────────────────────────────────────────────────


// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="diagnostic-question__progress" aria-label={`Шаг ${current} из ${total}`}>
      <strong>{String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}</strong>
      <div>
        {Array.from({ length: total }, (_, index) => {
          const number = index + 1;
          return (
            <span key={number} className={number < current ? "is-complete" : number === current ? "is-current" : undefined}>
              {number < current ? <CheckCircle2 aria-hidden="true" /> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function RecommendationCard({
  result,
  onAskQuestion,
  onGetConsultation,
}: {
  result: StructuredDiagnosticResult;
  onAskQuestion: () => void;
  onGetConsultation: () => void;
}) {
  const presentation = result.recommendedTrack === "construction_expertise"
    ? { title: "Стройэксперт", duration: "260–520 академических часов" }
    : result.recommendedTrack === "apartment_acceptance"
      ? { title: "Приёмка квартир", duration: "Продолжительность уточнит менеджер" }
      : { title: "Приёмка квартир и Приёмка ИЖС", duration: "Продолжительность уточнит менеджер" };
  return (
    <div className="diagnostic-recommendation__card">
      <span className="diagnostic-recommendation__badge">Ваша рекомендация</span>
      <h1>{presentation.title} <i>·</i> {presentation.duration}</h1>
      <p className="diagnostic-recommendation__text">{result.recommendation}</p>
      <div className="diagnostic-recommendation__benefits" aria-label="Преимущества программы">
        <div><FileText aria-hidden="true" /><span>Практические навыки<br />на реальных задачах</span></div>
        <div><Users aria-hidden="true" /><span>Поддержка экспертов<br />на всех этапах</span></div>
        <div><ChartNoAxesColumnIncreasing aria-hidden="true" /><span>Знания для развития<br />в выбранном направлении</span></div>
      </div>
      <div className="diagnostic-recommendation__actions">
        <Button data-testid="button-get-consultation" onClick={onGetConsultation}
          className="diagnostic-recommendation__primary">
          Связаться с менеджером <ArrowUpRight aria-hidden="true" />
        </Button>
        <Button data-testid="button-ask-question" variant="outline" onClick={onAskQuestion}
          className="diagnostic-recommendation__secondary">
          Задать вопрос
        </Button>
      </div>
    </div>
  );
}

function ResultCard({ result, onAskQuestion, onGetConsultation }: {
  result: StructuredDiagnosticResult;
  onAskQuestion: () => void;
  onGetConsultation: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-white shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
        <span className="font-semibold text-[15px] text-foreground">Ваша рекомендация</span>
      </div>
      <p className="text-sm text-foreground leading-[1.6] whitespace-pre-wrap">{result.recommendation}</p>
      <Button data-testid="button-ask-question" variant="outline" onClick={onAskQuestion}
        className="w-full rounded-lg text-sm font-medium border-primary text-primary">Задать вопрос</Button>
      <Button data-testid="button-get-consultation" onClick={onGetConsultation}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium">
        Связаться с менеджером <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatWidget({ onDiagnosticCompleted, onPostDiagnosticViewChange }: {
  onDiagnosticCompleted?: () => void;
  onPostDiagnosticViewChange?: (view: "consultation" | "default") => void;
}) {
  const [step, setStep] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [activeCustomQ, setActiveCustomQ] = useState<string | null>(null);
  const [pendingAnswer, setPendingAnswer] = useState<{ code: string; raw: string } | null>(null);
  const [reviewQuestionIndex, setReviewQuestionIndex] = useState<number | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [diagnosticSchema, setDiagnosticSchema] = useState<DiagnosticSchemaQuestion[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(true);

  const [diagnosticStatus, setDiagnosticStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnoseResponse | null>(null);
  const [recommendationViewActive, setRecommendationViewActive] = useState(false);
  const [consultationViewActive, setConsultationViewActive] = useState(false);
  const [postDiagnosticState, setPostDiagnosticState] = useState<"result" | "post-diagnostic-ready">("result");
  const [questionDraft, setQuestionDraft] = useState("");
  const [consultantMessages, setConsultantMessages] = useState<Message[]>([]);
  const [consultantLoading, setConsultantLoading] = useState(false);
  const [consultantError, setConsultantError] = useState(false);
  const consultantRequest = useRef<{ question: string; id: string } | null>(null);
  const consultantBusy = useRef(false);
  const failedQuestion = useRef<string | null>(null);
  const diagnosticBusy = useRef(false);
  const pendingDiagnostic = useRef<DiagnosticPayload | null>(null);
  const answeredCount = useRef(0);
  const initializationStarted = useRef(false);

  // Contact form
  const [contactPhase, setContactPhase] = useState<ContactPhase | null>(null);
  const [managerComment, setManagerComment] = useState("");
  const [managerContextError, setManagerContextError] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactFullName, setContactFullName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState(false);
  const contactBusy = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentQuestionRef = useRef<HTMLDivElement>(null);
  const diagnosticResultRef = useRef<HTMLDivElement>(null);
  const postDiagnosticInputRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistantMessageRef = useRef<HTMLDivElement>(null);
  const latestUserMessageRef = useRef<HTMLDivElement>(null);
  const contactFormRef = useRef<HTMLDivElement>(null);
  const limitCtaRef = useRef<HTMLDivElement>(null);
  const scrollController = useRef<ReturnType<typeof createChatScroll> | null>(null);
  const questionFocusGate = useRef(createQuestionFocusGate());
  type FocusTarget = "question" | "result" | "input" | "user" | "assistant" | "contact" | "limit";
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget; force: boolean } | null>(null);
  const showNextStep = (target: FocusTarget = "question", force = true) => setFocusRequest({ target, force });

  const createSession = useCreateSession();
  const createConversation = useCreateConversation();
  const currentQIndex = step >= 2 && step <= 5 ? step - 2 : 0;

  const loadDiagnosticSchema = async () => {
    setSchemaLoading(true);
    try { setDiagnosticSchema(await getDiagnosticSchema()); }
    catch { setSessionError(true); }
    finally { setSchemaLoading(false); }
  };

  useEffect(() => {
    if (questionFocusGate.current.afterOptionsRender(
      currentQIndex,
      schemaLoading,
      diagnosticSchema[currentQIndex]?.options.length ?? 0,
    )) {
      showNextStep("question");
    }
  }, [currentQIndex, diagnosticSchema, schemaLoading]);

  // Create session on mount
  useEffect(() => {
    void loadDiagnosticSchema();
    createSession.mutate(undefined, {
      onSuccess: (data) => setSessionId(data.sessionId),
      onError: () => setSessionError(true),
    });
  }, []);

  const chatVisible = step > 0;
  useEffect(() => {
    if (!scrollRef.current) return;
    const controller = createChatScroll(scrollRef.current);
    scrollController.current = controller;
    return () => { controller.dispose(); scrollController.current = null; };
  }, [chatVisible]);

  // Explicit actions and newly delivered answers focus their semantic block after render.
  useEffect(() => {
    if (!focusRequest) return;
    const targets = { question: currentQuestionRef.current, result: diagnosticResultRef.current,
      input: postDiagnosticInputRef.current, user: latestUserMessageRef.current,
      assistant: latestAssistantMessageRef.current, contact: contactFormRef.current, limit: limitCtaRef.current };
    scrollController.current?.schedule(targets[focusRequest.target], focusRequest.force,
      focusRequest.target === "input" ? "center" : focusRequest.target === "question" ? "end" : "start");
  }, [focusRequest]);

  const uid = () => Date.now().toString() + Math.random().toString(36).slice(2);

  const addBotMessage = (content: string | React.ReactNode) => {
    setMessages((prev) => [...prev, { id: uid(), role: "bot", content }]);
  };

  // ─── Launch screen → Q1 ────────────────────────────────────────────────────

  const handleStart = () => {
    if (!sessionId || diagnosticSchema.length !== 4 || initializationStarted.current) return;
    initializationStarted.current = true;
    showNextStep();
    setIsTyping(true);

    createConversation.mutate(
      { data: { sessionId } },
      {
        onSuccess: (data) => { void (async () => {
          const convId = data.conversationId;
          try {
            await recordDiagnosticQuestion(convId, 1);
            setConversationId(convId);
            setIsTyping(false);
            addBotMessage(diagnosticSchema[0]?.questionText ?? "");
            setStep(2);
            showNextStep("question", false);
          } catch {
            setIsTyping(false);
            initializationStarted.current = false;
            setSessionError(true);
          }
        })(); },
        onError: () => {
          setIsTyping(false);
          initializationStarted.current = false;
          setSessionError(true);
        },
      }
    );
  };

  useEffect(() => {
    if (step === 0 && !sessionError && sessionId && !schemaLoading && diagnosticSchema.length === 4) handleStart();
  }, [step, sessionError, sessionId, schemaLoading, diagnosticSchema]);

  const retryInitialization = () => {
    initializationStarted.current = false;
    setSessionError(false);
    if (diagnosticSchema.length !== 4) void loadDiagnosticSchema();
    if (!sessionId) createSession.mutate(undefined, {
      onSuccess: (data) => setSessionId(data.sessionId),
      onError: () => setSessionError(true),
    });
  };

  // ─── Chip selection ─────────────────────────────────────────────────────────

  const handleOptionSelect = (qIndex: number, code: string, displayName: string, isCustom: boolean) => {
    if (reviewQuestionIndex !== null) return;
    setPendingAnswer({ code, raw: displayName });
    if (isCustom) {
      setActiveCustomQ(`q${qIndex + 1}`);
      setCustomInput("");
      return;
    }
    setActiveCustomQ(null);
    setCustomInput("");
  };

  const handleDiagnosticNext = (qIndex: number) => {
    if (reviewQuestionIndex !== null) {
      const next = reviewQuestionIndex + 1;
      setReviewQuestionIndex(next >= currentQIndex ? null : next);
      return;
    }
    if (!pendingAnswer || (pendingAnswer.code === "other" && !customInput.trim())) return;
    void submitAnswer(qIndex, pendingAnswer.code,
      pendingAnswer.code === "other" ? customInput.trim() : pendingAnswer.raw);
  };

  const handleDiagnosticBack = (qIndex: number) => {
    if (qIndex <= 0) return;
    setReviewQuestionIndex(qIndex - 1);
  };

  const generateResult = async (payload: DiagnosticPayload) => {
    if (diagnosticBusy.current) return;
    diagnosticBusy.current = true;
    pendingDiagnostic.current = payload;
    showNextStep("result");
    setDiagnosticStatus("loading");
    try {
      const response = await completePersistedDiagnostic(payload.conversationId);
      setDiagnosticResult(response);
      setDiagnosticStatus("success");
      showNextStep("result", false);
    } catch {
      setDiagnosticStatus("error");
      showNextStep("result", false);
    } finally {
      diagnosticBusy.current = false;
    }
  };

  const submitAnswer = async (qIndex: number, code: string, raw: string) => {
    // Synchronous guards also cover repeated clicks before React re-renders.
    if (!conversationId || diagnosticBusy.current || qIndex !== answeredCount.current) return;
    answeredCount.current++;
    const q = diagnosticSchema[qIndex];
    if (!q) return;
    setIsTyping(true);
    try {
      await recordDiagnosticAnswer(conversationId, q.questionNumber, code, code === "other" ? raw : undefined);
      const next = diagnosticSchema[qIndex + 1];
      if (next) await recordDiagnosticQuestion(conversationId, next.questionNumber);
      const newAnswer: DiagnosticAnswer = { questionNumber: q.questionNumber, questionKey: q.field, code, raw };
      const allAnswers = [...answers, newAnswer];
      setAnswers(allAnswers);
      setMessages((prev) => [...prev, { id: uid(), role: "user", content: raw }]);
      setStep(qIndex + 3);
      if (next) {
        setPendingAnswer(null);
        setActiveCustomQ(null);
        setCustomInput("");
        questionFocusGate.current.afterAnswer(qIndex + 1);
        addBotMessage(next.questionText);
      } else {
        setRecommendationViewActive(true);
        onDiagnosticCompleted?.();
        void generateResult({ conversationId, current_area: allAnswers[0].code,
          ...(allAnswers[0].code === "other" ? { current_area_other_text: allAnswers[0].raw } : {}),
          current_role: allAnswers[1].code, education_status: allAnswers[2].code,
          target_tasks: allAnswers[3].code });
      }
    } catch {
      answeredCount.current--;
    } finally {
      setIsTyping(false);
    }
  };

  const handleConsultantSubmit = async () => {
    const question = questionDraft.trim();
    if (consultantBusy.current || !conversationId || !question || question.length > 1000) return;
    showNextStep("user");
    consultantBusy.current = true;
    setConsultantLoading(true);
    setConsultantError(false);
    if (failedQuestion.current !== question) {
      setConsultantMessages((previous) => [...previous, { id: uid(), role: "user", content: question }]);
    }
    failedQuestion.current = question;
    try {
      if (consultantRequest.current?.question !== question) consultantRequest.current = { question, id: createConsultantRequestId() };
      const reply = await sendConsultantTurn(conversationId, question, consultantRequest.current.id);
      showNextStep("assistant", false);
      consultantRequest.current = null;
      setConsultantMessages((previous) => [...previous, { id: uid(), role: "bot", content: reply.message }]);
      setQuestionDraft("");
      failedQuestion.current = null;
    } catch {
      setConsultantError(true); showNextStep("input", false);
    } finally {
      consultantBusy.current = false;
      setConsultantLoading(false);
    }
  };

  const handleManagerContactClick = async () => {
    setContactPhase("loading");
    setManagerContextError(false);
    setContactError(false);
    if (conversationId) {
      void recordManagerContactClick(conversationId).catch((error) => {
        console.error("MANAGER_CONTACT_EVENT_FAILED", error);
      });
    }
    if (!conversationId) { setManagerContextError(true); return; }
    try {
      setManagerComment(await loadManagerFormContext(conversationId));
      setContactPhase("ready");
    } catch {
      setManagerContextError(true);
    }
  };

  // ─── Contact form ────────────────────────────────────────────────────────────

  const handleSubmitContact = async () => {
    if (contactBusy.current || !conversationId || !contactEmail.trim() || !contactFullName.trim() || !contactPhone.trim()) return;
    contactBusy.current = true;
    setContactError(false);
    setContactSubmitting(true);

    try {
      await submitManagerForm({ sessionId: conversationId, email: contactEmail.trim(),
        fullName: contactFullName.trim(), phone: contactPhone.trim() });
      setContactPhase("submitted");
    } catch {
      setContactError(true);
    } finally {
      contactBusy.current = false;
      setContactSubmitting(false);
    }
  };

  const closeManagerForm = () => {
    setContactPhase(null);
    window.location.href = "https://inobr-expert.ru";
  };

  useEffect(() => {
    if (!contactPhase) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeManagerForm(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [contactPhase]);

  // ─── Chips renderer ─────────────────────────────────────────────────────────

  const renderChips = (qIndex: number, reviewing = false) => {
    const q = diagnosticSchema[qIndex];
    if (!q) return null;
    if (isTyping) return null;

    if (schemaLoading) {
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

    const dictItems = q.options;
    const selectedCode = reviewing ? answers[qIndex]?.code : pendingAnswer?.code;

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="diagnostic-question__options"
      >
        {dictItems.map((opt) => {
          const label = opt.label;
          return (
            <button
              key={opt.code}
              data-testid={`chip-q${q.questionNumber}-${opt.code}`}
              onClick={() => handleOptionSelect(qIndex, opt.code, label, opt.allowsFreeText)}
              aria-label={label}
              aria-pressed={selectedCode === opt.code}
              disabled={reviewing}
              className={selectedCode === opt.code ? "is-selected" : undefined}
            >
              {label}
            </button>
          );
        })}

        {!reviewing && activeCustomQ === `q${q.questionNumber}` && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="diagnostic-question__custom"
          >
            <div>
              <Input
                data-testid={`input-q${q.questionNumber}-custom`}
                value={customInput}
                maxLength={200}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Напишите ваш вариант..."
                aria-label="Введите свой вариант ответа"
                className="diagnostic-question__input"
                autoFocus
              />
            </div>
          </motion.div>
        )}
      </motion.div>
    );
  };

  // ─── Contact section ─────────────────────────────────────────────────────────

  const renderContactSection = () => {
    if (!contactPhase) return null;
    return <div className="manager-form-overlay" role="dialog" aria-modal="true" aria-labelledby="manager-form-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closeManagerForm(); }}>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="manager-form-modal">
        <button className="manager-form-modal__close" type="button" onClick={closeManagerForm} aria-label="Закрыть форму"><X /></button>
        <div className="manager-form-modal__heading">
          <span>Персональная консультация</span>
          <h2 id="manager-form-title">Связаться с менеджером</h2>
          <p>Оставьте контакты — специалист ИНОБР свяжется с вами.</p>
        </div>
        {contactPhase === "submitted" ? <div className="manager-form-modal__success" data-testid="status-completion">
          <CheckCircle2 aria-hidden="true" /><h3>Заявка принята</h3>
          <p>Заявка отправлена. Менеджер свяжется с вами.</p>
          <Button onClick={closeManagerForm}>Закрыть</Button>
        </div> : contactPhase === "loading" ? <div className="manager-form-modal__state" role="status">
          {managerContextError ? <><p role="alert">{MANAGER_CONTEXT_ERROR}</p>
            <Button onClick={() => void handleManagerContactClick()}>Повторить</Button></> : <><Loader2 className="animate-spin" /> Подготавливаем форму...</>}
        </div> : <form className="manager-form-modal__form" onSubmit={(event) => { event.preventDefault(); void handleSubmitContact(); }}>
          <label>Email<Input value={contactEmail} onChange={(event) => setContactEmail(event.target.value)}
            maxLength={254} type="email" autoComplete="email" required /></label>
          <label>Имя<Input value={contactFullName} onChange={(event) => setContactFullName(event.target.value)}
            maxLength={200} autoComplete="name" required /></label>
          <label>Телефон<Input value={contactPhone} onChange={(event) => setContactPhone(event.target.value)}
            maxLength={50} type="tel" autoComplete="tel" required /></label>
          <input type="hidden" name="formParams[dealCustomFields][11904802]" value={managerComment} readOnly />
          {contactError && <p role="alert" className="manager-form-modal__error">{MANAGER_SUBMIT_ERROR}</p>}
          <Button type="submit" disabled={contactSubmitting || !contactEmail.trim() || !contactFullName.trim() || !contactPhone.trim()}>
            {contactSubmitting ? <Loader2 className="animate-spin" /> : "Оставить заявку"}
          </Button>
        </form>}
      </motion.div>
    </div>;
  };

  // ─── Immediate diagnostic initialization ─────────────────────────────────────

  if (step === 0) {
    return (
      <div className="chat-widget diagnostic-question flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <header className="diagnostic-launch__header consultation-chat-header px-7 flex items-center text-white shrink-0">
          <div className="diagnostic-launch__logo"><img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" /></div>
          <div className="diagnostic-launch__brand-copy">
            <h2 id="consultation-title">Подбор направления обучения</h2>
            <p>Стройэксперт</p>
          </div>
        </header>

        <main className="diagnostic-question__body">
          <ProgressBar current={1} total={4} />
          {sessionError ? <div className="diagnostic-recommendation__error" role="alert">
            <p>Не удалось начать диагностику. Проверьте соединение и попробуйте снова.</p>
            <Button onClick={retryInitialization}>Повторить</Button>
          </div> : <div className="diagnostic-question__loading" role="status">
            <Loader2 aria-hidden="true" /> Подготавливаем диагностику...
          </div>}
        </main>
      </div>
    );
  }

  // ─── Diagnostic step (steps 2-5) progress ────────────────────────────────────

  const isDiagnosticStep = step >= 2 && step <= 5;
  const questionNumber = isDiagnosticStep ? step - 1 : 0;

  if (isDiagnosticStep) {
    const displayedQIndex = reviewQuestionIndex ?? currentQIndex;
    const displayedQuestion = diagnosticSchema[displayedQIndex];
    const reviewing = reviewQuestionIndex !== null;
    const canContinue = reviewing || Boolean(pendingAnswer &&
      (pendingAnswer.code !== "other" || customInput.trim()));

    return (
      <div className="chat-widget diagnostic-question flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <header className="diagnostic-launch__header consultation-chat-header px-7 flex items-center text-white shrink-0">
          <div className="diagnostic-launch__logo"><img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" /></div>
          <div className="diagnostic-launch__brand-copy">
            <h2 id="consultation-title">Подбор направления обучения</h2>
            <p>Стройэксперт</p>
          </div>
        </header>

        <main className="diagnostic-question__body">
          <ProgressBar current={displayedQIndex + 1} total={4} />
          {displayedQuestion && (
            <div ref={currentQuestionRef} className="diagnostic-question__content">
              <h1>{displayedQuestion.questionText}</h1>
              {renderChips(displayedQIndex, reviewing)}
            </div>
          )}
          {isTyping && <div className="diagnostic-question__loading" role="status">
            <Loader2 aria-hidden="true" /> Сохраняем ответ...
          </div>}
          <nav className="diagnostic-question__navigation" aria-label="Навигация по диагностике">
            <Button variant="ghost" onClick={() => handleDiagnosticBack(displayedQIndex)}
              disabled={displayedQIndex === 0 || isTyping} className="diagnostic-question__back">
              <ChevronRight aria-hidden="true" /> Назад
            </Button>
            <Button onClick={() => handleDiagnosticNext(displayedQIndex)} disabled={!canContinue || isTyping}
              className="diagnostic-question__next">
              {displayedQIndex === 3 && !reviewing ? "Получить рекомендацию" : "Далее"}
              <ArrowUpRight aria-hidden="true" />
            </Button>
          </nav>
        </main>
      </div>
    );
  }

  if (recommendationViewActive) {
    return (
      <div className="chat-widget diagnostic-recommendation flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <header className="diagnostic-launch__header consultation-chat-header px-7 flex items-center text-white shrink-0">
          <div className="diagnostic-launch__logo"><img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" /></div>
          <div className="diagnostic-launch__brand-copy">
            <h2 id="consultation-title">Подбор направления обучения</h2><p>Стройэксперт</p>
          </div>
        </header>
        <main className="diagnostic-recommendation__body">
          <ProgressBar current={4} total={4} />
          {diagnosticStatus === "loading" && <div className="diagnostic-recommendation__loading" role="status">
            <Loader2 aria-hidden="true" /> Формируем персональную рекомендацию...
          </div>}
          {diagnosticStatus === "error" && <div className="diagnostic-recommendation__error" role="alert">
            <p>{DIAGNOSTIC_ERROR}</p>
            <Button onClick={() => { if (pendingDiagnostic.current) void generateResult(pendingDiagnostic.current); }}>
              Повторить
            </Button>
          </div>}
          {diagnosticStatus === "success" && diagnosticResult && (
            <RecommendationCard result={diagnosticResult.structuredResult}
              onAskQuestion={() => {
                setRecommendationViewActive(false); setConsultationViewActive(true);
                onPostDiagnosticViewChange?.("consultation");
                showNextStep("input"); setPostDiagnosticState("post-diagnostic-ready");
              }}
              onGetConsultation={() => {
                void handleManagerContactClick();
              }} />
          )}
        </main>
        {renderContactSection()}
      </div>
    );
  }

  if (consultationViewActive) {
    const consultantAnswerCount = consultantMessages.filter((message) => message.role === "bot").length;
    const questionNumber = consultantAnswerCount + 1;

    return (
      <div className="chat-widget diagnostic-consultation flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
        <header className="diagnostic-launch__header consultation-chat-header px-7 flex items-center text-white shrink-0">
          <div className="diagnostic-launch__logo"><img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" /></div>
          <div className="diagnostic-launch__brand-copy">
            <h2 id="consultation-title">Подбор направления обучения</h2><p>Стройэксперт</p>
          </div>
        </header>
        <main className="diagnostic-consultation__body">
          <div className="diagnostic-consultation__heading">
            <span>Вопрос {questionNumber}</span>
            <h1>{consultantAnswerCount === 0 ? "Что хотите уточнить?" : "Продолжим консультацию"}</h1>
          </div>

          <div className="diagnostic-consultation__history" aria-live="polite">
            {consultantMessages.map((message) => (
              <article key={message.id} className={`diagnostic-consultation__message diagnostic-consultation__message--${message.role}`}>
                <strong>{message.role === "user" ? "Ваш вопрос" : "Артём Экспертович"}</strong>
                <p>{message.content}</p>
              </article>
            ))}
            {consultantLoading && <div role="status" className="diagnostic-consultation__loading">
              <Loader2 aria-hidden="true" /> Готовим ответ Артёма...
            </div>}
          </div>

          <div className="diagnostic-consultation__composer">
              <Textarea ref={postDiagnosticInputRef} value={questionDraft} disabled={consultantLoading}
                maxLength={1000} onChange={(event) => setQuestionDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault(); void handleConsultantSubmit();
                  }
                }}
                placeholder="Введите ваш вопрос" aria-label="Введите ваш вопрос" />
              {consultantError && <p role="alert" className="diagnostic-consultation__error">{CONSULTANT_ERROR}</p>}
              <Button onClick={() => void handleConsultantSubmit()}
                disabled={consultantLoading || !questionDraft.trim() || !conversationId}
                className="diagnostic-consultation__submit">
                {consultantLoading ? <Loader2 className="animate-spin" /> : consultantError ? "Повторить" : "Задать вопрос"}
                {!consultantLoading && <ArrowUpRight aria-hidden="true" />}
              </Button>
          </div>
          {contactPhase !== "submitted" && (
            <div className="diagnostic-consultation__complete" ref={limitCtaRef}>
              <Button className="diagnostic-consultation__manager" onClick={() => {
                void handleManagerContactClick();
              }}><span className="diagnostic-consultation__manager-label">Связаться с менеджером</span>
                <ArrowUpRight aria-hidden="true" />
              </Button>
            </div>
          )}
        </main>
        {renderContactSection()}
      </div>
    );
  }

  // ─── Chat screen ──────────────────────────────────────────────────────────────

  return (
    <div className="chat-widget flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-background">
      {/* Header */}
      <header
        className="consultation-chat-header px-5 pr-16 flex items-center gap-3 text-white z-10 shrink-0"
        style={{ minHeight: "72px" }}
      >
        <div className="h-8 w-[70px] overflow-hidden shrink-0 rounded">
          <img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" className="h-full w-auto max-w-none" />
        </div>
        <div>
          <h2 id="consultation-title" className="font-semibold text-[15px] text-white leading-tight">Подбор направления обучения</h2>
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
            {messages.map((msg) => {
              const currentQuestion = isDiagnosticStep && msg.role === "bot" && msg.id === messages.at(-1)?.id;
              return (
                <div key={msg.id} ref={currentQuestion ? currentQuestionRef : undefined}
                  className={currentQuestion ? "chat-focus-target space-y-4" : undefined}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`chat-focus-target flex gap-2.5 max-w-[88%] ${
                      msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                    }`}
                  >
                    {msg.role === "bot" && (
                      <div className="w-7 h-7 overflow-hidden rounded shrink-0 mt-1">
                        <img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" className="h-full w-auto max-w-none" />
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
                  {currentQuestion && renderChips(currentQIndex)}
                </div>
              );
            })}

            {isTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-2.5 max-w-[80%] mr-auto items-center"
              >
                <div className="w-7 h-7 overflow-hidden rounded shrink-0">
                  <img src={INOBR_LOGO_SRC} alt="Институт непрерывного образования" className="h-full w-auto max-w-none" />
                </div>
                <div className="bg-white border border-border shadow-sm rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={diagnosticResultRef} className="chat-focus-target">
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
              onAskQuestion={() => { showNextStep("input"); setPostDiagnosticState("post-diagnostic-ready"); }}
              onGetConsultation={() => { void handleManagerContactClick(); }}
            />
          )}
          </div>
          {consultantMessages.map((message) => (
            <div key={message.id} ref={message.id === consultantMessages.at(-1)?.id
              ? message.role === "bot" ? latestAssistantMessageRef : latestUserMessageRef : undefined}
              className={`chat-focus-target max-w-[88%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-2xl ${
              message.role === "user" ? "ml-auto bg-primary text-primary-foreground rounded-tr-sm" : "mr-auto bg-white border border-border shadow-sm rounded-tl-sm"
            }`}>
              {message.content}
            </div>
          ))}
          {consultantLoading && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />Готовим ответ...
          </div>}
          {postDiagnosticState === "post-diagnostic-ready" && (
            <div className="rounded-xl border border-border bg-white p-4 space-y-2">
              <Textarea
                ref={postDiagnosticInputRef}
                value={questionDraft}
                disabled={consultantLoading}
                maxLength={1000}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void handleConsultantSubmit();
                  }
                }}
                onChange={(event) => setQuestionDraft(event.target.value)}
                placeholder="Что хотите уточнить?"
                aria-label="Что хотите уточнить?"
                className="chat-focus-target min-h-[80px] text-sm resize-none rounded-xl"
              />
              {consultantError && <p role="alert" className="text-sm text-destructive">{CONSULTANT_ERROR}</p>}
              <Button onClick={() => void handleConsultantSubmit()}
                disabled={consultantLoading || !questionDraft.trim() || !conversationId}
                className="rounded-lg text-sm">
                {consultantLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : consultantError ? "Повторить" : "Отправить"}
              </Button>
            </div>
          )}

          {/* Forms share the same viewport, so long results cannot squeeze them out. */}
          {contactPhase && <div ref={contactFormRef} className="chat-focus-target">{renderContactSection()}</div>}
          <div ref={bottomRef} data-testid="chat-bottom-anchor" className="h-px" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
