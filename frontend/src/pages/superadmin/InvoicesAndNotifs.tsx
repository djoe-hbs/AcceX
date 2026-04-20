import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/api/client'
import { invoiceApi, type Invoice } from '@/api/invoice'
import { Alert, Badge, EmptyState, Modal, Table } from '@/components/shared'
import { Mail, Plus, Receipt, RefreshCw } from 'lucide-react'

function padMonth(value: number) {
  return String(value).padStart(2, '0')
}

function formatPeriod(invoice: Invoice) {
  return `${invoice.year}-${padMonth(invoice.month)}`
}

function formatCurrency(value: string) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

function formatDate(value?: string | null) {
  if (!value) return 'Not sent'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function triggerVariant(trigger: string) {
  return trigger === 'AUTO' ? 'blue' : 'purple'
}

function statusVariant(status: string) {
  return status === 'SENT' ? 'green' : 'yellow'
}

export function InvoicesPage() {
  const queryClient = useQueryClient()
  const now = new Date()
  const [filters, setFilters] = useState({
    clientId: '',
    year: String(now.getFullYear()),
    month: '',
  })
  const [showGenerate, setShowGenerate] = useState(false)
  const [showMonthlyGenerate, setShowMonthlyGenerate] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const invoiceFilters = useMemo(
    () => ({
      clientId: filters.clientId || undefined,
      year: filters.year ? Number(filters.year) : undefined,
      month: filters.month ? Number(filters.month) : undefined,
    }),
    [filters]
  )

  const { data: clientsResponse } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
    refetchInterval: 15000,
  })

  const { data: invoicesResponse, isLoading } = useQuery({
    queryKey: ['invoices', invoiceFilters],
    queryFn: () => invoiceApi.list(invoiceFilters),
    refetchInterval: 15000,
  })

  const selectedInvoice = useMemo(
    () => invoicesResponse?.data.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoicesResponse?.data, selectedInvoiceId]
  )

  const refreshInvoices = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  const clients = clientsResponse?.data || []
  const invoices = invoicesResponse?.data || []

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
          <p className="mt-0.5 text-sm text-gray-500">Generate, review, and email client invoices from the backend billing engine.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowMonthlyGenerate(true)}>
            <RefreshCw className="h-4 w-4" />
            Generate Monthly
          </button>
          <button className="btn-primary" onClick={() => setShowGenerate(true)}>
            <Plus className="h-4 w-4" />
            Generate Invoice
          </button>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} message={feedback.message} />}

      <div className="card">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div>
            <label className="label">Client</label>
            <select
              className="input"
              value={filters.clientId}
              onChange={(e) => setFilters((current) => ({ ...current, clientId: e.target.value }))}
            >
              <option value="">All clients</option>
              {clients.map((client: any) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Year</label>
            <input
              className="input"
              type="number"
              min="2000"
              max="3000"
              value={filters.year}
              onChange={(e) => setFilters((current) => ({ ...current, year: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Month</label>
            <select
              className="input"
              value={filters.month}
              onChange={(e) => setFilters((current) => ({ ...current, month: e.target.value }))}
            >
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={String(month)}>
                  {padMonth(month)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              className="btn-secondary w-full"
              onClick={() => setFilters({ clientId: '', year: String(now.getFullYear()), month: '' })}
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['Client', 'Period', 'Trigger', 'Status', 'Total', 'Sent', '']} loading={isLoading}>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="hover:bg-gray-50">
              <td className="table-td">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Receipt className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{invoice.client_name}</p>
                    <p className="text-xs text-gray-500">{invoice.items.length} item(s)</p>
                  </div>
                </div>
              </td>
              <td className="table-td text-gray-600">{formatPeriod(invoice)}</td>
              <td className="table-td">
                <Badge variant={triggerVariant(invoice.trigger) as any}>{invoice.trigger}</Badge>
              </td>
              <td className="table-td">
                <Badge variant={statusVariant(invoice.status) as any}>{invoice.status}</Badge>
              </td>
              <td className="table-td font-medium text-gray-900">{formatCurrency(invoice.total_amount)}</td>
              <td className="table-td text-gray-600">{formatDate(invoice.sent_at)}</td>
              <td className="table-td">
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary !px-3 !py-2 text-xs" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    View
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {!isLoading && invoices.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState title="No invoices found" description="Generate a client invoice or run the monthly billing flow." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      {showGenerate && (
        <GenerateInvoiceModal
          clients={clients}
          onClose={() => setShowGenerate(false)}
          onSuccess={(message) => {
            setFeedback({ type: 'success', message })
            refreshInvoices()
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      )}

      {showMonthlyGenerate && (
        <GenerateMonthlyInvoicesModal
          onClose={() => setShowMonthlyGenerate(false)}
          onSuccess={(message) => {
            setFeedback({ type: 'success', message })
            refreshInvoices()
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      )}

      {selectedInvoice && (
        <InvoiceDetailsModal
          invoiceId={selectedInvoice.id}
          onClose={() => setSelectedInvoiceId(null)}
          onSuccess={(message) => {
            setFeedback({ type: 'success', message })
            refreshInvoices()
          }}
          onError={(message) => setFeedback({ type: 'error', message })}
        />
      )}
    </div>
  )
}

function GenerateInvoiceModal({
  clients,
  onClose,
  onSuccess,
  onError,
}: {
  clients: any[]
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const now = new Date()
  const [form, setForm] = useState({
    client_id: clients[0]?.id || '',
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    send_email: true,
  })

  const mutation = useMutation({
    mutationFn: () =>
      invoiceApi.generate({
        client_id: form.client_id,
        year: Number(form.year),
        month: Number(form.month),
        send_email: form.send_email,
      }),
    onSuccess: (response) => {
      onSuccess(`Invoice generated for ${response.data.client_name} (${formatPeriod(response.data)}).`)
      onClose()
    },
    onError: (error: any) => {
      onError(error.response?.data?.detail || error.response?.data?.client_id?.[0] || 'Unable to generate invoice.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Generate Invoice" size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Client</label>
          <select
            className="input"
            value={form.client_id}
            onChange={(e) => setForm((current) => ({ ...current, client_id: e.target.value }))}
          >
            <option value="">Select client</option>
            {clients.map((client: any) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Year</label>
            <input
              className="input"
              type="number"
              min="2000"
              max="3000"
              value={form.year}
              onChange={(e) => setForm((current) => ({ ...current, year: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Month</label>
            <select
              className="input"
              value={form.month}
              onChange={(e) => setForm((current) => ({ ...current, month: e.target.value }))}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={String(month)}>
                  {padMonth(month)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.send_email}
            onChange={(e) => setForm((current) => ({ ...current, send_email: e.target.checked }))}
          />
          Send invoice email immediately
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !form.client_id}>
            {mutation.isPending ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function GenerateMonthlyInvoicesModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const now = new Date()
  const [form, setForm] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    send_email: true,
  })

  const mutation = useMutation({
    mutationFn: () =>
      invoiceApi.generateMonthly({
        year: Number(form.year),
        month: Number(form.month),
        send_email: form.send_email,
      }),
    onSuccess: (response) => {
      onSuccess(`Generated ${response.data.count} invoice(s) for ${form.year}-${padMonth(Number(form.month))}.`)
      onClose()
    },
    onError: (error: any) => {
      onError(error.response?.data?.detail || 'Unable to generate monthly invoices.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Generate Monthly Invoices" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Year</label>
            <input
              className="input"
              type="number"
              min="2000"
              max="3000"
              value={form.year}
              onChange={(e) => setForm((current) => ({ ...current, year: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Month</label>
            <select
              className="input"
              value={form.month}
              onChange={(e) => setForm((current) => ({ ...current, month: e.target.value }))}
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                <option key={month} value={String(month)}>
                  {padMonth(month)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.send_email}
            onChange={(e) => setForm((current) => ({ ...current, send_email: e.target.checked }))}
          />
          Send invoice emails after generation
        </label>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Generating...' : 'Generate Monthly'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function InvoiceDetailsModal({
  invoiceId,
  onClose,
  onSuccess,
  onError,
}: {
  invoiceId: string
  onClose: () => void
  onSuccess: (message: string) => void
  onError: (message: string) => void
}) {
  const queryClient = useQueryClient()
  const [recipients, setRecipients] = useState('vibecoder.hbs@gmail.com')

  const { data, isLoading } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => invoiceApi.get(invoiceId),
    refetchInterval: 15000,
  })

  const invoice = data?.data

  const sendMutation = useMutation({
    mutationFn: () =>
      invoiceApi.sendEmail(invoiceId, {
        recipients: recipients
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      onSuccess('Invoice email sent.')
    },
    onError: (error: any) => {
      onError(error.response?.data?.detail || 'Unable to send invoice email.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Invoice Details" size="xl">
      {isLoading || !invoice ? (
        <div className="py-10 text-center text-sm text-gray-500">Loading invoice details...</div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Client</p>
              <p className="mt-1 font-medium text-gray-900">{invoice.client_name}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Period</p>
              <p className="mt-1 font-medium text-gray-900">{formatPeriod(invoice)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
              <div className="mt-1">
                <Badge variant={statusVariant(invoice.status) as any}>{invoice.status}</Badge>
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total</p>
              <p className="mt-1 font-medium text-gray-900">{formatCurrency(invoice.total_amount)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-gray-900">Email Invoice</h3>
                <p className="mt-1 text-sm text-gray-500">Leave recipients empty to let the backend use its default invoice recipients.</p>
              </div>
              <button className="btn-primary" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
                <Mail className="h-4 w-4" />
                {sendMutation.isPending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
            <textarea
              className="input mt-3 min-h-24"
              placeholder="email1@example.com, email2@example.com"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
          </div>

          <div className="card p-0 overflow-hidden shadow-none">
            <Table headers={['Description', 'Batch', 'File', 'Quantity', 'Unit Cost', 'Amount']}>
              {invoice.items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="table-td text-gray-900">{item.description}</td>
                  <td className="table-td text-gray-600">{item.batch_name || '-'}</td>
                  <td className="table-td text-gray-600">{item.work_file_path || '-'}</td>
                  <td className="table-td text-gray-600">{item.quantity}</td>
                  <td className="table-td text-gray-600">{formatCurrency(item.unit_cost)}</td>
                  <td className="table-td font-medium text-gray-900">{formatCurrency(item.amount)}</td>
                </tr>
              ))}
              {invoice.items.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState title="No invoice items" description="This invoice does not contain any billable file entries." />
                  </td>
                </tr>
              )}
            </Table>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function NotificationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
        <p className="text-sm text-gray-500 mt-0.5">Notification polling is still disabled because the backend does not expose notification resources yet.</p>
      </div>
      <div className="card">
        <EmptyState title="No notification feed" description="When notification endpoints are added on the backend, this page can be connected again." />
      </div>
    </div>
  )
}

