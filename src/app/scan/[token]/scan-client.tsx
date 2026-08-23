"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, CheckCircle2, Loader2, AlertTriangle, RotateCcw, Aperture } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { downscaleForUpload } from "@/lib/ocr/downscale"
import { ocrSerialImage, submitScanResult } from "@/server/actions/scan"

type Phase = "idle" | "camera" | "scanning" | "review" | "sending" | "done"

export function ScanClient({
  token,
  valid,
  expired,
}: {
  token: string
  valid: boolean
  expired: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Always release the camera when the page goes away.
  useEffect(() => () => stopCamera(), [])

  // Attach the stream once the <video> is mounted (phase === "camera").
  useEffect(() => {
    if (phase === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [phase])

  // Live camera avoids ever decoding a full-resolution photo — modern phones
  // shoot 50–200MP, and just decoding that file OOMs the tab. A 1080p video
  // frame is ~2MP, so capture + canvas is tiny.
  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      setPhase("camera")
    } catch {
      // No camera / permission denied → fall back to the photo picker.
      fileRef.current?.click()
    }
  }

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    try {
      const maxW = 1280
      const scale = Math.min(1, maxW / video.videoWidth)
      const w = Math.round(video.videoWidth * scale)
      const h = Math.round(video.videoHeight * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Canvas not supported")
      ctx.drawImage(video, 0, 0, w, h)
      const px = ctx.getImageData(0, 0, w, h)
      const d = px.data
      for (let i = 0; i < d.length; i += 4) {
        const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0
        d[i] = d[i + 1] = d[i + 2] = g
      }
      ctx.putImageData(px, 0, 0)
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.85))
      stopCamera()
      if (!blob) throw new Error("Capture failed")
      await runOcr(blob)
    } catch {
      stopCamera()
      setError("Capture failed. Try again.")
      setPhase("idle")
    }
  }

  // Fallback path: a photo chosen from the picker. Downscaled client-side too.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setPhase("scanning")
    setError(null)
    try {
      const blob = await downscaleForUpload(file)
      await runOcr(blob)
    } catch {
      setError("Couldn't process that photo. Try the camera instead.")
      setPhase("idle")
    }
  }

  async function runOcr(blob: Blob) {
    setPhase("scanning")
    setError(null)
    const fd = new FormData()
    fd.append("image", blob, "scan.jpg")
    fd.append("token", token)
    const r = await ocrSerialImage(fd)
    if ("error" in r) {
      setError(r.error)
      setPhase("idle")
      return
    }
    setText(r.text)
    setPhase("review")
    if (!r.text) setError("Couldn't read any text — try again, closer and steadier.")
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

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFile}
        />

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
        ) : phase === "camera" ? (
          <Card>
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl bg-black">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video ref={videoRef} playsInline muted className="w-full aspect-[3/4] object-cover" />
              </div>
              <p className="text-center text-[12.5px] text-muted">
                Fill the frame with the serial label, hold steady, then capture.
              </p>
              {error && <p className="text-center text-[12.5px] text-danger">{error}</p>}
              <Button fullWidth size="lg" onClick={capture}>
                <Aperture className="h-4 w-4" /> Capture
              </Button>
            </div>
          </Card>
        ) : phase === "scanning" ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted" />
              <p className="text-[13px] text-muted">Reading the label…</p>
            </div>
          </Card>
        ) : phase === "review" ? (
          <Card>
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
                <Button variant="secondary" fullWidth onClick={startCamera}>
                  <RotateCcw className="h-4 w-4" /> Retake
                </Button>
                <Button fullWidth onClick={send} disabled={!text.trim()}>
                  Send to computer
                </Button>
              </div>
            </div>
          </Card>
        ) : phase === "sending" ? (
          <Card>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-muted" />
              <p className="text-[13px] text-muted">Sending…</p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-subtle text-muted">
                <Camera className="h-7 w-7" />
              </span>
              <p className="text-[13px] text-muted">
                Point your camera at the serial-number label and capture a clear, close shot.
              </p>
              {error && <p className="text-[12.5px] text-danger">{error}</p>}
              <Button fullWidth size="lg" onClick={startCamera}>
                <Camera className="h-4 w-4" /> Open camera
              </Button>
            </div>
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
