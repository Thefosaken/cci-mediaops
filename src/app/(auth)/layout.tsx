import { Logo } from "@/components/ui/logo"

/**
 * A single centred column: the mark, then the form, then the credit line.
 *
 * This replaced a split layout whose left half carried a headline, a paragraph
 * of product copy and three stat cards. None of it was doing work — this is an
 * invite-only internal tool, so everyone reaching this screen already knows what
 * it is and is here to do exactly one thing. Removing the pitch leaves the form
 * as the only thing on the page, which is the point of a sign-in.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12">
      {/* Kept from the old left panel: enough texture that the page is not a
          flat void, quiet enough that it never competes with the form. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid opacity-[0.25] dark:opacity-[0.18]"
      />

      <main className="relative z-10 flex w-full max-w-[380px] flex-col items-center">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo className="h-7 w-auto" />
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            MediaOps
          </span>
        </div>

        {/* The column is centred; the form inside it stays left-aligned, so
            labels and inputs read down one edge. Centring the fields too would
            make every row start in a different place. */}
        <div className="w-full">{children}</div>
      </main>

      <p className="relative z-10 mt-10 text-[11.5px] text-faint">
        © Celebration Church International — Media Operations
      </p>
    </div>
  )
}
