import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2Icon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import type { CreatePartyInput, StudioId } from "@animeshadow/shared";
import { HonkonGlyph } from "@/components/brand/honkon-glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsPro } from "@/components/promo/promo-offer";
import { apiRequest, ApiRequestError } from "@/lib/api";

export function PartySetupDialog({
  open,
  onClose,
  animeId,
  episode,
  title,
  studio,
}: {
  open: boolean;
  onClose: () => void;
  animeId: number;
  episode: number;
  title: string;
  studio?: StudioId | undefined;
}) {
  const navigate = useNavigate();
  const pro = useIsPro();
  const [name, setName] = useState(() =>
    `${studio ? "Hon-Kon · " : ""}${title}`.slice(0, 80),
  );
  const [capacity, setCapacity] = useState(10);
  const [visibility, setVisibility] = useState<CreatePartyInput["visibility"]>("link");
  const [allControl, setAllControl] = useState(false);
  const [waitForSlow, setWaitForSlow] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {studio ? (
              <HonkonGlyph className="size-8 text-primary" />
            ) : (
              <UsersIcon className="size-5 text-primary" />
            )}
            {studio ? "Комната Hon-Kon Studio" : "Смотреть вместе"}
          </DialogTitle>
          <DialogDescription className="break-words text-xs">
            {title} · серия {episode}
            {studio ? ". Озвучка Hon-Kon закреплена для всех участников." : ""}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !pro) return;
            setBusy(true);
            setError(null);
            void apiRequest<{ code: string }>("/party", {
              method: "POST",
              body: {
                animeId,
                episode,
                name: name.trim() || null,
                capacity,
                visibility,
                allControl,
                waitForSlow,
                autoNext,
                ...(studio ? { studio } : {}),
              } satisfies CreatePartyInput,
            })
              .then(({ code }) => {
                onClose();
                navigate(`/party/${code}`);
              })
              .catch((cause: unknown) => {
                const message =
                  cause instanceof ApiRequestError
                    ? cause.message
                    : "Не удалось создать комнату. Попробуйте ещё раз.";
                setError(message);
                toast.error(message);
              })
              .finally(() => setBusy(false));
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="party-start-name" className="text-xs">
              Название комнаты
            </Label>
            <Input
              id="party-start-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              className="h-10 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="party-start-capacity" className="text-xs">
                Участников, включая вас
              </Label>
              <select
                id="party-start-capacity"
                value={capacity}
                onChange={(event) => setCapacity(Number(event.target.value))}
                className="h-10 min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n} человек
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="party-start-visibility" className="text-xs">
                Кто может войти
              </Label>
              <select
                id="party-start-visibility"
                value={visibility}
                onChange={(event) =>
                  setVisibility(event.target.value as CreatePartyInput["visibility"])
                }
                className="h-10 min-w-0 rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="link">По ссылке</option>
                <option value="friends">Друзья</option>
                <option value="public">Все</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 rounded-xl border border-border p-3">
            {[
              {
                id: "party-start-control",
                label: "Управлять могут все",
                value: allControl,
                change: setAllControl,
              },
              {
                id: "party-start-wait",
                label: "Ждать тех, у кого грузится видео",
                value: waitForSlow,
                change: setWaitForSlow,
              },
              {
                id: "party-start-next",
                label: "Включать следующую серию",
                value: autoNext,
                change: setAutoNext,
              },
            ].map((setting) => (
              <div key={setting.id} className="flex items-center justify-between gap-3">
                <Label htmlFor={setting.id} className="text-xs leading-relaxed">
                  {setting.label}
                </Label>
                <Switch
                  id={setting.id}
                  checked={setting.value}
                  onCheckedChange={setting.change}
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          {pro ? (
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <UsersIcon className="size-4" />
              )}
              Создать комнату
            </Button>
          ) : (
            <div className="grid gap-2">
              <p className="text-xs text-muted-foreground">
                Создание комнаты доступно с PRO. Присоединиться по приглашению могут
                все.
              </p>
              <Button asChild>
                <Link to="/support">Подробнее о PRO</Link>
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
