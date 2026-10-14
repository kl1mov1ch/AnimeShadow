import { join } from "node:path";
import { env } from "../config/env.js";
import { LogDigest } from "./log-digest.js";

/** The one digest the whole API counts into. */
export const logDigest = new LogDigest(env.LOG_DIR ?? join(process.cwd(), "logs"), env.LOG_KEEP_DAYS);
