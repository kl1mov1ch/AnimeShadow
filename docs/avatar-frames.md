# Avatar frames

The new public collection is `shadow-standard` (Тень), `shadow-pro` (Затмение), and `shadow-founder` (У истоков). Anyone can inspect and preview them from the profile's «Рамки аватара» button. Only the owner can save a choice through the existing profile PATCH. The standard is open to everyone; PRO includes trial access; founder uses the existing early-adopter achievement / registration cutoff of 2027-03-01T00:00:00Z.

The server validates writes and resolves the effective frame on profile, auth and social reads. Expired PRO falls back to standard without overwriting the stored selection; renewal restores it. Achievement privacy does not revoke the wearer's entitlement. Legacy IDs remain valid, without enabling the old experimental collection globally.

The collection contains 32 frames: three AnimeShadow originals, twenty-three anime-inspired frames, four Halloween frames and two rank awards. Anime frames now require verified player time for the matching title, one credit per episode after confirmed playback of half its pinned runtime, with a target capped at 24 episodes. Manual episode completion does not unlock a frame. Everyone may preview; only the owner receives their actual viewing credits. Halloween frames are available to everyone, including Zombie Night with independently animated whole hand sprites and Phantom Night with floating spirits.

The gallery now includes name search and category tabs, with a fixed newest-first order. The acquisition/access/sort dropdown block was removed at the user's request. Uniform cards hold two-line names and acquisition labels. A separate preview explains the artwork, exact title and viewing credits. On desktops both panes scroll independently; the phone layout is compact with expandable conditions.

## Verified viewing credits

The gallery displays «Посмотреть аниме…» or «Посмотреть фильм…», without hour/minute targets. One episode gives one plus when confirmed rewardSeconds reach ceil(episodeSeconds / 2). Each episode counts once, and partial time from several unfinished episodes cannot be combined into a credit. The goal is the pinned episode count, capped at 24 for long titles. A film needs one half-runtime credit. One Piece uses a fixed starting block of 24 episodes because it has no final episode count. The owner sees earned pluses and a bounded progress indicator.

WatchSession.rewardSeconds is populated only by new bounded playback heartbeats, at most75 seconds per report. Account row locks and elapsed-time bounds exclude replayed or overlapping reports. Frame progress groups by user/title/episode, rejects invented episode numbers beyond the pinned total, and awards credits only at each episode boundary. Pauses, buffering, seeking, hidden tabs and inactive players stop client counting. Manual completed flags and legacy unqualified sessions are not converted. Migration20261112120000_frame_watch_time adds eligible time, a consistency constraint and an index; applied locally only.

New character frames: Jinwoo uses Solo Leveling season1 (52299); Beru season2 (58567); Sylphiette Mushoku Tensei2 (51179); Eris first-season part2 (45576); Roxy first-season part1 (39535). Each uses the matching pinned title rather than unrelated episode totals.

People search and all watch/game leaderboard endpoints require authentication before querying data. Protected pages remain unmounted for guests, global people search is hidden, and participant totals are no longer returned/displayed. User cards use a70% card background with fully opaque text. Search is debounced, abortable and cached per signed-in user.
Weekly and monthly top999 unlock permanent frames. The rank medallion shows `№1` through `№999`, using the owner's best historical place, never a client-selected place. The week/month use different plaque positions and the exact site SVG glyph; hover, keyboard focus and touch reveal the award explanation. Weekly places1/2/3 also unlock separate medal titles. Only weekly top3 receive PRO7/5/3days; monthly awards do not grant PRO. Privacy does not remove an already-earned cosmetic; acquisition uses public ranking eligibility. Award receipts and checkpoints prevent double issuance and historical grants at first activation.

## Artwork and animation

Original transparent artwork references are in `artifacts/avatar-frames/references/`. Production assets are local WebP in `apps/web/public/frames/`: 640px for profiles and 192px for small avatars, about 75–136 KB and 13–21 KB respectively. New `-v2` assets replace the original five painted cloth tails without changing the user's frame ID. Old artwork remains available for rollback. The PRO reference has a blank medallion for the exact SVG brand glyph.

`ShadowAvatarFrame` reserves a strictly square footprint and calibrates the face scale/center to each artwork's transparent aperture through `avatarFrameFit`. The artwork uses contain and is never stretched. Layers are the static painted rim, subtle masked glow, three small theme-specific motes, optional whole vector silk ribbons, and the exact site glyph. Rotating perimeter lines and sweeping stripes were removed. Only large previews/profile avatars animate. IntersectionObserver, document visibility and reduced-motion suspend effects; the gallery also has a motion switch. Small header/social avatars remain static, and global dialog background animation pausing still applies. Presence, level and random-avatar controls attach to the actual circular rim instead of bounding-box corners.

