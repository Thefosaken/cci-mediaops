// On-device OCR for reading a serial/asset label off a photo. tesseract.js is
// dynamically imported so its ~large wasm core only loads when someone scans.
// Runs entirely in the browser — the image never leaves the device.

export async function recognizeSerial(
  file: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  // Phone cameras produce 12MP+ images; feeding those straight into the wasm
  // OCR core makes mobile Safari kill the tab ("unable to complete previous
  // operation due to low memory"). Downscale to a small grayscale image first —
  // ample for reading a serial label, a fraction of the memory.
  const input = await prepareImage(file, 1280)
  const { default: Tesseract } = await import("tesseract.js")
  const { data } = await Tesseract.recognize(input, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100))
    },
  })
  return cleanSerial(data.text)
}

// Downscale to at most `maxWidth` px wide (keeping aspect) and grayscale it,
// returning a JPEG data URL. Throws on failure so the caller surfaces a real
// error instead of feeding the full 12MP original to the wasm core.
async function prepareImage(file: File | Blob, maxWidth: number): Promise<string> {
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
    // Grayscale in place — smaller to encode and easier for OCR.
    const pixels = ctx.getImageData(0, 0, w, h)
    const d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
      d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(pixels, 0, 0)
    return canvas.toDataURL("image/jpeg", 0.85)
  } finally {
    cleanup()
  }
}

// Decode the image, downscaling during decode where possible. createImageBitmap
// with resizeWidth decodes straight to the target size without a full-resolution
// intermediate — the difference between ~5MB and ~50MB of peak memory for a
// phone photo, which is what was OOM-ing the tab. Falls back to an <img> element
// where the resize options aren't honoured.
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

// A serial/asset label is usually one alphanumeric token. Pick the line with
// the most serial-like characters, strip OCR punctuation noise, and cap the
// length so a misfire can't dump a whole paragraph into the field.
export function cleanSerial(raw: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ""
  const best = lines
    .map((l) => ({ l, score: (l.match(/[A-Za-z0-9-]/g) ?? []).length }))
    .sort((a, b) => b.score - a.score)[0].l
  return best.replace(/[^A-Za-z0-9\- /]/g, "").replace(/\s+/g, " ").trim().slice(0, 64)
}
