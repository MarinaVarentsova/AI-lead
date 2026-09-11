import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { db, aiTestRuns, aiTestCases } from "@workspace/db";
import { getArtemRuntime } from "../ai/artem-runtime";
import { runTester } from "../tester/runner";
import { validateRunCount } from "../tester/personas";
const router: IRouter = Router();
// Mount future internal authorization here. This enable switch is NOT authentication.
const internalAccess: RequestHandler = (_req, res, next) => {
  if (process.env.INTERNAL_TESTER_ENABLED !== "true") { res.status(404).json({ error: "TESTER_DISABLED" }); return; }
  next();
};
router.use("/tester", internalAccess);
router.post("/tester/runs", async (req, res) => {
  let count: number;
  try { count = validateRunCount(req.body?.count ?? 10); } catch { res.status(400).json({ error: "Choose 1–10 cases." }); return; }
  try {
    const runtime = await getArtemRuntime();
    // A stopped process cannot resume its in-memory worker. Only expire runs beyond
    // the bounded maximum duration (51 AI calls, at most 60s each plus storage).
    await db.update(aiTestRuns).set({ status: "failed", completedAt: new Date(), summary: { error: "RUN_INTERRUPTED" } })
      .where(and(eq(aiTestRuns.status, "running"), lt(aiTestRuns.startedAt, new Date(Date.now() - 90 * 60_000))));
    const [run] = await db.insert(aiTestRuns).values({ status: "running", requestedCases: count,
      knowledgeVersion: runtime.resolver.resolve({ question: "Стройэксперт" }).sourceVersion }).returning();
    if (!run) throw new Error("RUN_NOT_SAVED");
    res.status(202).json(run);
    void runTester(count, runtime, {
      async saveCase(value) { await db.insert(aiTestCases).values({ ...value, runId: run.id, completedAt: new Date() }); },
      async progress(completedCases) { await db.update(aiTestRuns).set({ completedCases }).where(eq(aiTestRuns.id, run.id)); },
      async finish(summary) { await db.update(aiTestRuns).set({ status: "completed", summary, completedAt: new Date() }).where(eq(aiTestRuns.id, run.id)); },
    }).catch(async () => {
      req.log.error({ runId: run.id }, "TESTER_RUN_FAILED");
      try { await db.update(aiTestRuns).set({ status: "failed", completedAt: new Date(), summary: { error: "RUN_STORAGE_FAILED" } }).where(eq(aiTestRuns.id, run.id)); }
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
    const cases = await db.select().from(aiTestCases).where(eq(aiTestCases.runId, run.id)).orderBy(asc(aiTestCases.caseNumber));
    res.json({ run, cases });
  } catch { res.status(503).json({ error: "TESTER_STORAGE_UNAVAILABLE" }); }
});
export default router;
