// On-device OCR for reading a serial/asset label off a photo. tesseract.js is
// dynamically imported so its ~large wasm core only loads when someone scans.
// Runs entirely in the browser — the image never leaves the device.

export async function recognizeSerial(
  file: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  // Phone cameras produce 12MP+ images; feeding those straight into the wasm
  // OCR core exhausts memory on mobile ("unable to complete previous operation
  // due to low memory"). Downscale to a sane width first — plenty for reading a
  // serial label, and a fraction of the memory.
  const input = await downscaleImage(file, 1600)
  const { default: Tesseract } = await import("tesseract.js")
  const { data } = await Tesseract.recognize(input, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100))
    },
  })
  return cleanSerial(data.text)
}

// Downscale to at most `maxWidth` px wide (keeping aspect), returning a JPEG
// blob. Falls back to the original file if anything goes wrong.
async function downscaleImage(file: File | Blob, maxWidth: number): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file)
    if (bitmap.width <= maxWidth) { bitmap.close?.(); return file }
    const scale = maxWidth / bitmap.width
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) { bitmap.close?.(); return file }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    )
    return blob ?? file
  } catch {
    return file
  }
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
