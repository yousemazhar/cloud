import { pino, type Logger } from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: Pick<AppConfig, "backend">): Logger {
  if (config.backend === "aws") {
    return pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: "mini-jira-api" }
    });
  }
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" }
    }
  });
}

export type { Logger };
