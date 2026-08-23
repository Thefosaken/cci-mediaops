// Pure text cleanup, shared by the client (nothing) and the server OCR action.
// A serial/asset label is usually one alphanumeric token: pick the line with
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
