import { useEffect, useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";

/** Chrome/Edge/Android fire this instead of showing their own install UI
 * once `preventDefault()` is called on it — the whole point is replacing
 * their generic mini-infobar with our own button, styled like everything
 * else in the header instead of standing out as a browser chrome element. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ reports as a plain "Macintosh" UA — touch points is the one
  // reliable way left to tell it apart from an actual Mac.
  const isAppleTouchDevice =
    /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isAppleTouchDevice) return false;
  // Chrome/Firefox/Edge on iOS are all still WebKit under the hood, but
  // only Safari itself can add a site to the home screen.
  return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export interface PwaInstall {
  /** A native install prompt is ready — Chrome/Edge on Android or desktop. */
  canInstall: boolean;
  /** Safari on an iPhone/iPad — no programmatic prompt exists there at
   * all; the only path is the Share sheet, which is what this drives a
   * manual instructions dialog for instead. */
  isIosSafari: boolean;
  /** Already running as the installed app — nothing left to offer. */
  isStandalone: boolean;
  promptInstall: () => Promise<void>;
}

export function usePwaInstall(): PwaInstall {
  const displayModeStandalone = useMediaQuery("(display-mode: standalone)");
  // iOS's own legacy flag — belt-and-suspenders alongside the media query
  // above, which some older iOS/iPadOS versions never quite got right.
  const iosStandalone =
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const isStandalone = displayModeStandalone || iosStandalone;

  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Chrome never fires another beforeinstallprompt for a dismissed
    // choice until real user activity happens again — clearing here just
    // makes our own button disappear immediately either way, matching
    // `appinstalled` on the accept path.
    setDeferred(null);
  };

  return {
    canInstall: deferred != null && !isStandalone,
    isIosSafari: isIosSafari() && !isStandalone,
    isStandalone,
    promptInstall,
  };
}
