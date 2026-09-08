export interface ConsultantProviderInput {
  question: string;
  diagnosticContext: string;
  matchedSections: { id: string; title: string; content: string }[];
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
}
