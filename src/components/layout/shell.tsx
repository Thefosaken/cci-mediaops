"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { Navbar } from "./navbar"
import { ToastProvider } from "@/lib/toast/toast-context"

interface ShellProps {
  children: React.ReactNode
}

export function Shell({ children }: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-canvas">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex shrink-0">
          <Sidebar />
        </div>

        {/* Mobile sidebar backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] lg:hidden transition-opacity duration-300",
            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />

        {/* Mobile sidebar drawer */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-decel lg:hidden shadow-lg",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>

        {/* Main content */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Navbar onMenuClick={() => setSidebarOpen(true)} />
          <main
            className="flex-1 overflow-y-auto bg-canvas"
            id="main-content"
          >
            <div className="animate-fade-in">{children}</div>
          </main>
        </div>
      </div>

      {/* Screen reader live region */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        id="sr-announcer"
      />
    </ToastProvider>
  )
}

// cn needs to be imported here since shell is client
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
