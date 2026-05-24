"use client"

import { useEffect, useState } from "react"

const KEY = "cci-sidebar-collapsed"

function readStored(): boolean {
  if (typeof window === "undefined") return false
  try {
    return localStorage.getItem(KEY) === "true"
  } catch {
    return false
  }
}

export function useSidebarCollapsed() {
  // Read stored value once during init — avoids setState-in-effect.
  // SSR returns false; client mount picks up the stored value on first paint
  // via the effect below.
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!hydrated) {
      setCollapsed(readStored())
      setHydrated(true)
    }
  }, [hydrated])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(KEY, String(next)) } catch {}
      return next
    })
  }

  return { collapsed, toggle }
}
