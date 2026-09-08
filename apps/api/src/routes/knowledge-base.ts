import { Router, type IRouter } from "express";
import { knowledgeBaseService } from "../services/KnowledgeBaseService";

const router: IRouter = Router();

/**
 * GET /knowledge-base/status
 * Returns the current availability status of the knowledge base.
 * Useful for health checks and debugging in Phase 2.
 */
router.get("/knowledge-base/status", async (req, res): Promise<void> => {
  const status = await knowledgeBaseService.checkStatus();
  const httpStatus = status.available ? 200 : 503;
  res.status(httpStatus).json(status);
});

export default router;
