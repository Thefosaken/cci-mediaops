import { getScanSession } from "@/server/actions/scan"
import { ScanClient } from "./scan-client"

export const dynamic = "force-dynamic"

export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { valid, expired } = await getScanSession(token)
  return <ScanClient token={token} valid={valid} expired={expired} />
}