The original diagonal cloth crop was removed: it could leave visible seams through the painted fabric. The five revised artworks have no loose cloth painted into them. Two complete shaded SVG silk strands sit behind the rim, with their anchor hidden under the metal, and sway independently using transform only. There is no cropped bitmap patch, missing rim sector or duplicated cloth edge. Static views use the same complete vector shapes at rest.

To add a future anime-inspired frame, add the descriptor and access rule in the shared catalog, optimized transparent art and thumbnail, and its visual entry in `apps/web/src/lib/avatar-frames.ts`. Keep avatar centers transparent and cosmetic rights checked on the server.

### Independent raster packs

The first five raster packs use only separately generated bitmap artwork for their rim and visual effects. Original transparent PNG files are in `artifacts/avatar-frames/raster-packs/{culling,hells-paradise,dorohedoro,atelier,reze}/`: each has `frame.png` and the requested separately named effect files. Production WebP counterparts are in `apps/web/public/frames/packs/`, with 192px base thumbnails. All thirteen production images total approximately 1.1 MiB; a frame loads only its own layers, and small avatars load only the static thumbnail.

`RasterFrameEffects` implements Culling Game runes (3.6 seconds) and a 100ms glitch every four seconds; seven clockwise Hell's Paradise petals; five staggered rising Dorohedoro smoke sprites; six orbiting Atelier sparks and a pulsing glow; and Reze's eight-second overlay rotation with a two-second heartbeat. An annular mask keeps the face clear and particles inside the rim. Animations use transforms and opacity, inherit visibility/reduced-motion pausing, and never rotate the base artwork. Each base has its own measured face aperture calibration.

The full built-in image generation prompt set is `artifacts/avatar-frames/raster-pack-prompts.json`. The PNG files retain their original alpha and resolution; runtime versions preserve aspect ratio and alpha during resizing. No SVG substitutes are used for these five packs.

The five character packs use separate frame.png and veil.png files under artifacts/avatar-frames/character-packs/{solo-jinwoo,solo-beru,sylphie,eris,roxy}/. Their matching WebP layers use a small static blur, a1–2px drift and low-opacity breathing over5.8–8.5seconds. No orbiting line or rotating base is used. The built-in generator prompts are in artifacts/avatar-frames/character-pack-prompts.json. PNG originals preserve alpha and aspect ratio; production bases have640px and192px versions.

The signature packs Gojo, Hunter×Hunter and Akame use separate frame.png/veil.png files under artifacts/avatar-frames/signature-packs/. Recognizable details are painted into each rim: Gojo mascot, blindfold and Six Eyes jewel; Gon fishing rod, Killua yo-yos and hunter license; Murasame katana and Night Raid medallion. Their prompts are in signature-pack-prompts.json, generated with the built-in image tool. Gojo shares the existing Jujutsu entitlement and a single per-title progress row.

## Reference creation prompts

Shared direction: original circular decorative avatar overlay, graphite #0a0b10, rose #ff4d6d, genuine alpha inside and outside, clear central face opening, detailed painted game cosmetic, no avatar, text, checkerboard, or copied franchise artwork.

- Standard: graphite and rose interlaced silver arcs, subtle sakura flowers at lower-left and upper-right, small crescent above; restrained compared with premium.
- PRO: graphite, cool platinum and rose crystal ring with flowers at the sides and a central lower jewel. V2 edit: preserve craftsmanship and geometry, recolor accents to AnimeShadow pink #ff4d6d, replace the lower jewel with a clean round graphite medallion, leave it blank for a separately rendered exact SVG brand mark.
- Founder: champagne and rose engraved celestial rim, lower laurel/petal details, crescent and star medallion; an ornate commemorative cosmetic with a clear avatar opening.

The first five anime prompts are in `artifacts/avatar-frames/anime-prompts.json`; seven additional frames and five cloth-removal edits are in `expansion-prompts.json`; weekly/monthly awards, two Halloween bases and the isolated zombie hand are in `reward-prompts.json` in that same directory. All artwork used built-in image generation, with alpha-preserving WebP derivatives. The portrait hand keeps its original aspect ratio.

Verification: `apps/api/tests/avatar-frames.test.ts` covers server writes, trial/paid/permanent PRO, expiry/renewal, early cutoff, legacy IDs, auth/social consistency and hidden achievements. Web/API typechecks, targeted lint and web production build are part of release validation.
