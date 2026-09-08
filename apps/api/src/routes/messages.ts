import { Router, type IRouter } from "express";
import { db, aiMessages } from "@workspace/db";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ["user", "assistant", "system"] as const;

router.post("/messages", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { conversationId, role, message, step } = body;

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }
  if (typeof role !== "string" || !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    res.status(400).json({ error: "role must be one of: user, assistant, system" });
    return;
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message must be a non-empty string" });
    return;
  }

  try {
    const [saved] = await db
      .insert(aiMessages)
      .values({
        conversationId,
        role,
        message: message.trim(),
        step: typeof step === "string" ? step : null,
      })
      .returning();

    res.status(201).json({
      messageId: saved.id,
      conversationId: saved.conversationId,
    });
  } catch (err: unknown) {
    const e = err as Error & { cause?: Error & { code?: string; message?: string } };
    req.log.error({ msg: e.message }, "Message insert failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
