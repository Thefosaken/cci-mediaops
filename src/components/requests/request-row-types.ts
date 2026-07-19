/**
 * The shape of a request record as fetched by the requests page.
 *
 * Copied verbatim from `requests-page-client.tsx` so the field definitions and
 * both layouts can share one type without either side importing the page.
 */
export type RequestRow = {
  id: string
  title: string
  requesting_unit: string | null
  status: string
  priority: string
  deadline: string | null
  description: string | null
  desired_output: string | null
  approval_required: boolean | null
  created_at: string
  tracking_id: string | null
  requester_name: string | null
  requester_contact: string | null
  public_request_link_id: string | null
  request_sub_teams: { sub_team_id: string; sub_teams: { id: string; name: string } | null }[]
  requester: { full_name: string | null; email: string | null } | null
  events?: { id: string; title: string; start_time: string } | null
}

export type SubTeamLite = { id: string; name: string }
