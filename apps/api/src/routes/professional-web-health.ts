import { Router, type IRouter, type RequestHandler } from "express";
import { YandexProfessionalWebResearchService, type ProfessionalWebResearchService } from "../ai/professional-web-research";
import { internalTesterAccess } from "../tester/access";

const router: IRouter = Router();
router.use("/internal/professional-web-health", internalTesterAccess);
export function createProfessionalWebHealthHandler(
  service: ProfessionalWebResearchService = new YandexProfessionalWebResearchService(),
): RequestHandler {
  return async (req, res): Promise<void> => {
  const result = await service.research("СП обследование строительных конструкций", "professional_regulations", true);
  const errorType = result.fallbackReason === "search_401" || result.fallbackReason === "search_403" ? "auth" :
    result.fallbackReason === "search_429" ? "quota" : result.fallbackReason === "search_timeout" ? "timeout" :
      result.fallbackReason === "network_error" ? "network" : result.fallbackReason;
  req.log.info({ stage: "professional_web_health", configured: result.configured, provider: result.provider,
    searchApiReachable: result.httpStatus === 200, httpStatus: result.httpStatus, latencyMs: result.latencyMs,
    resultCount: result.sources.length, errorType }, "PROFESSIONAL_WEB_HEALTH");
  res.json({ configured: result.configured, provider: result.provider, searchApiReachable: result.httpStatus === 200,
    httpStatus: result.httpStatus, latencyMs: result.latencyMs, resultCount: result.sources.length,
    errorType: errorType ?? null });
  };
}
router.get("/internal/professional-web-health", createProfessionalWebHealthHandler());

export default router;
