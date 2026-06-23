import { Router, type IRouter } from "express";
import { db, aiSessions } from "@workspace/db";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.post("/sessions", async (req, res): Promise<void> => {
  console.log("SESSION START");

  try {
    console.log("STEP 1 — generating token");
    const sessionToken = randomUUID();

    console.log("STEP 2 — inserting into db, token:", sessionToken);
    const [session] = await db
      .insert(aiSessions)
      .values({ sessionToken })
      .returning();

    console.log("STEP 3 — insert OK, session id:", session?.id);
    req.log.info({ sessionId: session.id }, "Session created");
    res.status(201).json({
      sessionId: session.id,
      sessionToken: session.sessionToken,
    });
  } catch (error: unknown) {
    console.error("SESSION ERROR:", error);
    console.error("STACK:", error instanceof Error ? error.stack : String(error));

    const e = error as Error & {
      cause?: Error & { code?: string; detail?: string; message?: string };
    };
    res.status(500).json({
      error: e.message,
      pgCode: e.cause?.code,
      pgMessage: e.cause?.message,
      pgDetail: e.cause?.detail,
    });
  }
});

export default router;
