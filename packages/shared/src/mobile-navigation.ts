import { z } from "zod";

export const mobileNavigationItemSchema = z.enum([
  "home", "catalog", "rooms", "profile", "library", "notifications",
  "schedule", "collections", "ongoing", "top", "settings", "recommendations", "support",
]);
export type MobileNavigationItem = z.infer<typeof mobileNavigationItemSchema>;
export const DEFAULT_MOBILE_NAVIGATION: MobileNavigationItem[] = ["home", "catalog", "rooms", "profile"];
export const mobileNavigationSchema = z.object({
  buttons: z.array(mobileNavigationItemSchema).length(4).refine((items) => new Set(items).size === 4, "Кнопки не должны повторяться"),
});
export type MobileNavigation = z.infer<typeof mobileNavigationSchema>;

/** Retired shortcuts in older accounts are replaced without losing the other choices. */
export function normalizeMobileNavigation(raw: unknown): MobileNavigation {
  const source = raw && typeof raw === "object" && "buttons" in raw && Array.isArray(raw.buttons) ? raw.buttons : [];
  const used = new Set<MobileNavigationItem>();
  const buttons = Array.from({ length: 4 }, (_, index) => {
    const parsed = mobileNavigationItemSchema.safeParse(source[index]);
    if (!parsed.success || used.has(parsed.data)) return null;
    used.add(parsed.data);
    return parsed.data;
  });
  return { buttons: buttons.map((item) => {
    if (item) return item;
    const replacement = DEFAULT_MOBILE_NAVIGATION.find((id) => !used.has(id))!;
    used.add(replacement);
    return replacement;
  }) };
}

/** Selecting an existing shortcut swaps the two positions rather than duplicating it. */
export function replaceNavigationItem(items: MobileNavigationItem[], index: number, item: MobileNavigationItem): MobileNavigationItem[] {
  if (index < 0 || index >= 4 || items.length !== 4) return items;
  const next = [...items];
  const previous = next.indexOf(item);
  if (previous >= 0) next[previous] = next[index]!;
  next[index] = item;
  return next;
}
