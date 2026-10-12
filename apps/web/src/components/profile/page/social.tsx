import type { FollowKind, FriendEvent, PublicProfile, UserCard } from "@animeshadow/shared";
import {
  ActivityIcon,
  type LucideIcon,
  HandshakeIcon,
  Loader2Icon,
  MessageSquareTextIcon,
  SendIcon,
  Trash2Icon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ProMark } from "@/components/common/pro-mark";
import { MorphIcon } from "@/components/ui/morph-icon";
import { UserTitleBadge } from "@/components/user-title-badge";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/i18n";
import { animeHref, imageSrc } from "@/lib/format";
import { useLabels } from "@/lib/labels";
import {
  useDeleteWallPost,
  useFollow,
  useFriendsActivity,
  usePeople,
  usePostToWall,
  useSocial,
  useSuggestedPeople,
  useWall,
} from "@/lib/query";
import { FEATURES } from "@/lib/features";
import { cn } from "@/lib/utils";
import { ago, plural } from "./format";
import { frameGlow, hasFrame } from "../frame-fx";
import { AvatarFrameRing, ProfileTitleBadge } from "../profile-cosmetics";
import { EmptyNote, Panel } from "./kit";

function profileHref(user: Pick<UserCard, "username">): string | null {
  return user.username ? `/profile/${user.username}` : null;
}

function Face({ user, size = 40, className }: { user: Pick<UserCard, "displayName" | "avatarUrl" | "onlineStatus">; size?: number; className?: string }) {
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-card font-semibold ring-2 ring-background", className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {user.avatarUrl ? <img src={imageSrc(user.avatarUrl)} alt="" loading="lazy" className="size-full object-cover" /> : user.displayName.charAt(0).toUpperCase()}
    </span>
  );
}

/** A face in the frame its owner wears — plain when they wear none. */
function FramedFace({ user, size, className }: { user: UserCard; size: number; className?: string }) {
  return (
    <AvatarFrameRing frame={user.avatarFrame} fallback="ring-0 ring-offset-0" cap={false}>
      <Face user={user} size={size} className={className} />
    </AvatarFrameRing>
  );
}

/** A name with what goes beside it: PRO, the earned title, the PRO title. */
function NameMarks({ user, className }: { user: UserCard; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1", className)}>
      {user.isPro && <ProMark className="text-xs" />}
      <ProfileTitleBadge title={user.profileTitle} />
      <UserTitleBadge prefix={user.titlePrefix} icon={user.titleIcon} compact />
    </span>
  );
}

/** The colour of the frame someone wears — their accent in a list. */
function accentOf(user: UserCard): string | null {
  return FEATURES.avatarFrames && user.avatarFrame && hasFrame(user.avatarFrame) ? frameGlow(user.avatarFrame) : null;
}

/**
 * The three kinds of people, each with its own mark and colour, so a friend
 * never reads like a follower: friends are green with a handshake,
 * followers blue, the ones followed violet.
 */
