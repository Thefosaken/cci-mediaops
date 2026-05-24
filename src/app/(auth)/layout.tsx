import { Logo } from "@/components/ui/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4">
      <div className="mb-8 flex items-center gap-3">
        <Logo className="h-10 w-auto" />
      </div>
      {children}
    </div>
  )
}
