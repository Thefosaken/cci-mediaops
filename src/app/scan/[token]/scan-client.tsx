"use client"

import { useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { recognizeSerial } from "@/lib/ocr/recognize"
import { submitScanResult } from "@/server/actions/scan"

type Phase = "capture" | "scanning" | "review" | "sending" | "done"

export function ScanClient({
  token,
  valid,
  expired,
}: {
  token: string
  valid: boolean
  expired: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("capture")
  const [progress, setProgress] = useState(0)
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setPhase("scanning")
    setProgress(0)
    setError(null)
    try {
      const result = await recognizeSerial(file, setProgress)
      setText(result)
      setPhase("review")
      if (!result) setError("Couldn't read any text — try again, closer and steadier.")
    } catch {
      setError("Scan failed. Try again.")
      setPhase("capture")
    }
  }

  async function send() {
    if (!text.trim()) return
    setPhase("sending")
    setError(null)
    const r = await submitScanResult(token, text.trim())
    if ("error" in r) {
      setError(r.error)
      setPhase("review")
    } else {
      setPhase("done")
    }
  }

  return (
    <div className="min-h-[100dvh] bg-canvas text-foreground flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-[20px] font-semibold tracking-tight">Scan serial number</h1>
          <p className="mt-1 text-[13px] text-muted">CCI MediaOps</p>
        </div>

        {!valid || expired ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-warning-soft text-warning">
                <AlertTriangle className="h-6 w-6" />
              </span>
              <p className="text-[14px] font-medium">
                {expired ? "This scan link has expired" : "This scan link is invalid"}
              </p>
              <p className="text-[12.5px] text-muted">
                Go back to your computer and press <strong>Scan</strong> again to get a fresh code.
              </p>
            </div>
          </Card>
        ) : phase === "done" ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <p className="text-[15px] font-medium">Sent!</p>
              <p className="text-[13px] text-muted">
                <span className="font-mono text-foreground">{text}</span> is now on your computer.
                You can put your phone down.
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />

            {phase === "scanning" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-muted" />
                <p className="text-[13px] text-muted">Reading the label… {progress ? `${progress}%` : ""}</p>
              </div>
            ) : phase === "review" ? (
              <div className="space-y-4">
                <div>
                  <label className="text-[12px] font-semibold uppercase tracking-wider text-faint">
                    Detected serial — fix any mistakes
                  </label>
                  <Input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Serial number"
                    className="mt-1.5 font-mono text-[16px]"
                    autoFocus
                  />
                </div>
                {error && <p className="text-[12.5px] text-danger">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" fullWidth onClick={() => inputRef.current?.click()}>
                    <RotateCcw className="h-4 w-4" /> Retake
                  </Button>
                  <Button fullWidth onClick={send} disabled={!text.trim()}>
                    Send to computer
                  </Button>
                </div>
              </div>
            ) : phase === "sending" ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Loader2 className="h-7 w-7 animate-spin text-muted" />
                <p className="text-[13px] text-muted">Sending…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-subtle text-muted">
                  <Camera className="h-7 w-7" />
                </span>
                <p className="text-[13px] text-muted">
                  Point your camera at the serial-number label and take a clear, close photo.
                </p>
                {error && <p className="text-[12.5px] text-danger">{error}</p>}
                <Button fullWidth size="lg" onClick={() => inputRef.current?.click()}>
                  <Camera className="h-4 w-4" /> Open camera
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">{children}</div>
  )
}
