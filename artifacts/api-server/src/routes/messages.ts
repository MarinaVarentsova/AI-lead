import { Router, type IRouter } from "express";
import { db, aiMessages } from "@workspace/db";
import { SaveMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/messages", async (req, res): Promise<void> => {
  const parsed = SaveMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [message] = await db
    .insert(aiMessages)
    .values({
      conversationId: parsed.data.conversationId,
      role: parsed.data.role,
      content: parsed.data.content,
    })
    .returning();

  res.status(201).json({
    messageId: message.id,
    conversationId: message.conversationId,
  });
});

export default router;
