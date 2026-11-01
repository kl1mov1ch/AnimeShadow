# Avatar frames

The new public collection is `shadow-standard` (Тень), `shadow-pro` (Затмение), and `shadow-founder` (У истоков). Anyone can inspect and preview them from the profile's «Рамки аватара» button. Only the owner can save a choice through the existing profile PATCH. The standard is open to everyone; PRO includes trial access; founder uses the existing early-adopter achievement / registration cutoff of 2027-03-01T00:00:00Z.

The server validates writes and resolves the effective frame on profile, auth and social reads. Expired PRO falls back to standard without overwriting the stored selection; renewal restores it. Achievement privacy does not revoke the wearer's entitlement. Legacy IDs remain valid, without enabling the old experimental collection globally.

The collection contains 15 frames: three AnimeShadow originals, ten anime-inspired frames and two Halloween frames. The anime collection covers One Piece, Jujutsu Kaisen, Tokyo Ghoul, Black Clover, Frieren, Naruto, Demon Slayer, Attack on Titan, Death Note and Chainsaw Man. Halloween adds Pumpkin Night and Moon Witch. All twelve anime/Halloween frames are available to every registered account. All / Anime / AnimeShadow / Halloween filters and their counts come from each frame's category.

## Artwork and animation

Original transparent artwork references are in `artifacts/avatar-frames/references/`. Production assets are local WebP in `apps/web/public/frames/`: 640px for profiles and 192px for small avatars, about 75–136 KB and 13–21 KB respectively. New `-v2` assets replace the original five painted cloth tails without changing the user's frame ID. Old artwork remains available for rollback. The PRO reference has a blank medallion for the exact SVG brand glyph.

`ShadowAvatarFrame` reserves the rim's footprint around its child. Its layers are the static painted rim, alpha-masked highlights, a thin travelling rim light, three theme-specific motes, optional whole vector silk ribbons, and the exact `LogoGlyph` in the PRO medallion. Water, chakra, feathers, embers, leaves and bats have separate motifs/movement; Halloween lanterns add localized warm flicker. No rotating bitmap, canvas loop, animated image, or animated blur. Only large previews/profile avatars animate. IntersectionObserver, document visibility and reduced-motion suspend effects; the gallery also has a motion switch. Small header/social avatars remain static, and global dialog background animation pausing still applies.

The original diagonal cloth crop was removed: it could leave visible seams through the painted fabric. The five revised artworks have no loose cloth painted into them. Two complete shaded SVG silk strands sit behind the rim, with their anchor hidden under the metal, and sway independently using transform only. There is no cropped bitmap patch, missing rim sector or duplicated cloth edge. Static views use the same complete vector shapes at rest.

To add a future anime-inspired frame, add the descriptor and access rule in the shared catalog, optimized transparent art and thumbnail, and its visual entry in `apps/web/src/lib/avatar-frames.ts`. Keep avatar centers transparent and cosmetic rights checked on the server.

## Reference creation prompts

Shared direction: original circular decorative avatar overlay, graphite #0a0b10, rose #ff4d6d, genuine alpha inside and outside, clear central face opening, detailed painted game cosmetic, no avatar, text, checkerboard, or copied franchise artwork.

- Standard: graphite and rose interlaced silver arcs, subtle sakura flowers at lower-left and upper-right, small crescent above; restrained compared with premium.
- PRO: graphite, cool platinum and rose crystal ring with flowers at the sides and a central lower jewel. V2 edit: preserve craftsmanship and geometry, recolor accents to AnimeShadow pink #ff4d6d, replace the lower jewel with a clean round graphite medallion, leave it blank for a separately rendered exact SVG brand mark.
- Founder: champagne and rose engraved celestial rim, lower laurel/petal details, crescent and star medallion; an ornate commemorative cosmetic with a clear avatar opening.

The first five anime prompts are saved in `artifacts/avatar-frames/anime-prompts.json`. Seven additional frame prompts and five precise cloth-removal edits are saved in `artifacts/avatar-frames/expansion-prompts.json`. All artwork was created with the built-in image generation tool; final production overlays are optimized WebP derivatives with their original alpha preserved.

Verification: `apps/api/tests/avatar-frames.test.ts` covers server writes, trial/paid/permanent PRO, expiry/renewal, early cutoff, legacy IDs, auth/social consistency and hidden achievements. Web/API typechecks, targeted lint and web production build are part of release validation.
