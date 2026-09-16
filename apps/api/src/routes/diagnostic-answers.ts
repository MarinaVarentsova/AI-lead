import { Router, type IRouter } from "express";
import { db, aiDiagnosticAnswers, aiConversations } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DiagnosticKnowledgeResolver, DiagnosticValidationError, type DiagnosticAnswers } from "@workspace/domain/diagnostic";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/diagnostic-answers", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { conversationId } = body;

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  const answers: DiagnosticAnswers = { current_area: body.current_area as string,
    current_area_other_text: body.current_area_other_text as string | null | undefined,
    current_role: body.current_role as string, education_status: body.education_status as string,
    target_tasks: body.target_tasks as string };

  try {
    DiagnosticKnowledgeResolver.resolve(answers);
    // Until the additive DB migration block, the unchanged physical columns are storage slots only.
    const values = { conversationId, experienceArea: answers.current_area,
      experienceAreaRaw: answers.current_area_other_text ?? null, experienceYears: answers.current_role,
      experienceYearsRaw: null, educationType: answers.education_status, educationTypeRaw: null,
      goal: answers.target_tasks, goalRaw: null };
    await db
      .insert(aiDiagnosticAnswers)
      .values(values)
      .onConflictDoUpdate({
        target: aiDiagnosticAnswers.conversationId,
        set: {
          experienceArea: values.experienceArea,
          experienceAreaRaw: values.experienceAreaRaw,
          experienceYears: values.experienceYears,
          experienceYearsRaw: values.experienceYearsRaw,
          educationType: values.educationType,
          educationTypeRaw: values.educationTypeRaw,
          goal: values.goal,
          goalRaw: values.goalRaw,
          updatedAt: new Date(),
        },
      });

    await db
      .update(aiConversations)
      .set({ status: "diagnostic_completed", currentStep: "diagnostic_completed", updatedAt: new Date() })
      .where(eq(aiConversations.id, conversationId));

    req.log.info({ conversationId }, "Diagnostic answers saved");
    res.status(201).json({ saved: true, conversationId });
  } catch (err: unknown) {
    if (err instanceof DiagnosticValidationError) { res.status(400).json({ error: err.code, issues: err.issues }); return; }
    const e = err as Error & { cause?: Error & { code?: string; message?: string } };
    req.log.error(
      { pgCode: e.cause?.code, pgMessage: e.cause?.message, msg: e.message },
      "Diagnostic answers save failed"
    );
    res.status(500).json({ error: e.message, pgCode: e.cause?.code, pgMessage: e.cause?.message });
  }
});

export default router;