const RELATION: Record<FollowKind, { icon: LucideIcon; label: string; tone: string; ring: string }> = {
  friends: { icon: HandshakeIcon, label: "Друзья", tone: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/35", ring: "ring-emerald-400/70" },
  followers: { icon: UsersIcon, label: "Подписчики", tone: "bg-sky-500/15 text-sky-300 ring-sky-400/35", ring: "ring-sky-400/60" },
  following: { icon: UserCheckIcon, label: "Подписки", tone: "bg-violet-500/15 text-violet-300 ring-violet-400/35", ring: "ring-violet-400/60" },
};

/* ---------------- follow ---------------- */

/**
 * Follow and unfollow. Says what the two of you are: "Подписаться",
 * "Подписаться в ответ" when they follow you, "Вы подписаны", and
 * "Друзья" once it goes both ways — and under the pointer, "Отписаться".
 */
export function FollowButton({ userId, compact = false, className }: { userId: string; compact?: boolean; className?: string }) {
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const { data } = useSocial(userId);
  const follow = useFollow(userId);
  const [hover, setHover] = useState(false);
  if (user?.id === userId) return null;

  const following = data?.isFollowing ?? false;
  const friends = following && (data?.followsYou ?? false);
  const label = following
    ? hover
      ? "Отписаться"
      : friends
        ? "Друзья"
        : "Вы подписаны"
    : data?.followsYou
      ? "Подписаться в ответ"
      : "Подписаться";

  return (
    <button
      type="button"
      disabled={follow.isPending}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (status !== "authenticated") {
          navigate("/login", { state: { from: window.location.pathname } });
          return;
        }
        follow.mutate(!following, {
          onSuccess: (s) => {
            if (!following) toast.success(s.followsYou ? "Теперь вы друзья!" : "Вы подписались");
          },
          onError: () => toast.error("Не получилось, попробуйте ещё раз"),
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,color,border-color,transform] duration-200 active:scale-95 disabled:opacity-70",
        compact ? "h-8 rounded-full px-3 text-xs" : "h-11 rounded-xl px-5 text-sm",
        following
          ? hover
            ? "border border-rose-500/50 bg-rose-500/10 text-rose-300"
            : "border border-[var(--accent-line-soft)] bg-card/70 text-foreground"
          : "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:-translate-y-0.5",
        className,
      )}
    >
      <MorphIcon on={following} off={UserPlusIcon} onIcon={friends ? HandshakeIcon : UserCheckIcon} className={compact ? "size-3.5" : "size-4"} />
      {label}
    </button>
  );
}

/* ---------------- the line under the name ---------------- */

/**
 * Friends, followers and following as three chips under the name — each
 * with its mark, its colour and its number, each a button to the list.
 * Friends come first and carry a few faces.
 */
export function SocialLine({ userId, onOpen, className }: { userId: string; onOpen: (kind: FollowKind) => void; className?: string }) {
  const { data } = useSocial(userId);
  if (!data) return <span className={cn("h-9 w-72 animate-pulse rounded-full bg-foreground/[0.06]", className)} />;
  const items: Array<{ kind: FollowKind; n: number; word: string }> = [
    { kind: "friends", n: data.friends, word: plural(data.friends, "друг", "друга", "друзей") },
    { kind: "followers", n: data.followers, word: plural(data.followers, "подписчик", "подписчика", "подписчиков") },
    { kind: "following", n: data.following, word: plural(data.following, "подписка", "подписки", "подписок") },
  ];
  return (
    <div
      className={cn(
        "-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((it) => {
        const rel = RELATION[it.kind];
        return (
          <button
            key={it.kind}
            type="button"
            onClick={() => onOpen(it.kind)}
            className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-black/30 pl-0.5 pr-2.5 text-xs transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-black/45 sm:h-9 sm:gap-2 sm:pl-1 sm:pr-3 sm:text-sm"
          >
            <span className={cn("grid size-6 place-items-center rounded-full ring-1 sm:size-7", rel.tone)}>
              <rel.icon className="size-3 sm:size-3.5" />
            </span>
            {it.kind === "friends" && data.friendFaces.length > 0 && (
              <span className="hidden -space-x-2 sm:flex">
                {data.friendFaces.slice(0, 3).map((f) => (
                  <Face key={f.id} user={f} size={22} />
                ))}
              </span>
            )}
            <span className="font-semibold tabular-nums">{it.n.toLocaleString("ru-RU")}</span>
            <span className="text-muted-foreground transition-colors group-hover:text-foreground">{it.word}</span>
          </button>
        );
      })}
      {data.followsYou && !data.isFollowing && (
        <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-sky-500/15 px-2.5 text-[11px] font-medium text-sky-300 ring-1 ring-sky-400/30">
          <UsersIcon className="size-3" />
          подписан(а) на вас
        </span>
      )}
    </div>
  );
}

