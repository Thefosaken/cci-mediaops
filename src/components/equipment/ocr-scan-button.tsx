"use client"

import { useEffect, useRef, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { ScanLine, Loader2, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import { useToast } from "@/lib/toast/toast-context"
import { createClient } from "@/lib/supabase/client"
import { downscaleForUpload } from "@/lib/ocr/downscale"
import { createScanSession, ocrSerialImage } from "@/server/actions/scan"

/**
 * Read an equipment serial from a photo.
 *
 * On a phone the camera is right here, so scanning happens on-device inline.
 * On a desktop we hand off to the phone: a QR opens /scan/<token> on the
 * phone, which reads the serial on-device and writes it back; we're subscribed
 * to that session over Realtime and fill the field the moment it lands.
 */
export function OcrScanButton({
  onResult,
  label = "Scan",
}: {
  onResult: (text: string) => void
  label?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { error: toastError, success } = useToast()

  const [mobileScanning, setMobileScanning] = useState(false)

  const [qrOpen, setQrOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [url, setUrl] = useState("")

  // Keep the latest onResult without resubscribing the Realtime channel.
  const onResultRef = useRef(onResult)
  useEffect(() => { onResultRef.current = onResult }, [onResult])

  function isMobile() {
    if (typeof navigator === "undefined") return false
    return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  }

  async function handleClick() {
    if (isMobile()) { inputRef.current?.click(); return }
    setCreating(true)
    const r = await createScanSession()
    setCreating(false)
    if ("error" in r) { toastError(r.error); return }
    setToken(r.token)
    setUrl(`${window.location.origin}/scan/${r.token}`)
    setQrOpen(true)
  }

  // Desktop: listen for the phone's write.
  useEffect(() => {
    if (!qrOpen || !token) return
    const supabase = createClient()
    const channel = supabase
      .channel(`scan-${token}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scan_sessions", filter: `token=eq.${token}` },
        (payload) => {
          const result = (payload.new as { result?: string | null }).result
          if (result) {
            onResultRef.current(result)
            success("Serial received from your phone")
            setQrOpen(false)
            setToken(null)
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qrOpen, token, success])

  // Mobile: shrink the photo here and OCR it on the server.
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setMobileScanning(true)
    try {
      const blob = await downscaleForUpload(file)
      const fd = new FormData()
      fd.append("image", blob, "scan.jpg")
      const r = await ocrSerialImage(fd)
      if ("error" in r) { toastError(r.error); return }
      if (!r.text) { toastError("Couldn't read any text — try a clearer, closer photo."); return }
      onResult(r.text)
      success("Serial scanned — double-check it's correct")
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Scan failed")
    } finally {
      setMobileScanning(false)
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
        loading={mobileScanning || creating}
        onClick={handleClick}
      >
        {!mobileScanning && !creating && <ScanLine className="h-3.5 w-3.5" />}
        {mobileScanning ? "Scanning…" : label}
      </Button>

      <Modal
        open={qrOpen}
        onClose={() => { setQrOpen(false); setToken(null) }}
        title="Scan with your phone"
        description="Point your phone camera at this code to open the scanner."
        size="sm"
        elevated
        footer={<Button variant="ghost" onClick={() => { setQrOpen(false); setToken(null) }}>Cancel</Button>}
      >
        <div className="flex flex-col items-center gap-4 py-2">
          {url && (
            <div className="rounded-xl bg-white p-3">
              <QRCodeSVG value={url} size={196} />
            </div>
          )}
          <ol className="w-full space-y-1.5 text-[12.5px] text-muted">
            <li>1. Open your phone camera and point it at the code.</li>
            <li>2. Tap the link, then photograph the serial label.</li>
            <li>3. It appears here automatically — no typing.</li>
          </ol>
          <p className="flex items-center gap-1.5 text-[12px] text-faint">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for your phone…
            <Smartphone className="h-3.5 w-3.5" />
          </p>
        </div>
      </Modal>
    </>
  )
}
