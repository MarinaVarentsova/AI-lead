/**
 * POST /api/chat
 *
 * Main AI chat endpoint.
 * 1. Saves the user message to ai_messages.
 * 2. Loads conversation history from ai_messages.
 * 3. Calls OpenAI with KB + history + user message.
 * 4. Saves AI response to ai_messages.
 * 5. Returns AI reply to the client.
 */
import { Router, type IRouter } from "express";
import { db, aiMessages } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { knowledgeBaseService } from "../services/KnowledgeBaseService";
import { openAIService } from "../services/OpenAIService";

const router: IRouter = Router();

router.post("/chat", async (req, res): Promise<void> => {
  const { conversationId, content } = req.body as {
    conversationId?: unknown;
    content?: unknown;
  };

  if (typeof conversationId !== "number" || !Number.isInteger(conversationId) || conversationId <= 0) {
    res.status(400).json({ error: "conversationId must be a positive integer" });
    return;
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content must be a non-empty string" });
    return;
  }
  if (content.length > 4000) {
    res.status(400).json({ error: "content too long (max 4000 chars)" });
    return;
  }

  const trimmedContent = content.trim();

  // 1. Save user message
  await db.insert(aiMessages).values({
    conversationId,
    role: "user",
    content: trimmedContent,
  });

  // 2. Load conversation history (all prior messages)
  const history = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  // Exclude last message (just inserted) for clean handoff to AI
  const historyForAI = history.slice(0, -1).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // 3. Load knowledge base
  const kbEntries = await knowledgeBaseService.loadAll();
  const knowledgeBase = kbEntries.map((e) => e.content).join("\n\n---\n\n");

  // 4. Call OpenAI
  let reply: string;
  try {
    reply = await openAIService.chat({
      knowledgeBase,
      history: historyForAI,
      userMessage: trimmedContent,
    });
  } catch (err) {
    req.log.error({ err }, "OpenAI chat error");
    res.status(502).json({ error: "AI service temporarily unavailable. Please try again." });
    return;
  }

  // 5. Save AI response
  const [savedReply] = await db
    .insert(aiMessages)
    .values({ conversationId, role: "assistant", content: reply })
    .returning();

  res.status(200).json({
    reply,
    messageId: savedReply.id,
    conversationId,
  });
});

export default router;
