import { cn } from "@/lib/utils/cn"

interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  size?: "sm" | "default"
}

/** Linear/Vercel-style keyboard hint badge. */
export function Kbd({ className, size = "default", children, ...props }: KbdProps) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center font-mono font-medium",
        "border border-border bg-surface text-faint",
        "rounded shadow-sm",
        size === "sm" ? "h-4 min-w-4 px-1 text-[10px]" : "h-5 min-w-5 px-1.5 text-[11px]",
        className
      )}
      {...props}
    >
      {children}
    </kbd>
  )
}
