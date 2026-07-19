"use client"

import { useState } from "react"
import { format } from "date-fns"
import { CheckCircle2, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/ui/logo"
import { Input, Textarea } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { DatePicker } from "@/components/ui/date-picker"
import { FormField } from "@/components/ui/form-field"
import { AttachmentField } from "@/components/requests/attachment-field"
import { uploadStagedAttachments } from "@/lib/attachments/upload"
import { PRIORITIES, REQUESTING_UNITS } from "@/constants"
import { submitPublicRequest } from "@/server/actions/public-requests"
import type { PublicRequestInput } from "@/lib/validators"

type SubTeamOption = { id: string; name: string }

const EMPTY_FORM: PublicRequestInput = {
  title: "",
  requestingUnit: "",
  requesterName: "",
  requesterContact: "",
  subTeamIds: [],
  description: "",
  desiredOutput: "",
  deadline: "",
  priority: "normal",
}

export function PublicRequestForm({ token, subTeams }: { token: string; subTeams: SubTeamOption[] }) {
  const [submitted, setSubmitted] = useState(false)
  const [trackingId, setTrackingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [unitCustom, setUnitCustom] = useState(false)
  /**
   * Held, not uploaded. There is no request to attach them to until the form is
   * submitted, and — more to the point — nothing should reach the bucket before
   * the server has seen this token and agreed to it.
   */
  const [attachments, setAttachments] = useState<File[]>([])
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null)
  const dateFilled = format(new Date(), "MMM d, yyyy")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.requestingUnit.trim() || !form.requesterName.trim() || !form.requesterContact.trim()) {
      setError("Please fill in all required fields.")
      return
    }
    if (form.subTeamIds.length === 0) {
      setError("Please select at least one team.")
      return
    }

    setLoading(true)
    setError(null)

    /*
      Everything is wrapped, and `loading` is cleared in `finally`.
      Without this, anything that *throws* rather than returning an error — a
      server action rejecting, a dropped connection mid-upload — leaves the
      button spinning forever with nothing said. A form that hangs silently is
      worse than one that fails loudly: the person cannot tell whether their
      request was filed, so they either give up or submit it four more times.
    */
    try {
      const result = await submitPublicRequest(token, form)

      if (result.error) {
        setError(result.error)
        return
      }

      /*
        Files go up after the request exists — each one is authorised against
        this same token server-side before a single byte is accepted. A failure
        here is not a failed submission: the request is filed and tracked either
        way, so it is reported on the confirmation screen rather than sending
        someone back to a form they have already completed.
      */
      if (attachments.length > 0 && result.requestId) {
        try {
          const failures = await uploadStagedAttachments(attachments, {
            requestId: result.requestId,
            token
          })
          if (failures.length > 0) {
            setAttachmentWarning(
              failures.length === 1
                ? failures[0]
                : `${failures.length} of your files couldn't be attached. Mention them when the team follows up.`
            )
          }
        } catch {
          // The request is saved; only the files failed. Say so on the
          // confirmation screen rather than losing the tracking id.
          setAttachmentWarning(
            "Your files couldn't be attached, but your request was submitted. Mention them when the team follows up."
          )
        }
      }

      setTrackingId(result.trackingId ?? null)
      setSubmitted(true)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? `Could not submit your request: ${err.message}`
          : "Could not submit your request. Check your connection and try again."
      )
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-surface to-canvas p-4">
        <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-8 text-center shadow-lg">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-foreground">Request submitted!</h1>
          <p className="mt-2 text-[13px] text-muted leading-relaxed">
            Your request has been sent to the media team. They&apos;ll follow up with you soon.
          </p>

          {trackingId && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-4 py-2.5">
              <span className="text-[12px] text-faint">Tracking ID:</span>
              <span className="font-mono text-[15px] font-bold tracking-wide text-foreground">{trackingId}</span>
            </div>
          )}

          {/*
            The request landed; only the files didn't. Said as a warning rather
            than an error, and after the tracking ID, so the thing that worked is
            read first.
          */}
          {attachmentWarning && (
            <p
              role="status"
              className="mt-4 rounded-lg border border-warning/30 bg-warning-soft/30 px-4 py-2.5 text-left text-[12.5px] leading-snug text-warning"
            >
              {attachmentWarning}
            </p>
          )}

          {trackingId && (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(`/request/track/${trackingId}`, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Check status
              </Button>
            </div>
          )}

          <p className="mt-6 text-[12px] text-faint">
            You can now close this page.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-surface to-canvas p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          {/*
            This is the only CCI-branded surface an outsider sees, so it carries
            the real mark rather than a generic inbox glyph. `Logo` picks the
            light or dark asset from the resolved theme.
          */}
          <Logo className="mx-auto h-9" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            Media Request
          </h1>
          <p className="mt-1.5 text-[13px] text-muted">
            Fill this form and the media team will get back to you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {error && (
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft/30 px-4 py-2.5 text-[13px] text-danger">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Your name" required className="sm:col-span-2">
                <Input
                  value={form.requesterName}
                  onChange={(e) => setForm({ ...form, requesterName: e.target.value })}
                  placeholder="e.g. John Doe"
                  required
                  autoFocus
                />
              </FormField>
              <FormField label="Email or phone" required className="sm:col-span-2">
                <Input
                  value={form.requesterContact}
                  onChange={(e) => setForm({ ...form, requesterContact: e.target.value })}
                  placeholder="e.g. johndoe@email.com or +234 800 000 0000"
                  required
                />
              </FormField>
              <FormField label="Route to sub-teams" required helper="Select one or more teams" className="sm:col-span-2">
                <Combobox
                  values={form.subTeamIds}
                  onChange={(v) => setForm({ ...form, subTeamIds: v })}
                  options={subTeams.map((st) => ({ value: st.id, label: st.name }))}
                  placeholder="Select sub-teams…"
                />
              </FormField>
              <FormField label="Request title" required className="sm:col-span-2">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Sunday recap video edit"
                  required
                />
              </FormField>
              <FormField label="Department / Unit" required>
                <Select
                  value={unitCustom ? "Others" : form.requestingUnit}
                  onChange={(v) => {
                    if (v === "Others") {
                      setUnitCustom(true)
                      setForm({ ...form, requestingUnit: "" })
                    } else {
                      setUnitCustom(false)
                      setForm({ ...form, requestingUnit: v })
                    }
                  }}
                  options={[
                    { value: "", label: "Select a unit…" },
                    ...REQUESTING_UNITS.map((u) => ({ value: u, label: u })),
                    { value: "Others", label: "Others (type in)" },
                  ]}
                />
              </FormField>
              {unitCustom && (
                <FormField label="Specify unit" required>
                  <Input
                    value={form.requestingUnit}
                    onChange={(e) => setForm({ ...form, requestingUnit: e.target.value })}
                    placeholder="Type your unit name"
                    required
                    autoFocus
                  />
                </FormField>
              )}
              <FormField label="Priority">
                <Select
                  value={form.priority}
                  onChange={(v) => setForm({ ...form, priority: v as "low" | "normal" | "high" | "urgent" })}
                  options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
                />
              </FormField>
              <FormField label="Date filled">
                <Input value={dateFilled} readOnly className="text-muted" tabIndex={-1} />
              </FormField>
              <FormField label="Due date" helper="When do you need this by?">
                <DatePicker
                  value={form.deadline}
                  onChange={(v) => setForm({ ...form, deadline: v })}
                  placeholder="Select due date"
                />
              </FormField>
            </div>
            <FormField label="Description" helper="What do you need and why?">
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe the request in detail…"
                rows={3}
              />
            </FormField>
            <FormField label="Desired output" helper="What does done look like?">
              <Textarea
                value={form.desiredOutput}
                onChange={(e) => setForm({ ...form, desiredOutput: e.target.value })}
                placeholder="e.g. 2-minute video for Instagram Reels"
                rows={2}
              />
            </FormField>
            <AttachmentField
              files={attachments}
              onFilesChange={setAttachments}
              disabled={loading}
              label="Attachments"
            />
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <p className="text-[11.5px] text-faint">
              Your request will be reviewed by the media team.
            </p>
            <Button type="submit" loading={loading} disabled={loading}>
              Submit request
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
