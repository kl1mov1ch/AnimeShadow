import type { PublicProfile } from "@animeshadow/shared";
import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { FollowKind } from "@animeshadow/shared";
import { useSocial, useUserCollections, useUserList } from "@/lib/query";
import { useProfileAccentStyle } from "../profile-accent";
import { jumpTo } from "../profile-level";
import type { ProfileTaskActions } from "../profile-progression";
import type { StudioTab } from "../profile-studio";
import { useProfileMedia } from "../use-profile-media";
import { STATUS_ORDER, type ListStatus } from "./format";
import { PlayerStrip, ProfileStage, ProfileTabs, type TabDef } from "./profile-stage";
import { ActivityTab } from "./tab-activity";
import { CollectionsTab } from "./tab-collections";
import { ListTab } from "./tab-list";
import { OverviewTab } from "./tab-overview";
import { PeopleTab } from "./social";
import { TrophiesTab } from "./tab-trophies";

type Tab = "overview" | "people" | "list" | "trophies" | "activity" | "collections";
const TABS: Tab[] = ["overview", "people", "list", "trophies", "activity", "collections"];
const KINDS: FollowKind[] = ["friends", "followers", "following"];

/**
 * A profile, from the top: the stage (cover, avatar with its level, name,
 * bio, pinned achievements, actions), the player strip (level and the
 * headline numbers), then tabs — overview, list, trophies, activity,
 * collections. The open tab is in the address (?tab=, and ?status= for the
 * list), so a link opens the profile where it was, and only the open tab is
 * built and loaded.
 */
export function ProfileView({
  profile,
  own,
  onCustomise,
}: {
  profile: PublicProfile;
  own: boolean;
  onCustomise?: (tab?: StudioTab) => void;
}) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const style = useProfileAccentStyle(profile);
  // Unconditional, as hooks must be: on someone else's profile it simply
  // never gets a button wired to it.
  const media = useProfileMedia(profile);
  const tab: Tab = TABS.find((t) => t === params.get("tab")) ?? "overview";
  const rawStatus = params.get("status");
  const status: ListStatus | "ALL" = STATUS_ORDER.find((s) => s === rawStatus) ?? "ALL";
  const kind: FollowKind = KINDS.find((k) => k === params.get("people")) ?? "friends";
  const { data: social } = useSocial(profile.id);

  // For the counts on the tabs; both are small and shared with the tabs.
  const { data: list } = useUserList(profile.id, !profile.hidden.list);
  const { data: collections } = useUserCollections(profile.id);

  const open = (next: Tab, nextStatus?: ListStatus | "ALL", nextKind?: FollowKind) => {
    const p = new URLSearchParams(params);
    if (next === "overview") p.delete("tab");
    else p.set("tab", next);
    if (next === "list" && nextStatus && nextStatus !== "ALL") p.set("status", nextStatus);
    else p.delete("status");
    if (next === "people" && nextKind) p.set("people", nextKind);
    else if (next !== "people") p.delete("people");
    setParams(p, { replace: true });
    // Back to the top of the tabs if the page had scrolled past them.
    requestAnimationFrame(() => {
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Разделы профиля"]');
      if (nav && nav.getBoundingClientRect().top < 0) jumpTo("profile-tabs-anchor");
    });
  };

  /** A block of the overview: switch to it first if another tab is open,
   *  then scroll — and put the cursor in a field, if one is named. */
  const reach = (id: string, focus?: string) => {
    const away = tab !== "overview";
    if (away) open("overview");
    window.setTimeout(() => {
      jumpTo(id);
      if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
    }, away ? 150 : 0);
  };

  const earned = profile.achievements.filter((a) => a.earned).length;
  const tabs: Array<TabDef<Tab>> = useMemo(
    () => [
      { id: "overview", label: "Обзор" },
      { id: "people", label: "Люди", count: social ? social.friends + social.followers : "" },
      { id: "list", label: "Список", count: profile.hidden.list ? undefined : (list?.length ?? "") },
      { id: "trophies", label: "Трофеи", count: `${earned}/${profile.achievements.length}` },
      { id: "activity", label: "Активность" },
      { id: "collections", label: "Подборки", count: collections?.items.length ?? "" },
    ],
    [profile.hidden.list, list?.length, earned, profile.achievements.length, collections?.items.length, social],
  );

  const actions: ProfileTaskActions | undefined = own
    ? {
        pickAvatar: media.pickAvatar,
        pickBanner: media.pickBanner,
        openStudio: (studioTab) => onCustomise?.(studioTab),
        jump: (id) => {
          if (id === "trophies") open("trophies");
          else if (id === "people") open("people", undefined, "friends");
          else jumpTo(id);
        },
        go: (to) => navigate(to),
      }
    : undefined;

  return (
    <div style={style} className="mx-auto flex w-full max-w-[1400px] flex-col gap-5">
      <ProfileStage
        profile={profile}
        own={own}
        media={media}
        onCustomise={() => onCustomise?.("profile")}
        onNeedUsername={() => onCustomise?.("profile")}
        onPeople={(k) => open("people", undefined, k)}
        onCompare={!own && !profile.hidden.list ? () => reach("compare") : undefined}
        onWrite={() => reach("wall", "wall-input")}
      />
      <PlayerStrip profile={profile} />
      <span id="profile-tabs-anchor" className="-mb-5 block scroll-mt-28" />
      <ProfileTabs tabs={tabs} value={tab} onChange={(id) => open(id)} />
      <div key={tab} className="min-h-[50vh] animate-in duration-300 fade-in-0 slide-in-from-bottom-1">
        {tab === "overview" && <OverviewTab profile={profile} own={own} actions={actions} go={open} />}
        {tab === "people" && <PeopleTab profile={profile} own={own} kind={kind} onKind={(k) => open("people", undefined, k)} />}
        {tab === "list" && <ListTab profile={profile} status={status} onStatus={(s) => open("list", s)} />}
        {tab === "trophies" && <TrophiesTab profile={profile} own={own} />}
        {tab === "activity" && <ActivityTab profile={profile} />}
        {tab === "collections" && <CollectionsTab profile={profile} own={own} />}
      </div>
      {own && media.elements}
    </div>
  );
}
