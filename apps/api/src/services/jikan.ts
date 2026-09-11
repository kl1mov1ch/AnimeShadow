import { JikanClient } from "@animeshadow/jikan";
import { env } from "../config/env.js";

/** Process-wide Jikan client — its internal queue enforces the rate limit. */
export const jikan = new JikanClient({ baseUrl: env.JIKAN_BASE_URL });
