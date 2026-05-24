import type { Metadata } from "next"
import "./globals.css"
import { ThemeProvider } from "@/lib/theme/theme-context"

export const metadata: Metadata = {
  title: "CCI MediaOps",
  description: "Celebration Church International Media Operations System",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
