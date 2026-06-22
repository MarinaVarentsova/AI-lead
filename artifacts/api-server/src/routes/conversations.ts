import { Router, type IRouter } from "express";
import { db, aiConversations } from "@workspace/db";
import { CreateConversationBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/conversations", async (req, res): Promise<void> => {
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [conversation] = await db
    .insert(aiConversations)
    .values({ sessionId: parsed.data.sessionId })
    .returning();

  req.log.info({ conversationId: conversation.id }, "Conversation created");
  res.status(201).json({
    conversationId: conversation.id,
    sessionId: conversation.sessionId,
  });
});

export default router;
