"use client"

import Image from "next/image"
import { useTheme } from "@/lib/theme/theme-context"
import { cn } from "@/lib/utils/cn"

export function Logo({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme()
  const src = resolvedTheme === "dark" ? "/cci-logo.svg" : "/cci-logo-2.svg"

  return (
    <Image
      src={src}
      alt="CCI"
      width={142}
      height={69}
      className={cn("h-7 w-auto", className)}
      priority
    />
  )
}
