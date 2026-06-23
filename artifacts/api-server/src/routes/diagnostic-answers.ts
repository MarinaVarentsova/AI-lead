import { Router, type IRouter } from "express";
import { db, aiDiagnosticAnswers, aiConversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SaveDiagnosticAnswersBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/diagnostic-answers", async (req, res): Promise<void> => {
  const parsed = SaveDiagnosticAnswersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { conversationId, answers } = parsed.data;

  const rows = answers.map((a) => ({
    conversationId,
    questionNumber: a.questionNumber,
    questionKey: a.questionKey,
    answerText: a.answerText,
    dictId: a.dictId ?? null,
    isCustom: a.isCustom,
  }));

  await db.insert(aiDiagnosticAnswers).values(rows);

  req.log.info({ conversationId, count: rows.length }, "Diagnostic answers saved");
  res.status(201).json({ saved: rows.length, conversationId });
});

export default router;
