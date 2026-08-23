// Client-side image shrink used before uploading a photo for server OCR.
// Keeps the upload small (well under the server-action body limit) and does no
// OCR on the device — so nothing memory-heavy runs on the phone.

// Downscale to at most `maxWidth` px wide (keeping aspect), grayscale, and
// return a JPEG Blob. Uses createImageBitmap({ resizeWidth }) so a phone photo
// decodes straight to the target size instead of a full-resolution
// intermediate; falls back to an <img> element where resize isn't honoured.
export async function downscaleForUpload(file: File | Blob, maxWidth = 1280): Promise<Blob> {
  const { source, cleanup } = await decodeScaled(file, maxWidth)
  try {
    const iw = "naturalWidth" in source ? source.naturalWidth : source.width
    const ih = "naturalHeight" in source ? source.naturalHeight : source.height
    const scale = Math.min(1, maxWidth / (iw || maxWidth))
    const w = Math.max(1, Math.round((iw || maxWidth) * scale))
    const h = Math.max(1, Math.round((ih || maxWidth) * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas not supported")
    ctx.drawImage(source, 0, 0, w, h)
    const pixels = ctx.getImageData(0, 0, w, h)
    const d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
      d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(pixels, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    )
    if (!blob) throw new Error("Could not encode the image")
    return blob
  } finally {
    cleanup()
  }
}

async function decodeScaled(
  file: File | Blob,
  maxWidth: number,
): Promise<{ source: CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number }; cleanup: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, {
        resizeWidth: maxWidth,
        resizeQuality: "medium",
      } as ImageBitmapOptions)
      return { source: bmp, cleanup: () => bmp.close?.() }
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    return { source: img, cleanup: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not read the image"))
    img.src = url
  })
}