export function PersonCard({ person, index = 0, mark }: { person: UserCard; index?: number; mark?: FollowKind }) {
  const href = profileHref(person);
  const rel = mark ? RELATION[mark] : null;
  const together = person.following && person.followsYou;
  const top = (
    <>
      <span className="relative">
        {FEATURES.avatarFrames && person.avatarFrame ? (
          <FramedFace user={person} size={68} />
        ) : (
          <Face user={person} size={68} className={cn("ring-2", rel ? rel.ring : "ring-[var(--accent-line-soft)]")} />
        )}
        {person.onlineStatus === "ONLINE" && (
          <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-emerald-400 ring-2 ring-background" title="На сайте" />
        )}
        {rel && (
          <span className={cn("absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full ring-2 ring-background", rel.tone)} title={rel.label}>
            <rel.icon className="size-3.5" />
          </span>
        )}
      </span>
      <span className="mt-1 block w-full truncate text-sm font-semibold">{person.displayName}</span>
      <NameMarks user={person} className="justify-center" />
      <span className="block w-full truncate text-[11px] text-muted-foreground">
        {person.username ? `@${person.username}` : "без ника"} · {person.episodes.toLocaleString("ru-RU")} {plural(person.episodes, "серия", "серии", "серий")}
      </span>
    </>
  );
  return (
    <li
      className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--accent-line-soft)] bg-background/40 p-3 pt-4 text-center transition-[border-color,transform] duration-200 animate-in fade-in-0 hover:-translate-y-0.5 hover:border-primary/35"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms`, animationFillMode: "backwards" }}
    >
      {href ? (
        <Link to={href} className="flex w-full min-w-0 flex-col items-center gap-1">
          {top}
        </Link>
      ) : (
        <span className="flex w-full min-w-0 flex-col items-center gap-1">{top}</span>
      )}
      <span className="flex h-5 items-center">
        {together ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 text-[10px] font-semibold leading-5 ring-1", RELATION.friends.tone)}>
            <HandshakeIcon className="size-3" />
            ваш друг
          </span>
        ) : person.followsYou ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 text-[10px] font-semibold leading-5 ring-1", RELATION.followers.tone)}>
            <UsersIcon className="size-3" />
            подписан(а) на вас
          </span>
        ) : null}
      </span>
      <FollowButton userId={person.id} compact className="mt-1 w-full" />
    </li>
  );
}

const PEOPLE_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

