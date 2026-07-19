"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Modal } from "@/components/ui/modal"

interface SaveViewDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string) => void
  /** Prefills the field, e.g. the name of the view being branched from. */
  defaultName?: string
}

/** Names the current config and saves it as a new view. */
export function SaveViewDialog({ open, onClose, onSave, defaultName = "" }: SaveViewDialogProps) {
  const [name, setName] = React.useState(defaultName)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const inputId = React.useId()

  // Reset and focus on each open so the dialog never shows a stale name.
  React.useEffect(() => {
    if (!open) return
    setName(defaultName)
    const t = setTimeout(() => inputRef.current?.select(), 40)
    return () => clearTimeout(t)
  }, [open, defaultName])

  const trimmed = name.trim()

  function submit() {
    if (!trimmed) return
    onSave(trimmed)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Save as new view"
      description="Your filters, sorting, grouping, visible fields, and layout are saved together."
      size="sm"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!trimmed} onClick={submit}>
            Save view
          </Button>
        </>
      }
    >
      <div className="py-1">
        <Label htmlFor={inputId}>View name</Label>
        <Input
          ref={inputRef}
          id={inputId}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return
            e.preventDefault()
            submit()
          }}
          placeholder="e.g. Blocked this week"
          className="mt-1.5"
          autoComplete="off"
        />
      </div>
    </Modal>
  )
}
