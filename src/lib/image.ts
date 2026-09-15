// Convert an image to a compressed JPEG Blob and downscale it.
//
// Why: iPhones produce HEIC photos, which only Safari can display. Uploading one
// raw means a broken image for everyone on Chrome, Firefox or Edge. The browser
// decodes JPEG/PNG/WebP itself (and Safari decodes HEIC), so the canvas path
// covers those. When it can't, which is HEIC anywhere but Safari, we decode with
// libheif (heic-to), loaded only on that path so it stays out of the main bundle,
// and re-encode the same way. We throw only if both decoders fail.

type Picture = { source: CanvasImageSource; width: number; height: number; done?: () => void };

async function decodeNative(file: Blob): Promise<Picture> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = url;
    });
    return { source: img, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeHeic(file: Blob): Promise<Picture> {
  const { heicTo } = await import("heic-to");
  const bmp = await heicTo({ blob: file, type: "bitmap" });
  return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
}

export async function imageToJpeg(file: Blob, maxDim = 1600, quality = 0.9): Promise<Blob> {
  let pic: Picture;
  try {
    pic = await decodeNative(file);
  } catch (nativeErr) {
    // Chrome often reports HEIC with an empty type, so try libheif on anything
    // the browser couldn't read rather than trusting the label.
    try { pic = await decodeHeic(file); } catch { throw nativeErr; }
  }

  let w = pic.width;
  let h = pic.height;
  if (Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas context");
  ctx.drawImage(pic.source, 0, 0, w, h);
  pic.done?.();

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    ),
  );
}
