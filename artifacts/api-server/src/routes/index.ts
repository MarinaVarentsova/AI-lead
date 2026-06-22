import { Router, type IRouter } from "express";
import healthRouter from "./health";
import diagnosticSessionsRouter from "./diagnostic-sessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(diagnosticSessionsRouter);

export default router;
