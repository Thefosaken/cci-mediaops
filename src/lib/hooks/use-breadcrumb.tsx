"use client"

import * as React from "react"

/**
 * Lets a detail route name itself in the navbar breadcrumb.
 *
 * The breadcrumb derives "CCI › Run Sheets" from the path, but nothing in the URL
 * carries a record's title — only its id. A page that opens a specific record calls
 * `useBreadcrumbLabel(title)` and the navbar renders the third segment.
 *
 * Deliberately generic: any detail route can adopt it, so a record's name in the trail
 * doesn't have to be re-solved per feature.
 */

const BreadcrumbContext = React.createContext<{
  label: string | null
  setLabel: (label: string | null) => void
}>({ label: null, setLabel: () => {} })

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [label, setLabel] = React.useState<string | null>(null)
  const value = React.useMemo(() => ({ label, setLabel }), [label])
  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>
}

export function useBreadcrumb() {
  return React.useContext(BreadcrumbContext)
}

/**
 * Register this page's trailing breadcrumb segment.
 *
 * Clears on unmount so navigating back to a list never leaves a stale record name in
 * the trail.
 */
export function useBreadcrumbLabel(label: string | null) {
  const { setLabel } = useBreadcrumb()

  React.useEffect(() => {
    setLabel(label)
    return () => setLabel(null)
  }, [label, setLabel])
}
