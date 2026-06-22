import { Router, type IRouter } from "express";
import { db, diagnosticSessionsTable } from "@workspace/db";
import { CreateDiagnosticSessionBody } from "@workspace/api-zod";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.post("/diagnostic-sessions", async (req, res): Promise<void> => {
  const parsed = CreateDiagnosticSessionBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid diagnostic session input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db
    .insert(diagnosticSessionsTable)
    .values({
      question1: parsed.data.question1,
      question2: parsed.data.question2,
      question3: parsed.data.question3,
      question4: parsed.data.question4,
    })
    .returning();

  req.log.info({ sessionId: session.id }, "Diagnostic session saved");
  res.status(201).json({
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    question1: session.question1,
    question2: session.question2,
    question3: session.question3,
    question4: session.question4,
  });
});

router.get("/diagnostic-sessions", async (req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(diagnosticSessionsTable)
    .orderBy(desc(diagnosticSessionsTable.createdAt));

  res.json(
    sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt.toISOString(),
      question1: s.question1,
      question2: s.question2,
      question3: s.question3,
      question4: s.question4,
    }))
  );
});

export default router;
