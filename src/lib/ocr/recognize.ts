// On-device OCR for reading a serial/asset label off a photo. tesseract.js is
// dynamically imported so its ~large wasm core only loads when someone scans.
// Runs entirely in the browser — the image never leaves the device.

export async function recognizeSerial(
  file: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js")
  const { data } = await Tesseract.recognize(file, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100))
    },
  })
  return cleanSerial(data.text)
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
