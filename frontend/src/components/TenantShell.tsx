import { type ReactNode } from "react"
import { useTenantConfig } from "../hooks/useTenantConfig"

interface TenantShellProps {
  children: ReactNode
  orgSlug: string
}

function LoadingSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="h-6 w-48 animate-pulse rounded-xl bg-white/[0.06]" />
      <div className="h-4 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
    </div>
  )
}

export function TenantShell({ children, orgSlug }: TenantShellProps) {
  const { config, loading } = useTenantConfig(orgSlug)

  if (loading) return <LoadingSkeleton />

  const accentColor = config.branding.primaryColor || "#6366f1"

  return (
    <div
      style={{ "--accent": accentColor } as React.CSSProperties}
      className="min-h-screen"
    >
      {config.branding.name && (
        <div className="flex h-9 items-center border-b border-white/[0.06] bg-white/[0.02] px-4">
          {config.branding.logoUrl && (
            <img
              src={config.branding.logoUrl}
              alt={config.branding.name}
              className="mr-2 h-5 w-5 rounded object-contain"
            />
          )}
          <span className="text-xs font-medium tracking-wide text-zinc-500">
            {config.branding.name}
          </span>
        </div>
      )}

      {children}
    </div>
  )
}
