import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, User, Send, Building2 } from "lucide-react";
import { useCreateDiagnosticSession } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type Message = {
  id: string;
  role: "bot" | "user";
  content: string | React.ReactNode;
};

type Option = {
  label: string;
  id: string;
  isCustom?: boolean;
};

const QUESTIONS = [
  {
    id: "q1",
    botMessage: "Ваш опыт ближе к чему?",
    options: [
      { label: "строительство / ремонт", id: "0" },
      { label: "проектирование / сметы", id: "1" },
      { label: "технадзор / стройконтроль", id: "2" },
      { label: "юриспруденция / оценка / экспертиза", id: "3" },
      { label: "опыта нет", id: "4" },
      { label: "Другое", id: "5", isCustom: true },
    ],
  },
  {
    id: "q2",
    botMessage: "Какой у вас опыт работы?",
    options: [
      { label: "нет опыта", id: "0" },
      { label: "до 3 лет", id: "1" },
      { label: "3–10 лет", id: "2" },
      { label: "более 10 лет", id: "3" },
      { label: "опыт смежный", id: "4" },
      { label: "Другое", id: "5", isCustom: true },
    ],
  },
  {
    id: "q3",
    botMessage: "Какое образование у вас есть?",
    options: [
      { label: "высшее строительное", id: "0" },
      { label: "среднее профессиональное", id: "1" },
      { label: "непрофильное образование", id: "2" },
      { label: "только школа / аттестат", id: "3" },
      { label: "диплом есть, но не на руках", id: "4" },
      { label: "Другое", id: "5", isCustom: true },
    ],
  },
  {
    id: "q4",
    botMessage: "Для чего рассматриваете обучение?",
    options: [
      { label: "дополнительный доход", id: "0" },
      { label: "новая профессия", id: "1" },
      { label: "расширение услуг компании", id: "2" },
      { label: "приемка квартир", id: "3" },
      { label: "строительные экспертизы", id: "4" },
      { label: "Другое", id: "5", isCustom: true },
    ],
  },
];

export function ChatWidget() {
  const [step, setStep] = useState<number>(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  const [customInput, setCustomInput] = useState("");
  const [activeCustomQ, setActiveCustomQ] = useState<string | null>(null);

  const createSession = useCreateDiagnosticSession();

  const scrollToBottom = () => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current;
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth"
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, activeCustomQ]);

  const addBotMessage = (content: string, delay = 400) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "bot", content }]);
    }, delay);
  };

  const handleStart = () => {
    setStep(1);
    addBotMessage(
      "Здравствуйте.\n\nЯ помогу понять, подходит ли вам обучение по строительной экспертизе и какой вариант стоит рассмотреть.\n\nСначала задам 4 коротких вопроса.\n\nЭто займет около 2 минут."
    );
  };

  const handleBeginQuestions = () => {
    setStep(2);
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: "Начать" }]);
    addBotMessage(QUESTIONS[0].botMessage);
  };

  const handleOptionSelect = (qIndex: number, option: Option) => {
    if (option.isCustom) {
      setActiveCustomQ(QUESTIONS[qIndex].id);
      setCustomInput("");
      return;
    }

    submitAnswer(qIndex, option.label);
  };

  const submitCustomAnswer = (qIndex: number) => {
    if (!customInput.trim()) return;
    submitAnswer(qIndex, customInput.trim());
    setActiveCustomQ(null);
  };

  const submitAnswer = (qIndex: number, answer: string) => {
    setAnswers((prev) => ({ ...prev, [QUESTIONS[qIndex].id]: answer }));
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: answer }]);
    
    const nextStep = step + 1;
    setStep(nextStep);

    if (qIndex < QUESTIONS.length - 1) {
      addBotMessage(QUESTIONS[qIndex + 1].botMessage);
    } else {
      // Finished
      setIsTyping(true);
      createSession.mutate(
        {
          data: {
            question1: answers["q1"] || "",
            question2: answers["q2"] || "",
            question3: answers["q3"] || "",
            question4: answer,
          },
        },
        {
          onSettled: () => {
            setIsTyping(false);
            setMessages((prev) => [
              ...prev,
              {
                id: "completion",
                role: "bot",
                content: (
                  <div className="flex flex-col gap-3">
                    <p>Спасибо.</p>
                    <p>Диагностика завершена.</p>
                    <p>Ваши ответы сохранены.</p>
                    <p>На следующем этапе здесь появится персональная рекомендация.</p>
                    <div className="mt-2 flex items-center gap-2 text-primary" data-testid="status-completion">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-medium">Сохранено</span>
                    </div>
                  </div>
                ),
              },
            ]);
          },
        }
      );
    }
  };

  const renderChips = (qIndex: number) => {
    const q = QUESTIONS[qIndex];
    if (step !== qIndex + 2) return null; // +2 because step 0=Launch, 1=Welcome
    if (isTyping) return null;

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap gap-2 mt-4 px-4"
      >
        {q.options.map((opt) => (
          <button
            key={opt.id}
            data-testid={`chip-${q.id}-${opt.id}`}
            onClick={() => handleOptionSelect(qIndex, opt)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${
              activeCustomQ === q.id && opt.isCustom
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/50 hover:bg-accent/50"
            }`}
          >
            {opt.label}
          </button>
        ))}

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
                className="min-h-[80px] text-sm resize-none pr-12 bg-card/50"
                autoFocus
              />
              <Button
                data-testid="button-submit-custom"
                size="icon"
                onClick={() => submitCustomAnswer(qIndex)}
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full"
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

  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] p-6 text-center space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-2 shadow-lg shadow-primary/5 border border-primary/20">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight max-w-[280px] leading-snug">
          Подходит ли вам профессия строительного эксперта?
        </h1>
        <Button
          data-testid="button-start-diagnostic"
          onClick={handleStart}
          size="lg"
          className="rounded-full px-8 text-base shadow-lg shadow-primary/20"
        >
          Начать диагностику
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border/50 flex items-center gap-3 bg-card/50 backdrop-blur-sm z-10">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30 shrink-0">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="font-medium text-sm">ИНОБР Ассистент</h2>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block"></span>
            Консультант онлайн
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30 mt-1">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={`rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-secondary text-secondary-foreground rounded-tl-sm"
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
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0 border border-primary/30">
                  <Building2 className="w-4 h-4 text-primary" />
                </div>
                <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce"></span>
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
                className="rounded-full shadow-md"
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
