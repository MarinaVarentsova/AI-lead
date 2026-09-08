import app from "./app";
import { logger } from "./lib/logger";
import { knowledgeBaseService } from "./services/KnowledgeBaseService";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Log knowledge base availability on startup
  knowledgeBaseService.checkStatus().then((status) => {
    if (status.available) {
      logger.info({ source: status.source, entries: status.entryCount }, "Knowledge base ready");
    } else {
      logger.warn({ source: status.source, error: status.error }, "Knowledge base unavailable");
    }
  });
});
