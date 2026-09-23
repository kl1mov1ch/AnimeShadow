import { CheckIcon, CrownIcon, type LucideIcon, SparklesIcon, TvIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlyphWatermark, HomeButton, HomeContainer, Reveal, SectionHeading, Shine } from "./home-ui";

interface Plan {
  icon: LucideIcon;
  name: string;
  note: string;
  price: string;
  period: string;
  perks: string[];
  cta: string;
  featured?: boolean;
}

const PLANS: Plan[] = [
  {
    icon: TvIcon,
    name: "Базовая",
    note: "Для тех, кто только начинает",
    price: "0 ₽",
    period: "/ навсегда",
    perks: ["Доступ ко всему каталогу", "Просмотр с рекламой", "Качество 720p"],
    cta: "Начать бесплатно",
  },
  {
    icon: SparklesIcon,
    name: "Премиум",
    note: "Лучший выбор для настоящих фанатов",
    price: "299 ₽",
    period: "/ месяц",
    perks: ["Без рекламы", "Максимальное качество", "Быстрый доступ к сериям", "Эксклюзивные тайтлы"],
    cta: "Оформить подписку",
    featured: true,
  },
  {
    icon: CrownIcon,
    name: "VIP",
    note: "Максимум возможностей",
    price: "599 ₽",
    period: "/ месяц",
    perks: ["Все преимущества Премиум", "Ранний доступ к сериям", "Уникальные коллекции", "Приоритетная поддержка"],
    cta: "Оформить подписку",
  },
];

/**
 * The plans, set apart from the rest of the page: a deeper surface, a red
 * bloom behind the middle card and a faint grid over it, so the block reads
 * as its own offer rather than one more row. The middle plan stands taller
 * and carries the badge; every card lifts, warms and catches the light
 * under the pointer.
 */
export function SubscriptionSection() {
  return (
    <section className="relative overflow-hidden border-y border-[var(--hm-border)] bg-[var(--hm-bg-alt)] py-16">
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 70% at 50% 0%, color-mix(in srgb, var(--hm-accent) 22%, transparent), transparent 70%), radial-gradient(40% 60% at 92% 100%, color-mix(in srgb, var(--hm-accent) 12%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(var(--hm-text) 1px, transparent 1px), linear-gradient(90deg, var(--hm-text) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(70% 60% at 50% 40%, #000 30%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(70% 60% at 50% 40%, #000 30%, transparent 78%)",
        }}
      />
      <GlyphWatermark className="-left-16 top-6 text-[15rem] leading-none" />

      <HomeContainer className="relative">
        <Reveal>
          <SectionHeading
            label="Подписка"
            title="Подписка"
            subtitle="Выбирай подходящий план и получай максимум"
            action={{ to: "/support", label: "Сравнить тарифы →" }}
          />
        </Reveal>

        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 110} className={plan.featured ? "lg:-my-3" : undefined}>
              <article
                className={cn(
                  "group/card relative isolate flex h-full flex-col overflow-hidden rounded-2xl border p-5 transition-all duration-500 hover:-translate-y-2",
                  plan.featured
                    ? "border-[var(--hm-accent)] bg-[var(--hm-card-alt)] shadow-[0_28px_70px_-32px_var(--hm-accent)] lg:p-6"
                    : "border-[var(--hm-border)] bg-[var(--hm-card)] hover:border-[var(--hm-accent)]/50",
                )}
              >
                {/* A red wash that grows out of the card's floor on hover. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-0 transition-all duration-500 group-hover/card:h-24"
                  style={{
                    background:
                      "linear-gradient(to top, color-mix(in srgb, var(--hm-accent) 22%, transparent), transparent)",
                  }}
                />
                <Shine className="z-20" />

                {plan.featured && (
                  <span className="absolute right-5 top-5 rounded-lg bg-[var(--hm-accent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Популярный
                  </span>
                )}

                <div className="relative flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid size-10 place-items-center rounded-xl transition-transform duration-500 group-hover/card:-rotate-6 group-hover/card:scale-110",
                      plan.featured
                        ? "bg-[var(--hm-accent)] text-white"
                        : "bg-[var(--hm-accent-soft)] text-[var(--hm-accent)]",
                    )}
                  >
                    <plan.icon className="size-5" />
                  </span>
                  <span>
                    <span className="home-display block text-base text-[var(--hm-text)]">{plan.name}</span>
                    <span className="block text-[11px] text-[var(--hm-muted)]">{plan.note}</span>
                  </span>
                </div>

                <p className="relative mt-6 flex items-baseline gap-1.5">
                  <span
                    className={cn(
                      "home-display text-4xl leading-none",
                      plan.featured ? "text-[var(--hm-accent)]" : "text-[var(--hm-text)]",
                    )}
                  >
                    {plan.price}
                  </span>
                  <span className="text-xs text-[var(--hm-muted)]">{plan.period}</span>
                </p>

                <ul className="relative mt-6 flex flex-1 flex-col gap-2.5">
                  {plan.perks.map((perk) => (
                    <li key={perk} className="flex items-start gap-2 text-sm text-[var(--hm-text)]/85">
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full transition-transform duration-300 group-hover/card:scale-110",
                          plan.featured
                            ? "bg-[var(--hm-accent)] text-white"
                            : "bg-[var(--hm-accent-soft)] text-[var(--hm-accent)]",
                        )}
                      >
                        <CheckIcon className="size-2.5" strokeWidth={3} />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>

                <HomeButton
                  to="/support"
                  variant={plan.featured ? "accent" : "outline"}
                  className="relative mt-7 w-full"
                >
                  {plan.cta}
                </HomeButton>
              </article>
            </Reveal>
          ))}
        </div>

        <p className="relative mt-5 text-center text-xs text-[var(--hm-muted)]">
          Оплата пока не подключена — кнопки ведут на страницу поддержки проекта.
        </p>
      </HomeContainer>
    </section>
  );
}