export function PeopleTab({ profile, own, kind, onKind }: { profile: PublicProfile; own: boolean; kind: FollowKind; onKind: (k: FollowKind) => void }) {
  const { data: social } = useSocial(profile.id);
  const { data, isPending } = usePeople(profile.id, kind);
  const kinds: Array<{ kind: FollowKind; count?: number; hint: string; empty: string; emptyHint: string }> = [
    { kind: "friends", count: social?.friends, hint: "подписаны друг на друга", empty: "Друзей пока нет", emptyHint: "Друзья — это когда вы подписаны друг на друга. Подпишитесь на кого-нибудь ниже." },
    { kind: "followers", count: social?.followers, hint: own ? "подписаны на вас" : "подписаны на профиль", empty: "Подписчиков пока нет", emptyHint: "Подписывайтесь на других и пишите на стенах — многие отвечают тем же." },
    { kind: "following", count: social?.following, hint: own ? "на кого подписаны вы" : "на кого подписан(а)", empty: "Подписок пока нет", emptyHint: "Подпишитесь — и их новости появятся в «Что смотрят друзья»." },
  ];
  const current = kinds.find((k) => k.kind === kind)!;
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="grid grid-cols-3 gap-2 sm:gap-3">
        {kinds.map((k) => {
          const rel = RELATION[k.kind];
          const on = k.kind === kind;
          return (
            <button
              key={k.kind}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onKind(k.kind)}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-[border-color,background-color,transform] duration-200 sm:flex-row sm:items-center sm:gap-3 sm:p-4",
                on ? "border-primary/50 bg-[var(--accent-surface-strong)] shadow-sm" : "border-[var(--accent-line-soft)] bg-background/40 hover:-translate-y-0.5 hover:border-foreground/25",
              )}
            >
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl ring-1 sm:size-11", rel.tone)}>
                <rel.icon className="size-4 sm:size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-lg leading-none tabular-nums sm:text-2xl">{k.count ?? "—"}</span>
                  <span className="truncate text-xs font-semibold sm:text-sm">{rel.label}</span>
                </span>
                <span className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{k.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      {isPending ? (
        <div className={PEOPLE_GRID}>
          {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-48 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyNote icon={RELATION[kind].icon} title={current.empty} hint={current.emptyHint} />
      ) : (
        <ul className={PEOPLE_GRID}>
          {data.map((p, i) => (
            <PersonCard key={p.id} person={p} index={i} mark={kind} />
          ))}
        </ul>
      )}
      {own && <Suggestions />}
    </div>
  );
}

export function Suggestions({ title = "Кого добавить" }: { title?: string }) {
  const { data } = useSuggestedPeople();
  if (!data || data.length === 0) return null;
  return (
    <Panel title={title} icon={UserPlusIcon}>
      <ul className={PEOPLE_GRID}>
        {data.map((p, i) => (
          <PersonCard key={p.id} person={p} index={i} />
        ))}
      </ul>
    </Panel>
  );
}

/* ---------------- the wall ---------------- */

/**
 * The wall: a word from anyone signed in, newest first. The author, the
 * profile's owner and admins can take a post down. Ctrl+Enter sends.
 */
export function WallPanel({ profile, own }: { profile: PublicProfile; own: boolean }) {
  const { status, user } = useAuth();
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useWall(profile.id);
  const post = usePostToWall(profile.id);
  const remove = useDeleteWallPost(profile.id);
  const [text, setText] = useState("");
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? 0;

  const send = () => {
    const body = text.trim();
    if (!body) return;
    post.mutate(body, {
      onSuccess: () => setText(""),
      onError: () => toast.error("Не получилось отправить — попробуйте чуть позже"),
    });
  };

  return (
    <div id="wall" className="scroll-mt-32">
    <Panel title="Стена" icon={MessageSquareTextIcon} action={total > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{total}</span> : undefined}>
      {status === "authenticated" ? (
        <div className="mb-5 flex gap-3">
          {user && <Face user={{ displayName: user.displayName, avatarUrl: user.avatarUrl, onlineStatus: "ONLINE" }} size={38} className="mt-0.5" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <textarea
              id="wall-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  send();
                }
              }}
              maxLength={1000}
              rows={2}
              placeholder={own ? "Расскажите друзьям, что смотрите…" : `Оставьте пару слов для ${profile.displayName}…`}
              className="w-full resize-y rounded-2xl border border-[var(--accent-line-soft)] bg-background/50 px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-primary/50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">{text.length > 0 ? `${text.length} / 1000 · Ctrl+Enter` : ""}</span>
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || post.isPending}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-50"
              >
                {post.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />}
                Отправить
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="mb-4 rounded-2xl bg-foreground/[0.04] px-3 py-2.5 text-sm text-muted-foreground">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Войдите
          </Link>
          , чтобы оставить сообщение на стене.
        </p>
      )}

      {isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyNote icon={MessageSquareTextIcon} title="На стене пока тихо" hint={own ? "Здесь появятся сообщения от друзей." : "Станьте первым, кто что-то напишет."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p, i) => {
            const href = profileHref(p.author);
            const accent = accentOf(p.author);
            return (
              <li
                key={p.id}
                className="group flex gap-3 rounded-2xl border border-[var(--accent-line-soft)] bg-background/30 p-2.5 transition-colors animate-in fade-in-0 slide-in-from-bottom-1 [contain-intrinsic-size:auto_88px] [content-visibility:auto] hover:bg-foreground/[0.03] sm:gap-3.5 sm:p-3"
                style={{
                  animationDelay: `${Math.min(i, 10) * 30}ms`,
                  animationFillMode: "backwards",
                  ...(accent ? { borderColor: `color-mix(in srgb, ${accent} 35%, transparent)`, backgroundImage: `linear-gradient(90deg, color-mix(in srgb, ${accent} 10%, transparent), transparent 45%)` } : {}),
                }}
              >
                <span className="shrink-0 p-1">
                  {href ? (
                    <Link to={href} className="block">
                      <FramedFace user={p.author} size={42} />
                    </Link>
                  ) : (
                    <FramedFace user={p.author} size={42} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {href ? (
                      <Link to={href} className="truncate text-sm font-semibold hover:text-primary" style={accent ? { color: accent } : undefined}>
                        {p.author.displayName}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-semibold" style={accent ? { color: accent } : undefined}>
                        {p.author.displayName}
                      </span>
                    )}
                    <NameMarks user={p.author} />
                    <span className="shrink-0 text-[11px] text-muted-foreground">{ago(p.createdAt)}</span>
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 [overflow-wrap:anywhere]">{p.body}</p>
                </div>
                {p.canDelete && (
                  <button
                    type="button"
                    onClick={() => remove.mutate(p.id)}
                    aria-label="Удалить"
                    title="Удалить"
                    className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground opacity-0 transition-[opacity,color] hover:text-rose-400 group-hover:opacity-100 max-sm:opacity-60"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {hasNextPage && (
        <button
          type="button"
          onClick={() => void fetchNextPage()}
          disabled={isFetchingNextPage}
          className="mx-auto mt-3 flex h-9 items-center gap-2 rounded-full border border-[var(--accent-line-soft)] px-5 text-sm transition-colors hover:border-primary/40 hover:bg-primary/10"
        >
          {isFetchingNextPage && <Loader2Icon className="size-3.5 animate-spin" />}
          Показать ещё
        </button>
      )}
    </Panel>
    </div>
  );
}

/* ---------------- friends' activity ---------------- */

const KIND_TEXT: Record<FriendEvent["kind"], string> = {
  episode: "посмотрел(а) серию",
  completed: "досмотрел(а)",
  rated: "оценил(а)",
  added: "добавил(а) в список",
  achievement: "получил(а) достижение",
};

/** What the people one follows have been doing — or who to follow, while there is no one. */
export function FriendsActivity({ userId }: { userId: string }) {
  const t = useT();
  const labels = useLabels();
  const { data, isPending } = useFriendsActivity();
  const { data: social } = useSocial(userId);
  if (!isPending && (data?.length ?? 0) === 0) {
    return <Suggestions title={social && social.following > 0 ? "Кого ещё добавить" : "Найдите друзей — подпишитесь на интересных людей"} />;
  }
  return (
    <Panel title="Что смотрят друзья" icon={ActivityIcon}>
      {isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-foreground/[0.05]" />)}
        </div>
      ) : (
        <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
          {data!.slice(0, 12).map((e, i) => {
            const href = profileHref(e.user);
            return (
              <li key={`${e.user.id}-${e.kind}-${e.at}-${i}`} className="flex items-center gap-3 animate-in fade-in-0" style={{ animationDelay: `${Math.min(i, 12) * 30}ms`, animationFillMode: "backwards" }}>
                {href ? (
                  <Link to={href} className="shrink-0">
                    <Face user={e.user} size={40} />
                  </Link>
                ) : (
                  <Face user={e.user} size={40} />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">
                    <span className="font-semibold">{e.user.displayName}</span>{" "}
                    <span className="text-muted-foreground">
                      {KIND_TEXT[e.kind]}
                      {e.kind === "episode" && e.value != null ? ` ${e.value}` : ""}
                      {e.kind === "rated" && e.value != null ? ` на ${e.value}` : ""}
                    </span>
                  </p>
                  {e.anime ? (
                    <Link to={animeHref(e.anime)} className="block truncate text-xs font-medium text-primary/90 hover:text-primary">
                      {labels.title(e.anime)}
                    </Link>
                  ) : (
                    e.kind === "achievement" && (
                      <span className="block truncate text-xs font-medium text-amber-300">
                        {t(`achievements.items.${e.value}.title` as "achievements.items.critic.title")}
                      </span>
                    )
                  )}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{ago(e.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
