import { Router, type IRouter } from "express";
import { db, aiSessions } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  const sessionToken = randomUUID();

  const [session] = await db
    .insert(aiSessions)
    .values({ sessionToken })
    .returning();

  req.log.info({ sessionId: session.id }, "Session created");
  res.status(201).json({
    sessionId: session.id,
    sessionToken: session.sessionToken,
  });
});

export default router;
