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
// returning a JPEG data URL. Uses an <img> + object URL rather than
// createImageBitmap, which is unreliable on iOS Safari — if it fails there we'd
// silently fall back to the full 12MP image and OOM the tab. Throws on failure
// so the caller surfaces a real error instead of trying the giant original.
async function prepareImage(file: File | Blob, maxWidth: number): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth))
    const w = Math.max(1, Math.round((img.naturalWidth || maxWidth) * scale))
    const h = Math.max(1, Math.round((img.naturalHeight || maxWidth) * scale))
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Canvas not supported")
    ctx.drawImage(img, 0, 0, w, h)
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
    URL.revokeObjectURL(url)
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
