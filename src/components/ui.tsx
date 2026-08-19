import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { classNames } from '@/lib/format'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-emerald-500/15 text-emerald-400',
  PUBLISHED: 'bg-emerald-500/15 text-emerald-400',
  APPROVED: 'bg-emerald-500/15 text-emerald-400',
  RENDERED: 'bg-emerald-500/15 text-emerald-400',
  connected: 'bg-emerald-500/15 text-emerald-400',
  FAILED: 'bg-red-500/15 text-red-400',
  expired: 'bg-red-500/15 text-red-400',
  RETRYING: 'bg-amber-500/15 text-amber-400',
  SCHEDULED: 'bg-sky-500/15 text-sky-400',
  READY: 'bg-sky-500/15 text-sky-400',
  DRAFT: 'bg-zinc-500/15 text-zinc-400',
  DETECTED: 'bg-zinc-500/15 text-zinc-400',
  disconnected: 'bg-zinc-500/15 text-zinc-400',
}

export function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? 'bg-brand-500/15 text-brand-400'
  return (
    <span
      className={classNames(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        color,
      )}
    >
      {status.replaceAll('_', ' ')}
    </span>
  )
}

export function ScoreBadge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color =
    score >= 90 ? 'text-emerald-400' : score >= 75 ? 'text-brand-400' : 'text-zinc-400'
  return (
    <span
      className={classNames(
        'font-bold tabular-nums',
        color,
        size === 'md' ? 'text-lg' : 'text-sm',
      )}
    >
      {Math.round(score)}
    </span>
  )
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={classNames('h-1.5 w-full overflow-hidden rounded-full bg-surface-700', className)}>
      <div
        className="h-full rounded-full bg-brand-500 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-zinc-600">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-zinc-400">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-zinc-400">
      <Loader2 className="h-5 w-5 animate-spin text-brand-500" />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary">
          Retry
        </button>
      )}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className={classNames(
          'card relative z-10 max-h-[90vh] w-full overflow-y-auto p-6',
          wide ? 'max-w-3xl' : 'max-w-lg',
        )}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}
