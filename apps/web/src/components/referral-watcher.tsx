import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { usePromo } from "@/components/promo/promo-offer";
import { useAuth } from "@/hooks/use-auth";
import { useReferrals } from "@/lib/referral";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Fine — it may say it again.
  }
}

/**
 * Says what happened with one's invites and PRO, once each: a friend came by
 * one's code; a reward is waiting to be taken; PRO ends in three days or
 * less. Nothing renders — notifications only.
 */
export function ReferralWatcher() {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const { data: refs } = useReferrals();
  const { data: promo } = usePromo();
  const uid = status === "authenticated" ? user?.id : undefined;

  // New friends and waiting rewards.
  useEffect(() => {
    if (!uid || !refs) return;
    const open = { label: "Открыть", onClick: () => navigate("/profile?tab=invite") };
    const seenKey = `animeshadow:ref-seen:${uid}`;
    const seen = read(seenKey);
    if (seen != null && refs.friends.total > Number(seen)) {
      const newest = refs.people[0];
      toast.success("По твоему коду пришёл друг!", {
        description: newest ? `${newest.displayName} теперь на AnimeShadow` : "Загляни в приглашения",
        action: open,
      });
    }
    write(seenKey, String(refs.friends.total));

    const ready = refs.rewards.filter((r) => r.claimable);
    const readyKey = `animeshadow:ref-ready:${uid}`;
    const signature = ready.map((r) => r.id).join(",");
    if (ready.length > 0 && read(readyKey) !== signature) {
      toast.info(ready.length === 1 ? "Награда за друзей ждёт" : `Наград за друзей ждут: ${ready.length}`, {
        description: ready.map((r) => r.label).join(" · "),
        action: { label: "Забрать", onClick: () => navigate("/profile?tab=invite") },
      });
      write(readyKey, signature);
    }
  }, [uid, refs, navigate]);

  // PRO about to end.
  useEffect(() => {
    if (!uid || !promo) return;
    const until = promo.phase === "pro" ? promo.proUntil : promo.phase === "trial" ? promo.trialUntil : null;
    if (!until) return;
    const left = new Date(until).getTime() - Date.now();
    if (left <= 0 || left > 3 * 86_400_000) return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `animeshadow:pro-ending:${uid}`;
    if (read(key) === day) return;
    write(key, day);
    const days = Math.max(1, Math.ceil(left / 86_400_000));
    toast.warning(`PRO закончится через ${days} ${days === 1 ? "день" : "дня"}`, {
      description: "Продли его или пригласи друзей — за них дают месяцы PRO",
      action: { label: "Друзья", onClick: () => navigate("/profile?tab=invite") },
    });
  }, [uid, promo, navigate]);

  return null;
}
