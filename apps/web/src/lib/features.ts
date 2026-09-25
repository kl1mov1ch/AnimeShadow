/**
 * Switches for parts of the site that are built and kept, but not shown
 * right now. Everything behind them still exists — the database columns,
 * the API, the components — so turning one back on is changing `false`
 * to `true` here, nothing else.
 */
export const FEATURES = {
  /**
   * Profile styling: avatar frames, progress-bar styles, the profile's own
   * colour and the block layout editor. Off: every profile looks the same
   * and costs the same to draw. Titles (приписки) stay either way.
   */
  profileCustomization: false,
  /**
   * Looping effects on achievements and titles (shimmer, glow, embers).
   * Off: the same badges, still.
   */
  richEffects: false,
  /** The "genres for you" block on the homepage. */
  homeGenres: false,
  /**
   * English. Off: the site is Russian only — no switcher, and the English
   * dictionary is never downloaded. The dictionary itself (i18n/en.ts)
   * stays; it is also the type every other locale is checked against.
   */
  englishLocale: false,
  /**
   * The light theme. Off: dark only — no toggle anywhere, no per-account
   * theme to fetch and sync on every page.
   */
  lightTheme: false,
  /**
   * The title's opening playing behind headers and hero slides. Off: stills
   * only — no /themes lookup and no video stream per page.
   */
  openingVideos: false,
} as const;
