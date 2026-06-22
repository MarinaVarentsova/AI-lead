/**
 * OpenAIService
 *
 * Calls OpenAI Chat Completions API using Node.js built-in fetch (Node 24).
 * No external SDK required.
 *
 * OPENAI_API_KEY is read from env — never logged, never sent to frontend.
 * AI answers only from the provided KB + conversation history.
 * No internet search is performed.
 */
import { logger } from "../lib/logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatReplyOptions {
  knowledgeBase: string;
  history: ChatMessage[];
  userMessage: string;
}

export interface QualifyOptions {
  knowledgeBase: string;
  history: ChatMessage[];
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIRequestBody {
  model: string;
  messages: OpenAIMessage[];
  max_tokens: number;
  temperature: number;
  response_format?: { type: "json_object" };
}

interface OpenAIResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  error?: { message: string; type: string };
}

// ─── System prompts ───────────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `Ты AI-консультант ИНОБР — института дополнительного профессионального образования.

Твоя роль:
- Помочь посетителю понять, подходит ли ему направление «Строительная экспертиза».
- Провести мини-диагностику из 4 вопросов.
- Ответить на типовые вопросы по программам обучения.
- Подготовить данные для квалификации лида.

Правила:
- Отвечай ТОЛЬКО на основании Базы знаний, предоставленной ниже.
- Не используй внешние знания, интернет, домыслы.
- Не придумывай тарифы, сроки, документы, скидки, гарантии.
- Не обещай заработок, трудоустройство, конкретный судебный результат.
- Не давай юридических гарантий.
- Не закрывай клиента на оплату — это задача менеджера.
- Если ответа нет в Базе знаний, отвечай строго:
  «В моей базе нет точной информации по этому вопросу. Я передам его менеджеру, чтобы он ответил корректно.»

Стиль общения:
- Спокойно, профессионально, без давления.
- Без инфобизнесового тона, без агрессивных продаж.
- Кратко, но не сухо. Уважительно к опыту клиента.

НЕ ИСПОЛЬЗУЙ: «уникальная возможность», «только сегодня», «гарантированный доход»,
«успейте», «мест осталось мало», «суд точно примет», «клиенты у вас будут».

Диагностика: строго 4 вопроса (опыт → стаж → образование → цель).
Отвечай на русском языке.`;

const QUALIFICATION_SYSTEM_PROMPT = `Ты AI-квалификатор лида для ИНОБР.

На основании диалога определи характеристики пользователя и верни ТОЛЬКО валидный JSON без пояснений, без markdown, без текста до или после.

Поля и допустимые значения:
education_type: higher_technical | secondary_technical | non_profile | school_only | diploma_not_available | need_clarification
experience_area: construction | design | supervision | legal_expertise | no_experience | other
experience_years: none | up_to_3 | from_3_to_10 | more_than_10 | related_experience | need_clarification
goal: extra_income | new_profession | expand_services | apartment_acceptance | construction_expertise | research_only
recommended_track: sste | apartment_acceptance | sste_plus_acceptance | ijs | need_manager_review
recommended_tariff: basic | standard | premium | premium_ijs | not_defined
main_question: (строка — краткое описание главного вопроса или пустая строка)
main_objection: expensive | no_orders | no_time | education_doubt | compare_competitors | other | none
installment_interest: true | false
start_readiness: now | this_month | later | just_researching | unknown
contact_channel: phone | whatsapp | telegram | max | email | unknown
manager_note: (строка — краткая рекомендация менеджеру)

ВАЖНО: если education_type = school_only, то recommended_track = apartment_acceptance, recommended_tariff = not_defined, и в manager_note обязательно: "У клиента только аттестат. ССТЭ / ДПО не предлагать как основной вариант."

Верни ТОЛЬКО JSON, никакого другого текста.`;

// ─── API call helper ──────────────────────────────────────────────────────────

async function callOpenAI(body: OpenAIRequestBody): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err.slice(0, 300)}`);
  }

  const data = (await response.json()) as OpenAIResponse;

  if (data.error) {
    throw new Error(`OpenAI error: ${data.error.message}`);
  }

  return data.choices[0]?.message?.content ?? "";
}

// ─── Service ──────────────────────────────────────────────────────────────────

class OpenAIService {
  /**
   * Send a user message with KB context and history.
   * Returns AI text reply. Saves nothing — caller handles persistence.
   */
  async chat(options: ChatReplyOptions): Promise<string> {
    const { knowledgeBase, history, userMessage } = options;

    const systemContent = `${BASE_SYSTEM_PROMPT}\n\n---\nБАЗА ЗНАНИЙ:\n${knowledgeBase}`;

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemContent },
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

    logger.debug(
      { historyLen: history.length, userMsgLen: userMessage.length },
      "OpenAI chat request"
    );

    const reply = await callOpenAI({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 800,
      temperature: 0.4,
    });

    logger.debug({ replyLen: reply.length }, "OpenAI chat reply received");
    return reply;
  }

  /**
   * Ask OpenAI to generate structured qualification JSON from conversation history.
   * Returns raw JSON string — validation/scoring done by LeadQualificationService.
   */
  async qualify(options: QualifyOptions): Promise<string> {
    const { knowledgeBase, history } = options;

    const systemContent = `${QUALIFICATION_SYSTEM_PROMPT}\n\n---\nБАЗА ЗНАНИЙ:\n${knowledgeBase}`;

    const historyText = history
      .map((m) => `${m.role === "user" ? "Пользователь" : "AI"}: ${m.content}`)
      .join("\n");

    const messages: OpenAIMessage[] = [
      { role: "system", content: systemContent },
      {
        role: "user",
        content: `Диалог:\n${historyText}\n\nСгенерируй JSON квалификации.`,
      },
    ];

    logger.debug({ historyLen: history.length }, "OpenAI qualify request");

    const raw = await callOpenAI({
      model: "gpt-4o-mini",
      messages,
      max_tokens: 600,
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    logger.debug({ rawLen: raw.length }, "OpenAI qualify response received");
    return raw;
  }
}

export const openAIService = new OpenAIService();
