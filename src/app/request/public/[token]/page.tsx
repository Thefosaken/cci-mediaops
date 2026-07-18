import { PublicRequestForm } from "./page-client"

export const dynamic = "force-dynamic"

export default async function PublicRequestPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  return <PublicRequestForm token={token} />
}
