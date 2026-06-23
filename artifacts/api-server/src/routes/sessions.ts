import { Router, type IRouter } from "express";
import { db, aiSessions } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  const sessionToken = randomUUID();

  try {
    const [session] = await db
      .insert(aiSessions)
      .values({ sessionToken })
      .returning();

    req.log.info({ sessionId: session.id }, "Session created");
    res.status(201).json({
      sessionId: session.id,
      sessionToken: session.sessionToken,
    });
  } catch (err: unknown) {
    const e = err as Error & { cause?: Error & { code?: string; detail?: string; message?: string } };
    req.log.error({ pgCode: e.cause?.code, pgDetail: e.cause?.detail, pgMessage: e.cause?.message, msg: e.message }, "Session insert failed");
    res.status(500).json({
      error: e.message,
      pgCode: e.cause?.code,
      pgMessage: e.cause?.message,
      pgDetail: e.cause?.detail,
    });
  }
});

export default router;
