export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-4">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white text-lg font-bold">
          C
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">CCI MediaOps</p>
          <p className="text-xs text-muted">Media Operations System</p>
        </div>
      </div>
      {children}
    </div>
  )
}
