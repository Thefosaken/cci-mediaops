import { cleanSerial } from "./clean"

// Client-side OCR on an already-small image (a live-camera frame or a
// downscaled photo). Tesseract is dynamically imported so its core only loads
// when someone actually scans. Running on a ~1280px frame keeps memory modest —
// the earlier out-of-memory crashes came from decoding full-resolution phone
// photos, which no longer happens.
export async function recognizeBlob(
  blob: Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js")
  const { data } = await Tesseract.recognize(blob, "eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100))
    },
  })
  return cleanSerial(data.text)
}
