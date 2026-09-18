import { Router, type IRouter } from "express";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db, aiTestRuns, aiTestCases } from "@workspace/db";
import { createArtemRuntime, getArtemRuntime } from "../ai/artem-runtime";
import { YandexAIProvider } from "../ai/yandex-provider";
import { runTester, aggregate, normalizeStoredCase, TESTER_AI_TIMEOUT_MS } from "../tester/runner";
import { validateRunCount, type Persona } from "../tester/personas";
import { nextIteration } from "../tester/run-assessment";
import { internalTesterAccess } from "../tester/access";
import { generateStressPersonas, TESTER_MODE_DESCRIPTIONS, validateTesterMode, type TesterMode } from "../tester/stress-modes";
const router: IRouter = Router();
router.use("/tester", internalTesterAccess);
router.post("/tester/runs", async (req, res) => {
  let count: number;
  try { count = validateRunCount(req.body?.count ?? 10); } catch { res.status(400).json({ error: "Choose 1–10 cases." }); return; }
  let mode: TesterMode;
  try { mode = validateTesterMode(req.body?.mode ?? "Адекват"); } catch { res.status(400).json({ error: "INVALID_TESTER_MODE" }); return; }
  try {
    const parentRunId: unknown = req.body?.parentRunId;
    let iterationNumber = 1;
    let personas: Persona[] | undefined;
    if (parentRunId !== undefined && parentRunId !== null) {
      if (typeof parentRunId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(parentRunId)) {
        res.status(400).json({ error: "INVALID_PARENT_RUN" }); return;
      }
      const [parent] = await db.select().from(aiTestRuns).where(eq(aiTestRuns.id, parentRunId)).limit(1);
      if (!parent) { res.status(404).json({ error: "PARENT_RUN_NOT_FOUND" }); return; }
      try { mode = validateTesterMode((parent.summary as { mode?: unknown } | null)?.mode ?? "Адекват"); }
      catch { res.status(409).json({ error: "PARENT_MODE_UNAVAILABLE" }); return; }
      try { iterationNumber = nextIteration(parent); } catch { res.status(400).json({ error: "INVALID_PARENT_ITERATION" }); return; }
      const previousCases = await db.select({ persona: aiTestCases.persona }).from(aiTestCases)
        .where(eq(aiTestCases.runId, parent.id)).orderBy(asc(aiTestCases.caseNumber));
      count = parent.requestedCases;
      personas = previousCases.map(row => row.persona as Persona);
      if (personas.length !== count || personas.some(p => !p?.answers || !Array.isArray(p.questions) || p.questions.length < 1 || p.questions.length > 3)) {
        res.status(409).json({ error: "PARENT_CASES_UNAVAILABLE" }); return;
      }
    }
    const sharedRuntime = await getArtemRuntime();
    const runtime = createArtemRuntime(sharedRuntime.markdown,
      new YandexAIProvider({ ...process.env, AI_REQUEST_TIMEOUT_MS: String(TESTER_AI_TIMEOUT_MS) }));
    let generatorSource: "ai" | "fallback" | "continued" = personas ? "continued" : "ai";
    // A stopped process cannot resume its in-memory worker. The three-hour bound
    // covers 10 sequential cases, three attempts per AI stage and 45s timeouts.
    await db.update(aiTestRuns).set({ status: "failed", completedAt: new Date(), summary: { error: "RUN_INTERRUPTED" } })
      .where(and(eq(aiTestRuns.status, "running"), lt(aiTestRuns.startedAt, new Date(Date.now() - 3 * 60 * 60_000))));
    const [run] = await db.insert(aiTestRuns).values({ status: "running", requestedCases: count,
      parentRunId: typeof parentRunId === "string" ? parentRunId : null, iterationNumber,
      summary: { mode, modeDescription: TESTER_MODE_DESCRIPTIONS[mode],
        generatorSource: personas ? "continued" : "pending", modeSpecificSummary: "Серия выполняется" },
      knowledgeVersion: runtime.resolver.resolve({ question: "Стройэксперт" }).sourceVersion }).returning();
    if (!run) throw new Error("RUN_NOT_SAVED");
    res.status(202).json(run);
    void (async () => {
      let runPersonas = personas;
      if (!runPersonas) {
        const generated = await generateStressPersonas(count, mode, runtime.provider);
        runPersonas = generated.personas; generatorSource = generated.source;
        await db.update(aiTestRuns).set({ summary: { mode, modeDescription: TESTER_MODE_DESCRIPTIONS[mode],
          generatorSource, modeSpecificSummary: "Серия выполняется" } }).where(eq(aiTestRuns.id, run.id));
      }
      return runTester(count, runtime, {
        async saveCase(value) {
          const { stage, errorCode, errorDetail, attempts, ...stored } = value;
          const errorMessage = value.verdict === "TECH_ERROR" && errorCode
            ? JSON.stringify({ stage, errorCode, errorDetail, attempts, artemResponseSaved: value.transcript.some(turn => turn.role === "assistant") }) : stored.errorMessage;
          await db.insert(aiTestCases).values({ ...stored, errorMessage, runId: run.id, completedAt: new Date() });
        },
        async progress(completedCases) { await db.update(aiTestRuns).set({ completedCases }).where(eq(aiTestRuns.id, run.id)); },
        async finish(summary) { await db.update(aiTestRuns).set({ status: "completed",
          summary: { ...(summary as Record<string, unknown>), mode, modeDescription: TESTER_MODE_DESCRIPTIONS[mode], generatorSource },
          completedAt: new Date() }).where(eq(aiTestRuns.id, run.id)); },
      }, runPersonas, {}, mode);
    })().catch(async () => {
      req.log.error({ runId: run.id }, "TESTER_RUN_FAILED");
      try { await db.update(aiTestRuns).set({ status: "failed", completedAt: new Date(),
        summary: { error: "RUN_STORAGE_FAILED", mode, modeDescription: TESTER_MODE_DESCRIPTIONS[mode], generatorSource } }).where(eq(aiTestRuns.id, run.id)); }
      catch { req.log.error({ runId: run.id }, "TESTER_STATUS_SAVE_FAILED"); }
    });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    if (code === "23505") { res.status(409).json({ error: "RUN_ALREADY_ACTIVE" }); return; }
    req.log.error("TESTER_START_FAILED"); res.status(503).json({ error: "TESTER_STORAGE_UNAVAILABLE: apply the additive SQL first." });
  }
});
router.get("/tester/runs", async (_req, res) => {
  try { res.json(await db.select().from(aiTestRuns).orderBy(desc(aiTestRuns.startedAt)).limit(10)); }
  catch { res.status(503).json({ error: "TESTER_STORAGE_UNAVAILABLE" }); }
});
router.get("/tester/runs/:id", async (req, res) => {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.id)) { res.status(400).json({ error: "INVALID_RUN_ID" }); return; }
  try {
    const [run] = await db.select().from(aiTestRuns).where(eq(aiTestRuns.id, req.params.id)).limit(1);
    if (!run) { res.status(404).json({ error: "RUN_NOT_FOUND" }); return; }
    const cases = (await db.select().from(aiTestCases).where(eq(aiTestCases.runId, run.id)).orderBy(asc(aiTestCases.caseNumber))).map(normalizeStoredCase);
    const displayRun = { ...run, summary: run.summary ? { ...(run.summary as Record<string, unknown>), ...aggregate(cases) } : null };
    let parentRun = null;
    if (run.parentRunId) {
      const [parent] = await db.select().from(aiTestRuns).where(eq(aiTestRuns.id, run.parentRunId)).limit(1);
      if (parent) {
        const parentCases = (await db.select().from(aiTestCases).where(eq(aiTestCases.runId, parent.id))).map(normalizeStoredCase);
        parentRun = { ...parent, summary: parent.summary ? { ...(parent.summary as Record<string, unknown>), ...aggregate(parentCases) } : null };
      }
    }
    res.json({ run: displayRun, cases, parentRun });
  } catch { res.status(503).json({ error: "TESTER_STORAGE_UNAVAILABLE" }); }
});
export default router;
