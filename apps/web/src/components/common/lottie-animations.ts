/**
 * Hand-authored Lottie animations, deliberately monochrome.
 *
 * Colour is stated as pure white in the shape data and then overridden to
 * `currentColor` by LottieMono — so the file itself never decides whether it
 * is dark-on-light or light-on-dark, and one animation serves both themes.
 * Anything with baked-in colour would need a second copy per theme and would
 * drift the moment the palette changed.
 *
 * Shapes are kept to circles, lines and trim paths: simple enough to reason
 * about, cheap enough to run several at once behind real content.
 */

const WHITE = [1, 1, 1, 1];

/** Transform block shared by every group — Lottie requires one per group. */
const groupTransform = {
  ty: "tr",
  p: { a: 0, k: [0, 0] },
  a: { a: 0, k: [0, 0] },
  s: { a: 0, k: [100, 100] },
  r: { a: 0, k: 0 },
  o: { a: 0, k: 100 },
};

function ring(startFrame: number, endFrame: number, index: number) {
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `ring-${index}`,
    sr: 1,
    ks: {
      o: {
        a: 1,
        k: [
          { t: startFrame, s: [0] },
          { t: startFrame + 20, s: [55] },
          { t: endFrame, s: [0] },
        ],
      },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [100, 100, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: startFrame, s: [20, 20, 100] },
          { t: endFrame, s: [130, 130, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: "g",
        it: [
          { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [120, 120] }, nm: "e" },
          {
            ty: "st",
            c: { a: 0, k: WHITE },
            o: { a: 0, k: 100 },
            w: { a: 0, k: 2 },
            lc: 2,
            lj: 2,
            nm: "s",
          },
          groupTransform,
        ],
      },
    ],
    ip: 0,
    op: 180,
    st: 0,
    bm: 0,
  };
}

/**
 * Three rings breathing outward on a stagger — ambient, slow, and quiet
 * enough to sit behind a form without competing with it.
 */
export const pulseRings = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 180,
  w: 200,
  h: 200,
  nm: "pulse-rings",
  ddd: 0,
  assets: [],
  layers: [ring(0, 180, 1), ring(60, 180, 2), ring(120, 180, 3)],
};

/**
 * A single stroke drawn left to right and released — the ink-brush beat used
 * as a divider accent.
 */
export const brushStroke = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 90,
  w: 200,
  h: 40,
  nm: "brush-stroke",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "stroke",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [100, 20, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] },
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          nm: "g",
          it: [
            {
              ty: "sh",
              nm: "path",
              ks: {
                a: 0,
                k: {
                  c: false,
                  v: [
                    [-90, 0],
                    [0, -6],
                    [90, 0],
                  ],
                  i: [
                    [0, 0],
                    [-30, 0],
                    [0, 0],
                  ],
                  o: [
                    [30, 0],
                    [30, 0],
                    [0, 0],
                  ],
                },
              },
            },
            {
              ty: "st",
              c: { a: 0, k: WHITE },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 3 },
              lc: 2,
              lj: 2,
              nm: "s",
            },
            {
              ty: "tm",
              nm: "trim",
              s: {
                a: 1,
                k: [
                  { t: 0, s: [0] },
                  { t: 45, s: [0] },
                  { t: 90, s: [100] },
                ],
              },
              e: {
                a: 1,
                k: [
                  { t: 0, s: [0] },
                  { t: 45, s: [100] },
                ],
              },
              o: { a: 0, k: 0 },
              m: 1,
            },
            groupTransform,
          ],
        },
      ],
      ip: 0,
      op: 90,
      st: 0,
      bm: 0,
    },
  ],
};

function dot(index: number, offset: number) {
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: `dot-${index}`,
    sr: 1,
    ks: {
      o: {
        a: 1,
        k: [
          { t: offset, s: [35] },
          { t: offset + 15, s: [100] },
          { t: offset + 30, s: [35] },
        ],
      },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [30 + (index - 1) * 35, 30, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: {
        a: 1,
        k: [
          { t: offset, s: [80, 80, 100] },
          { t: offset + 15, s: [115, 115, 100] },
          { t: offset + 30, s: [80, 80, 100] },
        ],
      },
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        nm: "g",
        it: [
          { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [16, 16] }, nm: "e" },
          { ty: "fl", c: { a: 0, k: WHITE }, o: { a: 0, k: 100 }, nm: "f" },
          groupTransform,
        ],
      },
    ],
    ip: 0,
    op: 60,
    st: 0,
    bm: 0,
  };
}

/** Three dots breathing in sequence — the "working on it" beat. */
export const breathingDots = {
  v: "5.7.4",
  fr: 30,
  ip: 0,
  op: 60,
  w: 100,
  h: 60,
  nm: "breathing-dots",
  ddd: 0,
  assets: [],
  layers: [dot(1, 0), dot(2, 8), dot(3, 16)],
};
