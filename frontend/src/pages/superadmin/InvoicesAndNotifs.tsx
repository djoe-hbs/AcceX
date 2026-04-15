import { EmptyState } from '@/components/shared'

export function InvoicesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-500 mt-0.5">This frontend is now integrated only with the billing features currently exposed by the backend.</p>
      </div>
      <div className="card">
        <EmptyState title="Not available yet" description="Invoice endpoints are not implemented in the current Django API." />
      </div>
    </div>
  )
}

export function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-0.5">Notification polling is disabled because the current backend does not expose notification resources.</p>
      </div>
      <div className="card">
        <EmptyState title="No notification feed" description="When notification endpoints are added on the backend, this page can be connected again." />
      </div>
    </div>
  )
}
