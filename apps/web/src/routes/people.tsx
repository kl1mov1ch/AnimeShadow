import type { DirectoryUserCard, PeopleDirectoryResponse } from "@animeshadow/shared";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FilmIcon,
  SearchIcon,
  SearchXIcon,
  TrophyIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MembersOnly } from "@/components/common/members-only";
import { ProMark } from "@/components/common/pro-mark";
import { LevelBadge } from "@/components/profile/level-visuals";
import {
  AvatarFrameRing,
  ProfileTitleBadge,
} from "@/components/profile/profile-cosmetics";
import { plural } from "@/components/profile/page/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserProfileModal,
  type ProfileModalTarget,
} from "@/components/user-profile-modal";
import { UserTitleBadge } from "@/components/user-title-badge";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { imageSrc } from "@/lib/format";
import { publicLevelInfo, publicProfileHref } from "@/lib/public-identity";
import { openGlobalSearch } from "@/lib/search-events";
import "./people.css";

export function Component() {
  return (
    <MembersOnly
      title="Знакомьтесь со своими"
      description="Войдите, чтобы искать друзей, смотреть их коллекции рамок и находить людей с похожим вкусом в аниме."
    >
      <PeopleDirectory />
    </MembersOnly>
  );
}

function PeopleDirectory() {
  const [params, setParams] = useSearchParams();
  const { user, status } = useAuth();
  const term = (params.get("q") ?? "").slice(0, 60);
  const page = Math.min(
    100_000,
    Math.max(1, Math.floor(Number(params.get("page")) || 1)),
  );
  const [preview, setPreview] = useState<ProfileModalTarget | null>(null);
  const resultTop = useRef<HTMLDivElement>(null);
  const normalized = term.trim().replace(/^@+/, "").trim().toLocaleLowerCase("ru-RU");
  const q = normalized;
  const short = normalized.length === 1;
  const query = useQuery({
    queryKey: ["people", "directory", user?.id ?? "guest", q, page],
    queryFn: ({ signal }) =>
      apiRequest<PeopleDirectoryResponse>("/people/directory", {
        signal,
        query: { q, page },
      }),
    enabled: status === "authenticated" && !short,
    staleTime: 30_000,
  });
  const loading = !short && query.isPending;
  const items = query.data?.items ?? [];
  const openPreview = (person: DirectoryUserCard) =>
    setPreview({
      id: person.id,
      username: person.username,
      preview: { displayName: person.displayName, avatarUrl: person.avatarUrl },
    });
  const turnPage = (next: number) => {
    const updated = new URLSearchParams(params);
    if (next <= 1) updated.delete("page");
    else updated.set("page", String(next));
    setParams(updated, { preventScrollReset: true });
    resultTop.current?.scrollIntoView({ block: "start" });
  };
  const clearSearch = () => {
    const updated = new URLSearchParams(params);
    updated.delete("q");
    updated.delete("page");
    setParams(updated, { replace: true, preventScrollReset: true });
  };

  return (
    <div className="people-directory mx-auto w-full max-w-[1400px]">
      <header className="people-directory__hero">
        <div>
          <span className="people-directory__eyebrow">
            <UsersIcon aria-hidden />
            Сообщество AnimeShadow
          </span>
          <h1>Найдите своих</h1>
          <p>
            За каждым аватаром — любимые истории. Находите друзей, знакомьтесь с их
            коллекциями и открывайте новые аниме вместе.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/leaderboards">
            <TrophyIcon data-icon="inline-start" />
            Топ зрителей
          </Link>
        </Button>
      </header>

      <div className="people-directory__search-actions">
        <Button
          type="button"
          variant="outline"
          className="people-directory__search-trigger"
          onClick={() => openGlobalSearch({ mode: "people", query: term })}
        >
          <SearchIcon data-icon="inline-start" />
          Найти пользователя
          <kbd className="people-directory__search-shortcut">Ctrl + K</kbd>
        </Button>
        {term && (
          <span className="people-directory__query">
            <span className="truncate">Поиск: «{term}»</span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Сбросить поиск пользователей"
              onClick={clearSearch}
            >
              <XIcon />
            </Button>
          </span>
        )}
      </div>
      <div ref={resultTop} className="people-directory__results-heading">
        <h2 className="text-sm font-semibold">
          {normalized ? "Результаты поиска" : "Участники сообщества"}
        </h2>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {loading
            ? "Ищем…"
            : short
              ? "Введите ещё один символ"
              : query.isError
                ? "Не удалось загрузить"
                : normalized
                  ? "По нику и имени"
                  : "Откройте профиль, чтобы познакомиться"}
        </p>
      </div>

      <div id="people-results" aria-busy={loading}>
        {loading ? (
          <div className="people-directory__grid">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="people-card" aria-hidden>
                <div className="flex items-center gap-4">
                  <Skeleton className="size-20 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
                <Skeleton className="mt-6 h-7 w-full" />
              </div>
            ))}
          </div>
        ) : short ? (
          <DirectoryEmpty
            title="Начните с двух символов"
            description="Можно указать ник целиком, его часть или имя пользователя."
          />
        ) : query.isError ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersIcon />
              </EmptyMedia>
              <EmptyTitle>Не получилось загрузить пользователей</EmptyTitle>
              <EmptyDescription>
                Проверьте подключение и попробуйте ещё раз.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Повторить
              </Button>
            </EmptyContent>
          </Empty>
        ) : items.length ? (
          <div className="people-directory__grid">
            {items.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                onPreview={() => openPreview(person)}
              />
            ))}
          </div>
        ) : (
          <DirectoryEmpty
            title={normalized ? "Никого не нашли" : "Здесь пока тихо"}
            description={
              normalized
                ? "Проверьте написание или попробуйте другую часть имени."
                : "Публичные профили участников появятся здесь."
            }
          />
        )}
      </div>

      {!loading && !short && !query.isError && (page > 1 || query.data?.hasMore) && (
        <nav
          className="people-directory__pagination"
          aria-label="Страницы пользователей"
        >
          <Button
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => turnPage(page - 1)}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Назад
          </Button>
          <span
            className="text-sm tabular-nums text-muted-foreground"
            aria-current="page"
          >
            {page}
          </span>
          <Button
            variant="outline"
            disabled={!query.data?.hasMore || query.isFetching}
            onClick={() => turnPage(page + 1)}
          >
            Далее
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </nav>
      )}
      <UserProfileModal
        target={preview}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      />
    </div>
  );
}

