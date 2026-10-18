import { z } from "zod";

export const mobileNavigationItemSchema = z.enum([
  "home", "catalog", "search", "rooms", "profile", "library", "notifications",
  "schedule", "collections", "ongoing", "top", "recommendations", "support",
]);
export type MobileNavigationItem = z.infer<typeof mobileNavigationItemSchema>;
export const DEFAULT_MOBILE_NAVIGATION: MobileNavigationItem[] = ["home", "catalog", "search", "rooms", "profile"];
export const mobileNavigationSchema = z.object({
  buttons: z.array(mobileNavigationItemSchema).length(5).refine((items) => new Set(items).size === 5 && items.includes("search"), "Выберите разные кнопки, включая поиск"),
});
export type MobileNavigation = z.infer<typeof mobileNavigationSchema>;

/** Retired shortcuts in older accounts are replaced without losing the other choices. */
export function normalizeMobileNavigation(raw: unknown): MobileNavigation {
  const saved = raw && typeof raw === "object" && "buttons" in raw && Array.isArray(raw.buttons) ? raw.buttons : [];
  const source = saved.length === 4 ? [...saved.slice(0, 2), "search", ...saved.slice(2)] : saved;
  const used = new Set<MobileNavigationItem>();
  const buttons = Array.from({ length: 5 }, (_, index) => {
    const parsed = mobileNavigationItemSchema.safeParse(source[index]);
    if (!parsed.success || used.has(parsed.data)) return null;
    used.add(parsed.data);
    return parsed.data;
  });
  if (!used.has("search")) {
    const position = buttons[2] === null ? 2 : buttons.indexOf(null) >= 0 ? buttons.indexOf(null) : 2;
    if (buttons[position]) used.delete(buttons[position]!);
    buttons[position] = "search";
    used.add("search");
  }
  return { buttons: buttons.map((item) => {
    if (item) return item;
    const replacement = DEFAULT_MOBILE_NAVIGATION.find((id) => !used.has(id))!;
    used.add(replacement);
    return replacement;
  }) };
}

/** Selecting an existing shortcut swaps the two positions rather than duplicating it. */
export function replaceNavigationItem(items: MobileNavigationItem[], index: number, item: MobileNavigationItem): MobileNavigationItem[] {
  if (index < 0 || index >= 5 || items.length !== 5) return items;
  if (items[index] === "search" && !items.includes(item)) return items;
  const next = [...items];
  const previous = next.indexOf(item);
  if (previous >= 0) next[previous] = next[index]!;
  next[index] = item;
  return next;
}
