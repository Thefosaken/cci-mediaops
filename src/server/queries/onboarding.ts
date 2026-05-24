import { createClient } from "@/lib/supabase/server"
import type { ChecklistItem } from "@/components/onboarding/getting-started"

export interface OnboardingState {
  /** When null, the user hasn't completed the welcome flow. */
  onboardedAt: string | null
  /** Profile fields complete: full_name + phone */
  profileComplete: boolean
  /** Has joined at least one sub-team (membership exists) */
  hasSubTeam: boolean
  /** Has at least one pending or approved join request */
  hasSubmittedJoinRequest: boolean
  /** Has submitted at least one media request */
  hasSubmittedRequest: boolean
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const supabase = await createClient()

  const [profileRes, subTeamRes, joinReqRes, requestRes] = await Promise.all([
    supabase.from("users").select("phone, onboarded_at, full_name").eq("id", userId).single(),
    supabase
      .from("sub_team_memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase
      .from("sub_team_join_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["pending", "approved"]),
    supabase
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("requester_id", userId),
  ])

  const profile = profileRes.data
  return {
    onboardedAt: profile?.onboarded_at ?? null,
    profileComplete: Boolean(profile?.full_name && profile?.phone),
    hasSubTeam: (subTeamRes.count ?? 0) > 0,
    hasSubmittedJoinRequest: (joinReqRes.count ?? 0) > 0,
    hasSubmittedRequest: (requestRes.count ?? 0) > 0,
  }
}

export function buildChecklist(state: OnboardingState): ChecklistItem[] {
  return [
    {
      id: "profile",
      label: "Complete your profile",
      description: "Add your phone number for high-priority alerts.",
      href: "/settings?section=profile",
      done: state.profileComplete,
    },
    {
      id: "sub-team",
      label: "Join a sub-team",
      description: "Pick the teams you serve in — a lead will approve.",
      href: "/sub-teams",
      done: state.hasSubTeam || state.hasSubmittedJoinRequest,
    },
    {
      id: "calendar",
      label: "Browse the calendar",
      description: "See what's coming up this week.",
      href: "/calendar",
      done: false, // we don't track this; it's just a nudge
    },
    {
      id: "request",
      label: "Send your first request",
      description: "Try the request flow — even a small one.",
      href: "/requests?new=1",
      done: state.hasSubmittedRequest,
    },
  ]
}
