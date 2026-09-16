import { Router, type IRouter } from "express";
import { DIAGNOSTIC_SCHEMA } from "@workspace/domain/diagnostic";

const router: IRouter = Router();
router.get("/diagnostic/schema", (_req, res) => {
  res.status(200).json(DIAGNOSTIC_SCHEMA);
});
export default router;
