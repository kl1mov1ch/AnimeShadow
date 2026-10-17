import { BellIcon, BellRingIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pushSupport, useNotifyActions, useThisBrowserPush } from "@/lib/push";

export function RoomPushButton() {
  const { data: enabled, isLoading } = useThisBrowserPush();
  const { enablePush } = useNotifyActions();
  if (pushSupport() !== "ok") return null;
  return <Button variant="outline" size="sm" className="h-10 rounded-xl text-xs" disabled={isLoading || enablePush.isPending || enabled}
    title={enabled ? "Уведомления о комнате включены" : "Получать приглашения и сообщения о закрытии комнаты"}
    onClick={() => enablePush.mutate(undefined, {
      onSuccess: () => toast.success("Уведомления включены", { description: "Приглашения и сообщения о комнате придут сюда." }),
      onError: (error) => toast.error(error.message === "denied" ? "Браузер заблокировал уведомления" : "Не получилось включить уведомления", {
        description: error.message === "denied" ? "Разрешите их в настройках этого сайта." : "Попробуйте ещё раз позже.",
      }),
    })}>
    {enablePush.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : enabled ? <BellRingIcon data-icon="inline-start" /> : <BellIcon data-icon="inline-start" />}
    <span className="hidden sm:inline">{enabled ? "Включены" : "Уведомления"}</span>
    <span className="sr-only sm:hidden">Уведомления о комнате</span>
  </Button>;
}
