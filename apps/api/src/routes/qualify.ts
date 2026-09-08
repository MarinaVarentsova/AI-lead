/**
 * POST /api/qualify
 *
 * Triggers lead qualification after the diagnostic is complete.
 * 1. Loads conversation history from ai_messages.
 * 2. Asks OpenAI to generate structured qualification JSON.
 * 3. Validates values (no unknown enums).
 * 4. Calculates lead_score on the backend (not by AI).
 * 5. Writes to ai_leads.
 * 6. Returns leadId, score, temperature, brief to the client.
 */
import { Router, type IRouter } from "express";
import { db, aiMessages } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { knowledgeBaseService } from "../services/KnowledgeBaseService";
import { openAIService } from "../services/OpenAIService";
import { leadQualificationService } from "../services/LeadQualificationService";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/qualify", async (req, res): Promise<void> => {
  const { conversationId } = req.body as { conversationId?: unknown };

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  // Load full conversation history
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  const historyForAI = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.message,
  }));

  // Load knowledge base
  const kbEntries = await knowledgeBaseService.loadAll();
  const knowledgeBase = kbEntries.map((e) => e.content).join("\n\n---\n\n");

  // Ask OpenAI for structured qualification JSON
  let rawJson: string;
  try {
    rawJson = await openAIService.qualify({ knowledgeBase, history: historyForAI });
  } catch (err) {
    req.log.error({ err }, "OpenAI qualify error");
    res.status(502).json({ error: "Qualification service temporarily unavailable." });
    return;
  }

  // Score, validate, save to ai_leads
  let result;
  try {
    result = await leadQualificationService.processAndSave({ rawJson, conversationId });
  } catch (err) {
    req.log.error({ err }, "Lead qualification save error");
    res.status(500).json({ error: "Failed to save lead qualification." });
    return;
  }

  res.status(201).json({
    leadId: result.leadId,
    leadScore: result.leadScore,
    leadTemperature: result.leadTemperature,
    qualification: result.qualification,
    aiBrief: result.aiBrief,
  });
});

export default router;
