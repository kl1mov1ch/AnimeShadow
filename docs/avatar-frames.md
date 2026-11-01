# Avatar frames

The new public collection is `shadow-standard` (Тень), `shadow-pro` (Затмение), and `shadow-founder` (У истоков). Anyone can inspect and preview them from the profile's «Рамки аватара» button. Only the owner can save a choice through the existing profile PATCH. The standard is open to everyone; PRO includes trial access; founder uses the existing early-adopter achievement / registration cutoff of 2027-03-01T00:00:00Z.

The server validates writes and resolves the effective frame on profile, auth and social reads. Expired PRO falls back to standard without overwriting the stored selection; renewal restores it. Achievement privacy does not revoke the wearer's entitlement. Legacy IDs remain valid, without enabling the old experimental collection globally.

Five anime-inspired entries extend the same collection: `shadow-one-piece`, `shadow-jujutsu`, `shadow-tokyo-ghoul`, `shadow-black-clover`, and `shadow-frieren`. All five are available to every registered account. The gallery has All / Anime / AnimeShadow filters; counts come from the catalog.

## Artwork and animation

Original transparent artwork references are in `artifacts/avatar-frames/references/`. Production assets are local WebP in `apps/web/public/frames/`: 640px for profiles and 192px for small avatars, about 85–136 KB and 14–21 KB respectively. The PRO v2 reference replaces v1 and has a blank medallion for the exact SVG brand glyph.

`ShadowAvatarFrame` reserves the rim's footprint around its child. Its layers are the static painted rim, a highlight masked by the rim's alpha, three small opacity/scale sparkles, and the exact `LogoGlyph` in the PRO medallion. No rotating bitmap, canvas loop, animated image, or animated blur. Only large previews/profile avatars animate. IntersectionObserver, document visibility and reduced-motion suspend effects; the gallery also has a motion switch. Small header/social avatars remain static.

The five anime frames additionally split the free cloth tip from the painted artwork using complementary CSS clipping and an SVG luminance mask. The tip uses the same cached image and sways by only 0.7–1.6 degrees; no duplicate painted tail is left underneath. Each theme has its own timing. At rest or thumbnail size the unsplit artwork is used.

To add a future anime-inspired frame, add the descriptor and access rule in the shared catalog, optimized transparent art and thumbnail, and its visual entry in `apps/web/src/lib/avatar-frames.ts`. Keep avatar centers transparent and cosmetic rights checked on the server.

## Reference creation prompts

Shared direction: original circular decorative avatar overlay, graphite #0a0b10, rose #ff4d6d, genuine alpha inside and outside, clear central face opening, detailed painted game cosmetic, no avatar, text, checkerboard, or copied franchise artwork.

- Standard: graphite and rose interlaced silver arcs, subtle sakura flowers at lower-left and upper-right, small crescent above; restrained compared with premium.
- PRO: graphite, cool platinum and rose crystal ring with flowers at the sides and a central lower jewel. V2 edit: preserve craftsmanship and geometry, recolor accents to AnimeShadow pink #ff4d6d, replace the lower jewel with a clean round graphite medallion, leave it blank for a separately rendered exact SVG brand mark.
- Founder: champagne and rose engraved celestial rim, lower laurel/petal details, crescent and star medallion; an ornate commemorative cosmetic with a clear avatar opening.

The exact five anime prompts are saved in `artifacts/avatar-frames/anime-prompts.json`. All eight references were created with the built-in image generation tool; the final production overlays are optimized WebP derivatives with their original alpha preserved.

Verification: `apps/api/tests/avatar-frames.test.ts` covers server writes, trial/paid/permanent PRO, expiry/renewal, early cutoff, legacy IDs, auth/social consistency and hidden achievements. Web/API typechecks, targeted lint and web production build are part of release validation.
