import { pino, type LoggerOptions } from "pino";
import { env, isDevelopment, isProduction } from "../config/env.js";

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  redact: ["req.headers.authorization", "req.headers.cookie", "*.passwordHash"],
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
};

export const logger = pino(options);
export const loggerConfig = { ...options, name: `animeshadow-api:${env.NODE_ENV}` };
