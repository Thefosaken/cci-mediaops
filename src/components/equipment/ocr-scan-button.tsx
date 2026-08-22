"use client"

import { useRef, useState } from "react"
import { ScanLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/lib/toast/toast-context"

/**
 * On-device OCR for reading a serial/asset label off a photo. Runs entirely
 * in the browser via tesseract.js — no API key, no cost, and the image never
 * leaves the device. tesseract.js is dynamically imported so its ~large wasm
 * core only loads when someone actually scans.
 */
export function OcrScanButton({
  onResult,
  label = "Scan",
}: {
  onResult: (text: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState(0)
  const { error: toastError, success } = useToast()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // let the same photo be picked again
    if (!file) return
    setScanning(true)
    setProgress(0)
    try {
      const { default: Tesseract } = await import("tesseract.js")
      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100))
        },
      })
      const text = cleanSerial(data.text)
      if (!text) {
        toastError("Couldn't read any text — try a clearer, closer photo.")
        return
      }
      onResult(text)
      success("Serial scanned — double-check it's correct")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Scan failed")
    } finally {
      setScanning(false)
      setProgress(0)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={scanning}
        onClick={() => inputRef.current?.click()}
      >
        {!scanning && <ScanLine className="h-3.5 w-3.5" />}
        {scanning ? (progress ? `${progress}%` : "Scanning…") : label}
      </Button>
    </>
  )
}

// A serial/asset label is usually one alphanumeric token. Pick the line with
// the most serial-like characters, strip OCR punctuation noise, and cap the
// length so a misfire can't dump a whole paragraph into the field.
function cleanSerial(raw: string): string {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return ""
  const best = lines
    .map((l) => ({ l, score: (l.match(/[A-Za-z0-9-]/g) ?? []).length }))
    .sort((a, b) => b.score - a.score)[0].l
  return best.replace(/[^A-Za-z0-9\- /]/g, "").replace(/\s+/g, " ").trim().slice(0, 64)
}
