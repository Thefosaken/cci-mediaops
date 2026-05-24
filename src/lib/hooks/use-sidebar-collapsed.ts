"use client"

import { useEffect, useState } from "react"

const KEY = "cci-sidebar-collapsed"

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY)
      if (stored !== null) setCollapsed(stored === "true")
    } catch {}
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem(KEY, String(next)) } catch {}
      return next
    })
  }

  return { collapsed, toggle }
}