function PersonCard({
  person,
  onPreview,
}: {
  person: DirectoryUserCard;
  onPreview: () => void;
}) {
  const level = publicLevelInfo(person.xp);
  return (
    <article className="people-card">
      <div className="people-card__identity">
        <button
          type="button"
          onClick={onPreview}
          className="people-card__avatar"
          aria-label={`Быстрый профиль: ${person.displayName}`}
        >
          <AvatarFrameRing
            frame={person.avatarFrame}
            weeklyPlace={person.weeklyWatchPlace}
            monthlyPlace={person.monthlyWatchPlace}
            fallback="ring-border"
            cap={false}
          >
            <Avatar className="size-16">
              {person.avatarUrl && (
                <AvatarImage
                  src={imageSrc(person.avatarUrl, 240)}
                  alt=""
                  loading="lazy"
                />
              )}
              <AvatarFallback>
                {person.displayName.trim().slice(0, 2).toLocaleUpperCase("ru-RU") ||
                  "影"}
              </AvatarFallback>
            </Avatar>
          </AvatarFrameRing>
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <button
              type="button"
              onClick={onPreview}
              className="truncate text-left hover:text-primary focus-visible:outline-primary"
            >
              {person.displayName}
            </button>
            {person.isPro && <ProMark />}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {person.username ? `@${person.username}` : "Участник AnimeShadow"}
          </p>
          {level && (
            <div className="flex min-w-0 items-center gap-1.5">
              <LevelBadge info={level} size={28} animated={false} />
              <span className="truncate text-[11px] text-muted-foreground">
                {level.tier.name}
              </span>
            </div>
          )}
        </div>
      </div>
      {(person.profileTitle || person.titlePrefix) && (
        <div className="people-card__titles">
          <ProfileTitleBadge title={person.profileTitle} />
          <UserTitleBadge prefix={person.titlePrefix} icon={person.titleIcon} />
        </div>
      )}
      <div className="people-card__footer">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <FilmIcon className="size-3.5 shrink-0" />
          {person.episodes == null
            ? "Статистика скрыта"
            : `${person.episodes.toLocaleString("ru-RU")} ${plural(person.episodes, "серия", "серии", "серий")}`}
        </span>
        <Button variant="ghost" size="sm" asChild>
          <Link to={publicProfileHref(person.username, person.id)}>
            Профиль
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

function DirectoryEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
