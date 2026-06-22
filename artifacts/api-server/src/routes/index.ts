import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dictionariesRouter from "./dictionaries";
import sessionsRouter from "./sessions";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import diagnosticAnswersRouter from "./diagnostic-answers";
import knowledgeBaseRouter from "./knowledge-base";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dictionariesRouter);
router.use(sessionsRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(diagnosticAnswersRouter);
router.use(knowledgeBaseRouter);

export default router;
