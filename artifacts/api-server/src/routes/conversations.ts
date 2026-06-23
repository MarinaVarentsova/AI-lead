import { Router, type IRouter } from "express";
import { db, aiConversations } from "@workspace/db";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/conversations", async (req, res): Promise<void> => {
  const { sessionId } = req.body as Record<string, unknown>;

  if (typeof sessionId !== "string" || !UUID_RE.test(sessionId)) {
    res.status(400).json({ error: "sessionId must be a valid UUID" });
    return;
  }

  try {
    const [conversation] = await db
      .insert(aiConversations)
      .values({
        sessionId,
        status: "diagnostic_in_progress",
        currentStep: "experience_area",
      })
      .returning();

    req.log.info({ conversationId: conversation.id }, "Conversation created");
    res.status(201).json({
      conversationId: conversation.id,
      sessionId: conversation.sessionId,
      currentStep: conversation.currentStep,
    });
  } catch (err: unknown) {
    const e = err as Error & { cause?: Error & { code?: string; message?: string } };
    req.log.error(
      { pgCode: e.cause?.code, pgMessage: e.cause?.message, msg: e.message },
      "Conversation insert failed"
    );
    res.status(500).json({ error: e.message, pgCode: e.cause?.code, pgMessage: e.cause?.message });
  }
});

export default router;
