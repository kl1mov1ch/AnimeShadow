import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { COOKIE_CHOICE_EVENT, hasCookieConsent } from "@/components/cookie-consent";

/*
 * Third-party counters, all optional, each switched on by its id in the
 * build's .env:
 *   VITE_YM_ID      Yandex Metrica counter id
 *   VITE_GA_ID      Google Analytics 4 measurement id (G-XXXXXXX)
 *   VITE_UMAMI_SRC  + VITE_UMAMI_ID — an Umami script URL and website id
 * None of them loads until the visitor accepts cookies; each gets a hit on
 * every route change, since the site is a single-page app.
 */
const YM_ID = import.meta.env.VITE_YM_ID as string | undefined;
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;
const UMAMI_SRC = import.meta.env.VITE_UMAMI_SRC as string | undefined;
const UMAMI_ID = import.meta.env.VITE_UMAMI_ID as string | undefined;

type Fn = (...args: unknown[]) => void;
declare global {
  interface Window {
    ym?: Fn & { a?: unknown[]; l?: number };
    dataLayer?: unknown[];
    gtag?: Fn;
    umami?: { track: (props?: unknown) => void };
  }
}

function addScript(src: string, attrs: Record<string, string> = {}) {
  const el = document.createElement("script");
  el.async = true;
  el.src = src;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

let loaded = false;
function load() {
  if (loaded) return;
  loaded = true;
  if (YM_ID) {
    const ym: Fn & { a?: unknown[]; l?: number } = (...args: unknown[]) => {
      (ym.a = ym.a ?? []).push(args);
    };
    ym.l = Date.now();
    window.ym = ym;
    addScript("https://mc.yandex.ru/metrika/tag.js");
    window.ym(Number(YM_ID), "init", {
      defer: true, // hits are sent by hand on each route change
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: true,
    });
  }
  if (GA_ID) {
    window.dataLayer = window.dataLayer ?? [];
    // gtag needs the real `arguments` object.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function gtag() { window.dataLayer!.push(arguments); } as Fn;
    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { send_page_view: false });
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`);
  }
  if (UMAMI_SRC && UMAMI_ID) {
    addScript(UMAMI_SRC, { "data-website-id": UMAMI_ID, "data-auto-track": "false" });
  }
}

function hit(path: string, referrer: string) {
  const url = window.location.origin + path;
  if (YM_ID && window.ym) window.ym(Number(YM_ID), "hit", url, { referer: referrer, title: document.title });
  if (GA_ID && window.gtag) window.gtag("event", "page_view", { page_location: url, page_path: path, page_title: document.title });
  if (UMAMI_ID) window.umami?.track();
}

export function useExternalAnalytics(): void {
  const { pathname, search } = useLocation();
  const [allowed, setAllowed] = useState(hasCookieConsent);

  useEffect(() => {
    const onChoice = () => setAllowed(hasCookieConsent());
    window.addEventListener(COOKIE_CHOICE_EVENT, onChoice);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, onChoice);
  }, []);

  useEffect(() => {
    if (!allowed || (!YM_ID && !GA_ID && !UMAMI_ID)) return;
    load();
    // After the route's title has been set.
    const timer = setTimeout(() => hit(pathname + search, document.referrer), 300);
    return () => clearTimeout(timer);
  }, [allowed, pathname, search]);
}
