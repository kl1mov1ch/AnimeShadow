/** Shared with the episode player and the persistent music controls. */
export const PLAYER_CONTROL_BUTTON =
  "player-control-button group flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-xl transition-[transform,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-white active:scale-90 motion-reduce:transition-none @md/player:size-9";
export const PLAYER_CONTROL_TONE =
  "text-white/90 hover:bg-primary/25 hover:text-white disabled:opacity-30";
export const PLAYER_CENTER_BUTTON =
  "relative grid place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/10 transition-[transform,background-color] duration-200 active:scale-90";
export const PLAYER_SLIDER =
  "[&_[data-slot=slider-track]]:h-1 [&_[data-slot=slider-track]]:bg-white/20 [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:size-3 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-white";
