export interface ConsultantProviderInput {
  history?: { role: string; message: string }[];
  question: string;
  diagnosticContext: string;
  sourceVersion?: string;
  matchedSections: { id: string; title: string; content: string }[];
  faqMatch?: { id: string; intent: string; policy: "KB" | "MANAGER" | "MIXED"; similarity: number;
    answer: string; kbReference: string };
  professional?: import("@workspace/domain/consultant").ProfessionalIntentResult & { kbSufficient: boolean };
}

export interface ConsultantAIProvider {
  generateConsultantReply(input: ConsultantProviderInput): Promise<string>;
}

export interface ConsultantChatResponse {
  message: string;
  isAI: boolean;
  provider: "yandex" | "fallback";
  matchedSectionIds: string[];
  fallbackReason: string | null;
  faqMatchUsed?: boolean; faqMatchId?: string; faqIntent?: string; faqPolicy?: string;
  faqSimilarity?: number; kbReference?: string;
  sourceVersion?: string;
  webResearchEligible?: boolean; webResearchUsed?: boolean; webResearchIntent?: string;
  webResearchSourceCount?: number; webResearchDomains?: string[]; webResearchLatencyMs?: number;
  webResearchFallbackReason?: string | null;
  webResearchProvider?: "yandex_search_api";
  answerSource?: "faq" | "kb" | "faq_and_kb" | "professional_web" | "mixed" | "manager" | "fallback";
  kbSectionsUsed?: string[]; topLevelDomain?: "PRODUCT" | "PROFESSIONAL" | "MIXED" | "OTHER";
  classifiedIntent?: string | null; webResearchConfigured?: boolean; webResearchAttempted?: boolean;
  yandexAiConfigured?: boolean; yandexSearchConfigured?: boolean; webResearchHttpStatus?: number | null;
}
