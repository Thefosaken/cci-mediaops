import * as React from "react"
import { cn } from "@/lib/utils/cn"

/* ── Card ──────────────────────────────────────────── */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "subtle" | "flush"
  }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border-[0.5px] border-border text-foreground",
      {
        "bg-surface shadow-sm": variant === "default",
        "bg-surface-subtle shadow-none": variant === "subtle",
        "bg-surface shadow-none border-0": variant === "flush",
      },
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

/* ── CardHeader ────────────────────────────────────── */
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1 px-6 pt-5 pb-2", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

/* ── CardTitle ─────────────────────────────────────── */
const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-[15px] font-semibold tracking-tight text-foreground leading-snug", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

/* ── CardDescription ───────────────────────────────── */
const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-muted", className)} {...props} />
))
CardDescription.displayName = "CardDescription"

/* ── CardContent ───────────────────────────────────── */
const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("px-6 pb-6 pt-2", className)} {...props} />
))
CardContent.displayName = "CardContent"

/* ── CardFooter ────────────────────────────────────── */
const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-3 px-6 pb-5 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

/* ── CardAction ────────────────────────────────────── */
/**
 * Right-aligned action area in the CardHeader row.
 * Use inside CardHeader alongside CardTitle.
 */
const CardAction = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ml-auto flex items-center gap-2 shrink-0", className)}
    {...props}
  />
))
CardAction.displayName = "CardAction"

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
}
