import { Router, type IRouter } from "express";
import { internalTesterAccess } from "../tester/access";
import { buildManagerLeadContext, ManagerLeadContextError } from "../services/manager-lead-context";

const router: IRouter = Router();
router.use("/internal/manager-lead-context", internalTesterAccess);
router.get("/internal/manager-lead-context/:sessionId", async (req, res): Promise<void> => {
  try {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(req.params.sessionId)) {
      res.status(404).json({ error: "SESSION_NOT_FOUND" }); return;
    }
    res.json(await buildManagerLeadContext(req.params.sessionId));
  } catch (error) {
    if (error instanceof ManagerLeadContextError) {
      const status = error.code === "SESSION_NOT_FOUND" ? 404 : 409;
      res.status(status).json({ error: error.code }); return;
    }
    req.log.error({ stage: "manager_lead_context", errorCode: "MANAGER_LEAD_CONTEXT_FAILED" },
      "MANAGER_LEAD_CONTEXT_FAILED");
    res.status(500).json({ error: "MANAGER_LEAD_CONTEXT_FAILED" });
  }
});

export default router;
