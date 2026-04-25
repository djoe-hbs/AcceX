import { ReactNode, useState } from 'react'
import { X, FileText, Table2, FileType, File, Loader2, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { clsx } from 'clsx'

// ─── Badge ────────────────────────────────────────────────────────────────────

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange'

const badgeStyles: Record<BadgeVariant, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  orange: 'bg-orange-100 text-orange-700',
}

export function Badge({ children, variant = 'gray' }: { children: ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={clsx('badge', badgeStyles[variant])}>
      {children}
    </span>
  )
}

// ─── Job/Chunk Status Badge ───────────────────────────────────────────────────

const JOB_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  processing: { label: 'Processing', variant: 'blue' },
  ready: { label: 'Ready', variant: 'green' },
  failed: { label: 'Failed', variant: 'red' },
  completed: { label: 'Completed', variant: 'purple' },
  on_rework: { label: 'On Rework', variant: 'orange' },
  fully_completed: { label: 'Fully Completed', variant: 'green' },
  inactive: { label: 'Inactive', variant: 'gray' },
}

const CHUNK_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending', variant: 'gray' },
  assigned: { label: 'Assigned', variant: 'blue' },
  in_validation: { label: 'In Validation', variant: 'yellow' },
  redo: { label: 'Redo', variant: 'orange' },
  completed: { label: 'Completed', variant: 'green' },
}

const ROLE_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  superadmin: { label: 'Super Admin', variant: 'purple' },
  admin: { label: 'Admin', variant: 'blue' },
  sme: { label: 'SME', variant: 'orange' },
  production: { label: 'Production', variant: 'green' },
  validation: { label: 'Validation', variant: 'yellow' },
}

export function JobStatusBadge({ status }: { status: string }) {
  const s = JOB_STATUS_MAP[status] || { label: status, variant: 'gray' as BadgeVariant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function ChunkStatusBadge({ status }: { status: string }) {
  const s = CHUNK_STATUS_MAP[status] || { label: status, variant: 'gray' as BadgeVariant }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

export function RoleBadge({ role }: { role: string }) {
  const r = ROLE_MAP[role] || { label: role, variant: 'gray' as BadgeVariant }
  return <Badge variant={r.variant}>{r.label}</Badge>
}

// ─── File Type Icon ───────────────────────────────────────────────────────────

export function FileTypeIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  if (type === 'pdf') return <FileText className={clsx(className, 'text-red-500')} />
  if (type === 'excel') return <Table2 className={clsx(className, 'text-green-600')} />
  if (type === 'word') return <FileType className={clsx(className, 'text-blue-500')} />
  return <File className={clsx(className, 'text-gray-400')} />
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  open, onClose, title, children, size = 'md'
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null
  const sizeClass = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={clsx('relative bg-white rounded-xl shadow-xl w-full max-h-[90vh] flex flex-col', sizeClass)}>
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Loading ──────────────────────────────────────────────────────────────────

export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sz = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }[size]
  return <Loader2 className={clsx(sz, 'animate-spin text-blue-600')} />
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <LoadingSpinner size="lg" />
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────────────────────────

export function EmptyState({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <File className="w-6 h-6 text-gray-400" />
      </div>
      <h3 className="text-sm font-medium text-gray-900 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, max = 100, className }: {
  value: number
  max?: number
  className?: string
}) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const color = pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-yellow-500'
  return (
    <div className={clsx('w-full bg-gray-100 rounded-full h-2', className)}>
      <div
        className={clsx('h-2 rounded-full transition-all duration-500', color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

export function StatCard({ label, value, sub, color = 'blue' }: {
  label: string
  value: string | number
  sub?: string
  color?: string
}) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={clsx('text-2xl font-semibold', `text-${color}-600`)}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Alert ────────────────────────────────────────────────────────────────────

export function Alert({ type, message }: { type: 'success' | 'error' | 'warning' | 'info'; message: string }) {
  const styles = {
    success: { cls: 'bg-green-50 border-green-200 text-green-800', Icon: CheckCircle },
    error: { cls: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle },
    warning: { cls: 'bg-yellow-50 border-yellow-200 text-yellow-800', Icon: AlertTriangle },
    info: { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Clock },
  }[type]

  return (
    <div className={clsx('flex items-start gap-3 p-3 rounded-lg border text-sm', styles.cls)}>
      <styles.Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger = false }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600 mb-5">{message}</p>
      <div className="flex gap-2 justify-end">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

// ─── Form Field ───────────────────────────────────────────────────────────────

export function FormField({ label, error, children, required }: {
  label: string
  error?: string
  children: ReactNode
  required?: boolean
}) {
  return (
    <div>
      <label className="label">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function Table({ headers, children, loading }: {
  headers: string[]
  children: ReactNode
  loading?: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {headers.map((h) => (
              <th key={h} className="table-th">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {loading ? (
            <tr><td colSpan={headers.length} className="table-td text-center py-8">
              <LoadingSpinner />
            </td></tr>
          ) : children}
        </tbody>
      </table>
    </div>
  )
}
