import "server-only"
import { APP_URL } from "./index"

/**
 * Minimal, brand-aligned email templates.
 * Keep these as inline HTML — no JSX renderer to keep the bundle small.
 * Calm, monochrome, mirrors the in-app aesthetic.
 */

const PALETTE = {
  bg: "#FAFAFA",
  surface: "#FFFFFF",
  text: "#0A0A0A",
  muted: "#525252",
  faint: "#8A8A8A",
  border: "#EAEAEA",
  primary: "#D32126",
}

function shell(opts: {
  preheader: string
  heading: string
  body: string
  ctaLabel?: string
  ctaHref?: string
  footer?: string
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PALETTE.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${PALETTE.text};-webkit-font-smoothing:antialiased;">
<span style="display:none!important;opacity:0;color:transparent;visibility:hidden;mso-hide:all;height:0;width:0;overflow:hidden;">${escape(opts.preheader)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PALETTE.bg};padding:40px 20px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:520px;background:${PALETTE.surface};border:1px solid ${PALETTE.border};border-radius:14px;">
<tr><td style="padding:24px 28px 8px;">
<div style="font-size:13px;font-weight:600;letter-spacing:-0.01em;color:${PALETTE.text};">
<span style="display:inline-block;width:8px;height:8px;background:${PALETTE.primary};border-radius:2px;vertical-align:middle;margin-right:8px;"></span>CCI MediaOps
</div>
</td></tr>
<tr><td style="padding:8px 28px 4px;">
<h1 style="margin:0;font-size:20px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${PALETTE.text};">${escape(opts.heading)}</h1>
</td></tr>
<tr><td style="padding:12px 28px 20px;">
<div style="font-size:14.5px;line-height:1.55;color:${PALETTE.muted};">${opts.body}</div>
${opts.ctaLabel && opts.ctaHref ? `
<div style="padding-top:20px;">
<a href="${opts.ctaHref}" style="display:inline-block;background:${PALETTE.text};color:#fff;text-decoration:none;font-size:13.5px;font-weight:500;padding:9px 16px;border-radius:8px;">${escape(opts.ctaLabel)} &nbsp;→</a>
</div>` : ""}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${PALETTE.border};">
<div style="font-size:11.5px;color:${PALETTE.faint};line-height:1.5;">
${opts.footer ?? "You're receiving this because you have an account at CCI MediaOps."}
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/* ── Templates ────────────────────────────────────────────────────────── */

export function adminNewSignupEmail(input: {
  newUserName: string
  newUserEmail: string
}) {
  return {
    subject: `New sign-up: ${input.newUserName} is waiting for approval`,
    text: `${input.newUserName} (${input.newUserEmail}) just signed up and is waiting for approval.\n\nReview pending users: ${APP_URL}/settings?section=users`,
    html: shell({
      preheader: `${input.newUserName} just signed up.`,
      heading: "Someone's waiting for approval",
      body: `<p style="margin:0 0 12px;"><strong style="color:${PALETTE.text};">${escape(input.newUserName)}</strong> just signed up to CCI MediaOps.</p>
        <p style="margin:0 0 4px;color:${PALETTE.faint};font-size:12.5px;">${escape(input.newUserEmail)}</p>
        <p style="margin:14px 0 0;">Open the admin settings to approve them and assign a role.</p>`,
      ctaLabel: "Review pending users",
      ctaHref: `${APP_URL}/settings?section=users`,
      footer:
        "You're receiving this because you're an admin on CCI MediaOps.",
    }),
  }
}

export function userApprovedEmail(input: {
  userName: string
  roleLabel: string
}) {
  return {
    subject: "Your CCI MediaOps account is active",
    text: `Hi ${input.userName},\n\nYou've been approved as ${input.roleLabel}. Sign in at ${APP_URL}/login to get started.`,
    html: shell({
      preheader: "You're in. Sign in to get started.",
      heading: "You're in",
      body: `<p style="margin:0 0 12px;">Hi ${escape(input.userName)},</p>
        <p style="margin:0 0 12px;">An admin has approved your account. You've been added as <strong style="color:${PALETTE.text};">${escape(input.roleLabel)}</strong>.</p>
        <p style="margin:0;">Sign in to set up your profile and join your sub-teams.</p>`,
      ctaLabel: "Sign in",
      ctaHref: `${APP_URL}/login`,
    }),
  }
}

export function leadJoinRequestEmail(input: {
  leadName: string
  requesterName: string
  subTeamName: string
}) {
  return {
    subject: `${input.requesterName} wants to join ${input.subTeamName}`,
    text: `${input.requesterName} has asked to join ${input.subTeamName}. Review the request: ${APP_URL}/sub-teams`,
    html: shell({
      preheader: `${input.requesterName} wants to join ${input.subTeamName}.`,
      heading: `New join request for ${input.subTeamName}`,
      body: `<p style="margin:0 0 12px;">Hi ${escape(input.leadName)},</p>
        <p style="margin:0 0 12px;"><strong style="color:${PALETTE.text};">${escape(input.requesterName)}</strong> has asked to join <strong style="color:${PALETTE.text};">${escape(input.subTeamName)}</strong>.</p>
        <p style="margin:0;">You can approve or decline from the sub-team page.</p>`,
      ctaLabel: "Review request",
      ctaHref: `${APP_URL}/sub-teams`,
    }),
  }
}

export function joinRequestApprovedEmail(input: {
  userName: string
  subTeamName: string
}) {
  return {
    subject: `You're in ${input.subTeamName}`,
    text: `Hi ${input.userName}, your request to join ${input.subTeamName} has been approved. Open the team: ${APP_URL}/sub-teams`,
    html: shell({
      preheader: `Welcome to ${input.subTeamName}.`,
      heading: `You're in ${input.subTeamName}`,
      body: `<p style="margin:0 0 12px;">Hi ${escape(input.userName)},</p>
        <p style="margin:0 0 12px;">Your request to join <strong style="color:${PALETTE.text};">${escape(input.subTeamName)}</strong> has been approved.</p>
        <p style="margin:0;">You'll start seeing assignments, requests, and equipment for this team.</p>`,
      ctaLabel: "Open sub-team",
      ctaHref: `${APP_URL}/sub-teams`,
    }),
  }
}
