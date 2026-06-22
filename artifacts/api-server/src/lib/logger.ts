import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

const baseOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
};

export const logger = isProduction
  ? pino(baseOptions, pino.destination(1))
  : pino({
      ...baseOptions,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
