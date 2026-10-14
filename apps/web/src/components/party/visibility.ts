import type { PartyVisibility } from "@animeshadow/shared";
import { GlobeIcon, HeartHandshakeIcon, LinkIcon } from "lucide-react";

/** Who sees a room in the list of rooms. */
export const VISIBILITY: Record<PartyVisibility, { label: string; hint: string; icon: typeof GlobeIcon }> = {
  public: { label: "Открытая", hint: "Видна всем в списке комнат", icon: GlobeIcon },
  friends: { label: "Для друзей", hint: "В списке её видят только ваши друзья", icon: HeartHandshakeIcon },
  link: { label: "По ссылке", hint: "В списке не видна — только по приглашению", icon: LinkIcon },
};
