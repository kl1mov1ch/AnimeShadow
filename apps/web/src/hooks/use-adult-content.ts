import { useCallback, useState } from "react";

const KEY = "animeshadow.adult-confirmed.v1";

/** MAL-style rating meaning genuinely explicit content ("R+" is just mild nudity, not gated). */
export function isAdultRating(rating: string | null | undefined): boolean {
  return rating === "Rx";
}

function readConfirmed(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** One-time 18+ confirmation, remembered across the site (not per-title). */
export function useAdultConfirmed(): [boolean, () => void] {
  const [confirmed, setConfirmed] = useState(readConfirmed);

  const confirm = useCallback(() => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode — the prompt will just show again next visit */
    }
    setConfirmed(true);
  }, []);

  return [confirmed, confirm];
}
