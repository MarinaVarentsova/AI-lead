/**
 * BitrixService — STUB
 *
 * Bitrix24 integration is NOT active on this phase.
 * This service prepares the payload that will be sent to Bitrix24 in Phase 3.
 *
 * DO NOT add real HTTP calls here yet.
 */
import { logger } from "../lib/logger";

export interface BitrixPayload {
  // Contact
  name: string | null;
  phone: string | null;
  email: string | null;

  // Source
  source: string;
  entryPage: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;

  // Qualification
  leadScore: number;
  leadTemperature: string | null;
  recommendedTrack: string | null;
  mainQuestion: string | null;
  mainObjection: string | null;

  // Content
  conversationTranscript: string;
  aiBrief: string | null;
}

class BitrixService {
  /**
   * Assembles a payload object for Bitrix24 CRM from lead data.
   * Does NOT send anything to Bitrix24 — returns the payload for future use.
   *
   * Phase 3: add `sendLead(payload: BitrixPayload): Promise<string>` that
   * POSTs to the Bitrix24 REST API and logs the result in ai_bitrix_logs.
   */
  prepareBitrixPayload(params: {
    leadId: number;
    name: string | null;
    phone: string | null;
    email: string | null;
    entryPage?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    leadScore: number;
    leadTemperature: string | null;
    recommendedTrack: string | null;
    mainQuestion: string | null;
    mainObjection: string | null;
    conversationTranscript: string;
    aiBrief: string | null;
  }): BitrixPayload {
    const payload: BitrixPayload = {
      name: params.name,
      phone: params.phone,
      email: params.email,
      source: "AI-квалификатор на сайте",
      entryPage: params.entryPage ?? null,
      utmSource: params.utmSource ?? null,
      utmMedium: params.utmMedium ?? null,
      utmCampaign: params.utmCampaign ?? null,
      leadScore: params.leadScore,
      leadTemperature: params.leadTemperature,
      recommendedTrack: params.recommendedTrack,
      mainQuestion: params.mainQuestion,
      mainObjection: params.mainObjection,
      conversationTranscript: params.conversationTranscript,
      aiBrief: params.aiBrief,
    };

    logger.info(
      { leadId: params.leadId, score: params.leadScore },
      "Bitrix payload prepared (not sent — Phase 3)"
    );

    return payload;
  }
}

export const bitrixService = new BitrixService();
