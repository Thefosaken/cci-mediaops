"use client"

import * as React from "react"
import { formatDistanceToNow } from "date-fns"
import { Send, Loader2 } from "lucide-react"
import { Avatar } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { addComment, listComments, type CommentEntity, type Comment } from "@/server/actions/comments"
import { useToast } from "@/lib/toast/toast-context"

interface ActivityThreadProps {
  entityType: CommentEntity
  entityId: string
}

export function ActivityThread({ entityType, entityId }: ActivityThreadProps) {
  const { error: toastError } = useToast()
  const [comments, setComments] = React.useState<Comment[] | null>(null)
  const [body, setBody] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const load = React.useCallback(async () => {
    const list = await listComments(entityType, entityId)
    setComments(list)
  }, [entityType, entityId])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  React.useEffect(() => { void load() }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setSubmitting(true)
    const r = await addComment(entityType, entityId, body)
    setSubmitting(false)
    if (!r.success) toastError(r.error)
    else { setBody(""); await load() }
  }

  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint mb-3">
        Activity
      </p>

      {comments === null ? (
        <div className="flex items-center gap-2 text-[12px] text-faint">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[12px] text-faint mb-3">No activity yet. Start the conversation.</p>
      ) : (
        <ul className="space-y-3 mb-3">
          {comments.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5">
              <Avatar name={c.user?.full_name} email={c.user?.email} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12.5px] font-medium text-foreground">
                    {c.user?.full_name ?? "Unknown"}
                  </span>
                  <span className="text-[11px] text-faint">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-[13px] text-foreground leading-snug mt-0.5 whitespace-pre-wrap">
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={2}
          className="min-h-[60px] text-[13px]"
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={submitting} disabled={!body.trim()}>
            <Send className="h-3 w-3" /> Comment
          </Button>
        </div>
      </form>
    </div>
  )
}
