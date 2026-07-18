"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { Navbar } from "./navbar";
import { CommandPalette, useCommandPaletteShortcut } from "./command-palette";
import { ToastProvider } from "@/lib/toast/toast-context";
import { BreadcrumbProvider } from "@/lib/hooks/use-breadcrumb";
import { cn } from "@/lib/utils/cn";
import type { ShellCounts, ShellNotification } from "@/server/queries/shell";
import type { UserRole } from "@/types";

interface ShellProps {
  children: React.ReactNode;
  counts?: ShellCounts;
  notifications?: ShellNotification[];
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole?: UserRole;
  userRoleLabel?: string | null;
  campusName?: string;
  myTeamName?: string | null;
}

export function Shell({
  children,
  counts,
  notifications = [],
  userId,
  userName,
  userEmail,
  userRole,
  userRoleLabel,
  campusName,
  myTeamName,
}: ShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const openCommand = useCallback(() => setCommandOpen(true), []);
  const closeCommand = useCallback(() => setCommandOpen(false), []);

  useCommandPaletteShortcut(openCommand);

  return (
    <ToastProvider>
      <BreadcrumbProvider>
        <div className="flex h-dvh overflow-hidden bg-canvas">
          {/* Desktop sidebar */}
          <div className="hidden lg:flex shrink-0">
            <Sidebar
              onCommandOpen={openCommand}
              counts={counts}
              campusName={campusName}
              userRole={userRole}
              myTeamName={myTeamName}
            />
          </div>

          {/* Mobile drawer */}
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] lg:hidden transition-opacity duration-300",
              sidebarOpen
                ? "opacity-100 pointer-events-auto"
                : "opacity-0 pointer-events-none",
            )}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div
            className={cn(
              "fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 ease-[var(--ease-out-expo)] lg:hidden shadow-xl",
              sidebarOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar
              onClose={() => setSidebarOpen(false)}
              onCommandOpen={() => {
                openCommand();
                setSidebarOpen(false);
              }}
              counts={counts}
              campusName={campusName}
              userRole={userRole}
              myTeamName={myTeamName}
            />
          </div>

          {/* Main content */}
          <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
            <Navbar
              onMenuClick={() => setSidebarOpen(true)}
              onCommandOpen={openCommand}
              notifications={notifications}
              unreadCount={counts?.unreadNotifications ?? 0}
              userId={userId}
              userName={userName}
              userEmail={userEmail}
              userRoleLabel={userRoleLabel}
            />
            <main
              id="main-content"
              className="flex-1 overflow-y-auto bg-canvas"
            >
              <div className="animate-fade-in">{children}</div>
            </main>
          </div>
        </div>

        {/* Live region */}
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          id="sr-announcer"
        />

        {/* Command palette */}
        <CommandPalette open={commandOpen} onClose={closeCommand} />
      </BreadcrumbProvider>
    </ToastProvider>
  );
}
