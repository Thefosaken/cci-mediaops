import Image from "next/image"
import { cn } from "@/lib/utils/cn"

/**
 * The CCI mark.
 *
 * Both assets render and CSS picks one from `[data-theme]` on `<html>`, rather
 * than JS choosing from `useTheme()`. That distinction is the fix: the theme
 * attribute is what actually paints the page, so keying off it makes the logo
 * incapable of disagreeing with its own background. The previous version read
 * `resolvedTheme` from React state, which starts at a default and only settles
 * after hydration — so on a dark page the dark-ink mark could paint first,
 * which is exactly the "logo isn't white in dark mode" symptom. It was worst on
 * the public pages, which a first-time visitor loads cold.
 *
 * `cci-logo.svg` is the white mark (dark backgrounds); `cci-logo-2.svg` is the
 * dark-ink mark (light backgrounds).
 *
 * No `"use client"`: with the swap in CSS this renders in server components,
 * which the public tracking page needs.
 */
export function Logo({ className }: { className?: string }) {
  const shared = cn("h-7 w-auto", className)

  return (
    // The name lives on the wrapper, not on either image: whichever image is
    // hidden is `display:none` and invisible to assistive tech, so labelling
    // them individually would leave one theme announcing nothing and the other
    // announcing "CCI" twice.
    <span role="img" aria-label="CCI" className="contents">
      <Image
        src="/cci-logo-2.svg"
        alt=""
        width={142}
        height={69}
        className={cn(shared, "[[data-theme=dark]_&]:hidden")}
        priority
      />
      <Image
        src="/cci-logo.svg"
        alt=""
        width={142}
        height={69}
        className={cn(shared, "hidden [[data-theme=dark]_&]:block")}
        priority
      />
    </span>
  )
}
