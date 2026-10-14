import { BellIcon, BellRingIcon, CheckCircle2Icon, Loader2Icon, MonitorSmartphoneIcon, SendIcon, ShieldAlertIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { pushSupport, useNotifyActions, useNotifySettings, useThisBrowserPush } from "@/lib/push";
import { cn } from "@/lib/utils";
import { TelegramGlyph, useTelegramConnect } from "@/components/telegram-connect";

/**
 * Where new episodes are told: the bell on the site (always), the site's
 * Telegram bot, and browser push. Each can be switched off here; the bot
 * also answers /stop.
 */
export function NotifySettingsSection() {
  const { data, isPending } = useNotifySettings();
  const { data: here = false } = useThisBrowserPush();
  const actions = useNotifyActions();
  const { connect: connectTelegram, waiting: waitingBot, pending: linking } = useTelegramConnect();
  const support = pushSupport();
  const permission = typeof Notification !== "undefined" ? Notification.permission : "default";

  if (isPending || !data) {
    return (
      <div className="grid place-items-center py-10">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const tg = data.telegram;
  const push = data.push;
  const tgOn = tg.connected && !tg.blocked && tg.enabled;
  const pushOn = here && push.enabled;

  const setPush = (on: boolean) => {
    if (!on) {
      actions.disablePushHere.mutate(undefined, { onSuccess: () => toast("Push-уведомления в этом браузере выключены") });
      return;
    }
    if (here) {
      actions.toggle.mutate({ push: true });
      return;
    }
    if (!push.publicKey) return;
    actions.enablePush.mutate(push.publicKey, {
      onSuccess: () => toast.success("Push-уведомления включены", { description: "Новые серии придут, даже когда сайт закрыт" }),
      onError: (error) =>
        toast.error(
          error.message === "denied"
            ? "Браузер запретил уведомления для сайта"
            : error.message === "dismissed"
              ? "Вы закрыли запрос браузера"
              : "Не получилось включить push-уведомления",
          error.message === "denied" ? { description: "Разрешите их в настройках сайта (значок замка слева от адреса)" } : undefined,
        ),
    });
  };

  return (
    <div id="notifications" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Когда выходит новая серия аниме из «Смотрю», «В планах» или «Отложено», мы сообщаем об этом — здесь можно выбрать, куда.
      </p>

      {/* The bell: always. */}
      <Row
        tone="amber"
        icon={<BellIcon className="size-5" />}
        title="На сайте"
        hint="Колокольчик в шапке и блок «Новые серии» в «Моём списке»"
        right={<span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-300">Всегда</span>}
      />

      {/* Telegram. */}
      <Row
        tone="sky"
        icon={<TelegramGlyph className="size-5" />}
        title="Telegram"
        hint={
          !tg.available
            ? "Бот ещё не настроен на сервере"
            : tg.blocked
              ? "Бот не может вам написать: он заблокирован или вы не нажали Start"
              : tg.connected
                ? `Сообщения от @${tg.bot ?? "бота"} — отключить можно и командой /stop`
                : "Сообщение от нашего бота со ссылкой на серию"
        }
        right={
          tg.available && tg.connected && !tg.blocked ? (
            <Switch
              checked={tgOn}
              disabled={actions.toggle.isPending}
              onCheckedChange={(on) => actions.toggle.mutate({ telegram: on })}
              aria-label="Новые серии в Telegram"
            />
          ) : null
        }
      >
        {tg.available && (!tg.connected || tg.blocked) && (
          <button
            type="button"
            onClick={connectTelegram}
            disabled={linking}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#2AABEE] px-4 text-sm font-semibold text-white shadow-lg shadow-sky-500/25 transition-transform active:scale-95 disabled:opacity-60"
          >
            {linking ? <Loader2Icon className="size-4 animate-spin" /> : <TelegramGlyph className="size-4" />}
            {tg.blocked ? "Открыть бота и нажать Start" : "Подключить Telegram"}
          </button>
        )}
        {waitingBot && (
          <p className="flex items-center gap-2 text-xs text-sky-600 dark:text-sky-300">
            <Loader2Icon className="size-3.5 animate-spin" />
            Нажмите «Start» в открывшемся боте — мы подхватим это сами
          </p>
        )}
        {tg.available && tg.connected && !tg.blocked && (
          <button
            type="button"
            onClick={() => actions.unlink.mutate(undefined, { onSuccess: () => toast("Бот больше не будет писать о новых сериях") })}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-rose-400"
          >
            <UnlinkIcon className="size-3.5" />
            Отвязать чат
          </button>
        )}
      </Row>

      {/* Browser push. */}
      <Row
        tone="violet"
        icon={<MonitorSmartphoneIcon className="size-5" />}
        title="Push в браузере"
        hint={
          !push.available
            ? "Ещё не настроено на сервере"
            : support === "ios-home-screen"
              ? "На iPhone: «Поделиться» → «На экран Домой», затем откройте сайт с иконки и включите здесь"
              : support === "unsupported"
                ? "Этот браузер не умеет push-уведомления"
                : permission === "denied"
                  ? "Уведомления для сайта запрещены в браузере — разрешите их в настройках сайта (значок замка у адреса)"
                  : `Всплывают, даже когда сайт закрыт${push.devices > 0 ? ` · устройств: ${push.devices}` : ""}`
        }
        right={
          push.available && support === "ok" && permission !== "denied" ? (
            <Switch
              checked={pushOn}
              disabled={actions.enablePush.isPending || actions.disablePushHere.isPending || actions.toggle.isPending}
              onCheckedChange={setPush}
              aria-label="Push-уведомления в этом браузере"
            />
          ) : null
        }
      >
        {push.available && push.devices > 0 && !here && support === "ok" && (
          <p className="text-xs text-muted-foreground">Включено на другом устройстве. Включите переключатель, чтобы получать и здесь.</p>
        )}
        {push.devices > 0 && (
          <button
            type="button"
            onClick={() => actions.toggle.mutate({ push: !push.enabled })}
            className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShieldAlertIcon className="size-3.5" />
            {push.enabled ? "Выключить push на всех устройствах" : "Включить push на всех устройствах"}
          </button>
        )}
      </Row>

      {(tgOn || pushOn) && (
        <button
          type="button"
          disabled={actions.test.isPending}
          onClick={() =>
            actions.test.mutate(undefined, {
              onSuccess: (r) =>
                r.telegram || r.push > 0
                  ? toast.success("Отправили проверку", {
                      description: [r.telegram && "в Telegram", r.push > 0 && "push-уведомлением"].filter(Boolean).join(" и "),
                    })
                  : toast.error("Не дошло", { description: "Проверьте, что бот не заблокирован и уведомления разрешены" }),
            })
          }
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
        >
          {actions.test.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
          Отправить проверку
        </button>
      )}
      {tgOn && pushOn && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-300">
          <CheckCircle2Icon className="size-3.5" />
          Новые серии придут и в Telegram, и в браузер
        </p>
      )}
      {!tgOn && !pushOn && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <BellRingIcon className="size-3.5" />
          Сейчас новые серии видно только на сайте
        </p>
      )}
    </div>
  );
}

const TONES = {
  amber: "bg-amber-500/[0.07] ring-amber-400/20 text-amber-500 dark:text-amber-300",
  sky: "bg-sky-500/[0.07] ring-sky-400/20 text-sky-500 dark:text-sky-300",
  violet: "bg-violet-500/[0.07] ring-violet-400/20 text-violet-500 dark:text-violet-300",
} as const;

function Row({
  tone,
  icon,
  title,
  hint,
  right,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  hint: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-2xl p-3.5 ring-1", TONES[tone])}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-current/10">
          <span className="text-current">{icon}</span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
