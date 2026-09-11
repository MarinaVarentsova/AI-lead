import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
/** Runtime-only secret. Hashing gives equal-length buffers for timingSafeEqual. */
export const internalTesterAccess: RequestHandler = (req, res, next) => {
  if (process.env.INTERNAL_TESTER_ENABLED !== "true") {
    res.status(404).json({ error: "TESTER_DISABLED" }); return;
  }
  const expected = process.env.INTERNAL_TESTER_TOKEN?.trim();
  const supplied = req.get("X-Internal-Tester-Token");
  if (!expected || !supplied || !timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(supplied).digest(),
  )) {
    res.status(401).json({ error: "TESTER_UNAUTHORIZED" }); return;
  }
  next();
};
