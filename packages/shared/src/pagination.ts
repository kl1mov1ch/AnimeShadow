import { z } from "zod";

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  perPage: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
});
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/** Build a `Paginated` envelope from a raw page of results. */
export function paginated<T>(
  items: T[],
  meta: PaginationMeta,
): Paginated<T> {
  return { items, meta };
}
