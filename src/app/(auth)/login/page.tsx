import { Suspense } from "react"
import { LoginForm } from "./login-form"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm text-center text-muted-foreground">Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
