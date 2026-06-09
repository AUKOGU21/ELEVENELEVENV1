// Convert any browser-decodable image to a compressed JPEG Blob and downscale it.
//
// Why: iPhones produce HEIC photos, which browsers (Chrome/Firefox/etc.) cannot
// render — uploading them raw results in broken images. Re-encoding through a
// canvas yields a universally-displayable JPEG. On WebKit (iOS Safari/Chrome) HEIC
// decodes natively so this works for the common mobile-upload case. If a browser
// genuinely can't decode the source (e.g. HEIC on desktop Chrome), we throw so the
// caller can fall back to uploading the original file unchanged.
export async function imageToJpeg(file: File, maxDim = 1600, quality = 0.9): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode failed"));
    i.src = dataUrl;
  });

  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
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
  ctx.drawImage(img, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    ),
  );
}
