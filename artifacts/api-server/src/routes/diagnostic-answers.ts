import { Router, type IRouter } from "express";
import { db, aiDiagnosticAnswers, aiConversations } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

router.post("/diagnostic-answers", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const { conversationId } = body;

  if (typeof conversationId !== "string" || !UUID_RE.test(conversationId)) {
    res.status(400).json({ error: "conversationId must be a valid UUID" });
    return;
  }

  const values = {
    conversationId,
    experienceArea: str(body.experienceArea),
    experienceAreaRaw: str(body.experienceAreaRaw),
    experienceYears: str(body.experienceYears),
    experienceYearsRaw: str(body.experienceYearsRaw),
    educationType: str(body.educationType),
    educationTypeRaw: str(body.educationTypeRaw),
    goal: str(body.goal),
    goalRaw: str(body.goalRaw),
  };

  try {
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
    const e = err as Error & { cause?: Error & { code?: string; message?: string } };
    req.log.error(
      { pgCode: e.cause?.code, pgMessage: e.cause?.message, msg: e.message },
      "Diagnostic answers save failed"
    );
    res.status(500).json({ error: e.message, pgCode: e.cause?.code, pgMessage: e.cause?.message });
  }
});

export default router;
