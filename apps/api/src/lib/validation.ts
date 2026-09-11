import type { z } from "zod";
import { ValidationError } from "./errors.js";

/**
 * Parse untrusted input at the route boundary. On failure, throw a
 * `ValidationError` carrying field-keyed messages the frontend forms consume.
 */
export function parse<Schema extends z.ZodTypeAny>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  throw new ValidationError(fields);
}
