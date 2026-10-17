/** Normalized coordinates keep the selection stable at every screen size. */
export type FrameCrop = { x: number; y: number; width: number; height: number };
export const FULL_FRAME: FrameCrop = { x: 0, y: 0, width: 1, height: 1 };

export function fitFrameCrop(width: number, height: number, ratio = 16 / 9): FrameCrop {
  const aspect = width / height;
  if (aspect > ratio) {
    const w = ratio / aspect;
    return { x: (1 - w) / 2, y: 0, width: w, height: 1 };
  }
  const h = aspect / ratio;
  return { x: 0, y: (1 - h) / 2, width: 1, height: h };
}

export function frameCropPixels(width: number, height: number, crop: FrameCrop) {
  const left = Math.max(0, Math.min(width - 1, Math.floor(crop.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(crop.y * height)));
  return {
    left, top,
    width: Math.max(1, Math.min(width - left, Math.round(crop.width * width))),
    height: Math.max(1, Math.min(height - top, Math.round(crop.height * height))),
  };
}

/** Runs locally; only the selected frame leaves the device. */
export async function prepareFrame(file: File, crop: FrameCrop, mirror: boolean): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const rect = frameCropPixels(bitmap.width, bitmap.height, crop);
    if (rect.width < 64 || rect.height < 64) throw new Error("Выдели область покрупнее — хотя бы 64 × 64 пикселя.");
    const scale = Math.min(1, 640 / Math.max(rect.width, rect.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить изображение. Попробуй другой браузер.");
    if (mirror) { context.translate(canvas.width, 0); context.scale(-1, 1); }
    context.drawImage(bitmap, rect.left, rect.top, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally { bitmap.close(); }
}
