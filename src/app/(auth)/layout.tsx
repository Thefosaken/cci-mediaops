import Link from "next/link"
import { Logo } from "@/components/ui/logo"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-canvas lg:grid-cols-[1fr_minmax(420px,520px)]">
      {/* Left: brand / atmosphere — desktop only */}
      <aside className="hidden lg:flex relative flex-col justify-between p-10 bg-surface border-r border-border overflow-hidden">
        <div className="relative z-10 flex items-center gap-2.5">
          <Logo className="h-7 w-auto" />
          <span className="text-[13px] font-semibold text-foreground tracking-tight">
            MediaOps
          </span>
        </div>

        <div className="relative z-10 space-y-6 max-w-md">
          <h2 className="text-[28px] font-semibold text-foreground tracking-tight leading-[1.15]">
            One place to run every media operation in the church.
          </h2>
          <p className="text-[14px] text-muted leading-relaxed">
            Schedule services, route requests, assign sub-teams, manage equipment,
            and run a clean service from a single calm workspace.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[
              ["100%", "Operational"],
              ["7", "Sub-teams"],
              ["v0.1", "Internal"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-border bg-canvas px-3 py-2.5">
                <div className="text-[16px] font-semibold text-foreground tracking-tight">
                  {value}
                </div>
                <div className="text-[11px] text-faint mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11.5px] text-faint">
          © Celebration Church International — Media Operations
        </div>

        {/* Decorative grid background */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-grid opacity-[0.35] dark:opacity-[0.25] pointer-events-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-tr from-canvas via-transparent to-transparent pointer-events-none"
        />
      </aside>

      {/* Right: auth form */}
      <main className="flex flex-col">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between px-5 h-14 border-b border-border">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-auto" />
            <span className="text-[13px] font-semibold text-foreground">MediaOps</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:py-16">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>

        <div className="px-5 pb-6 text-center lg:hidden">
          <p className="text-[11.5px] text-faint">
            © Celebration Church International
          </p>
        </div>
      </main>
    </div>
  )
}
