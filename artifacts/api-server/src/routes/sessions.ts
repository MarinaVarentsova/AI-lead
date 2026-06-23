import { Router, type IRouter } from "express";
import { db, aiSessions } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  const sessionKey = randomUUID();

  try {
    const [session] = await db
      .insert(aiSessions)
      .values({ sessionKey })
      .returning();

    req.log.info({ sessionId: session.id }, "Session created");
    res.status(201).json({
      sessionId: session.id,
      sessionKey: session.sessionKey,
      sessionToken: session.sessionKey,
    });
  } catch (err: unknown) {
    const e = err as Error & { cause?: Error & { code?: string; detail?: string; message?: string } };
    req.log.error({ pgCode: e.cause?.code, pgMessage: e.cause?.message, msg: e.message }, "Session insert failed");
    res.status(500).json({
      error: e.message,
      pgCode: e.cause?.code,
      pgMessage: e.cause?.message,
    });
  }
});

export default router;
