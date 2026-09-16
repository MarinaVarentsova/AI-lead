import { Router, type IRouter } from "express";
import healthRouter from "./health";
import sessionsRouter from "./sessions";
import conversationsRouter from "./conversations";
import messagesRouter from "./messages";
import diagnosticAnswersRouter from "./diagnostic-answers";
import diagnosticSchemaRouter from "./diagnostic-schema";
import knowledgeBaseRouter from "./knowledge-base";
import diagnoseRouter from "./diagnose";
import contactsRouter from "./contacts";
import consultantChatRouter from "./consultant-chat";

import testerRouter from "./tester";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sessionsRouter);
router.use(conversationsRouter);
router.use(messagesRouter);
router.use(diagnosticAnswersRouter);
router.use(diagnosticSchemaRouter);
router.use(knowledgeBaseRouter);
router.use(diagnoseRouter);
router.use(contactsRouter);
router.use(consultantChatRouter);
router.use(testerRouter);

export default router;
