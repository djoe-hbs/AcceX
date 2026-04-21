import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/api/client'
import { Alert, Badge, EmptyState, Modal, Table } from '@/components/shared'
import { Building2, Pencil, Plus } from 'lucide-react'

type CostRule = {
  document_type: 'PDF' | 'WORD' | 'EXCEL'
  pricing_mode: 'PER_FILE' | 'PER_PAGE' | 'PER_ROW'
  unit_cost: string
}

const DEFAULT_COSTS: CostRule[] = [
  { document_type: 'PDF', pricing_mode: 'PER_PAGE', unit_cost: '' },
  { document_type: 'WORD', pricing_mode: 'PER_PAGE', unit_cost: '' },
  { document_type: 'EXCEL', pricing_mode: 'PER_ROW', unit_cost: '' },
]

export default function ClientsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [editClient, setEditClient] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
    refetchInterval: 15000,
  })

  const clients = data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-0.5">Client records exposed by the backend</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Add Client
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['Client', 'Contact', 'Email', 'Costs', 'Status', '']} loading={isLoading}>
          {clients.map((client: any) => (
            <tr key={client.id} className="hover:bg-gray-50">
              <td className="table-td">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50">
                    <Building2 className="h-4 w-4 text-blue-600" />
                  </div>
                  <span className="font-medium text-gray-900">{client.name}</span>
                </div>
              </td>
              <td className="table-td text-gray-600">{client.contact_name}</td>
              <td className="table-td text-gray-600">{client.contact_email}</td>
              <td className="table-td">
                <div className="flex flex-wrap gap-1">
                  {(client.costs || []).map((cost: any) => (
                    <Badge key={cost.id} variant="blue">
                      {cost.document_type} {cost.pricing_mode.replace('PER_', '/')} ${cost.unit_cost}
                    </Badge>
                  ))}
                  {(client.costs || []).length === 0 && <span className="text-sm text-gray-400">No cost rules</span>}
                </div>
              </td>
              <td className="table-td">
                <Badge variant={client.is_active ? 'green' : 'gray'}>{client.is_active ? 'Active' : 'Inactive'}</Badge>
              </td>
              <td className="table-td">
                <button className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600" onClick={() => setEditClient(client)}>
                  <Pencil className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {!isLoading && clients.length === 0 && (
            <tr>
              <td colSpan={6}>
                <EmptyState title="No clients yet" description="Create the first client to start uploading jobs." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      {showCreate && <ClientModal onClose={() => setShowCreate(false)} />}
      {editClient && <ClientModal client={editClient} onClose={() => setEditClient(null)} />}
    </div>
  )
}

function ClientModal({ client, onClose }: { client?: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: client?.name || '',
    contact_name: client?.contact_name || '',
    contact_email: client?.contact_email || '',
    contact_phone: client?.contact_phone || '',
    address: client?.address || '',
    is_active: client?.is_active ?? true,
  })
  const [costs, setCosts] = useState<CostRule[]>(
    client?.costs?.length
      ? client.costs.map((cost: any) => ({ ...cost, unit_cost: String(cost.unit_cost) }))
      : DEFAULT_COSTS
  )
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        costs: costs.filter((cost) => cost.unit_cost !== '' && cost.unit_cost !== null && cost.unit_cost !== undefined).map((cost) => ({ ...cost, unit_cost: Number(cost.unit_cost) })),
      }
      return client ? clientsApi.update(client.id, payload) : clientsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      onClose()
    },
    onError: (err: any) => {
      const data = err.response?.data
      if (!data) { setError('Unable to save client.'); return }
      if (data.detail) { setError(data.detail); return }
      const messages = Object.entries(data)
        .flatMap(([field, errs]) =>
          Array.isArray(errs) ? errs.map((e) => `${field}: ${e}`) : [`${field}: ${errs}`]
        )
        .join('; ')
      setError(messages || 'Unable to save client.')
    },
  })

  return (
    <Modal open onClose={onClose} title={client ? `Edit ${client.name}` : 'Add Client'} size="lg">
      <div className="space-y-5">
        {error && <Alert type="error" message={error} />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Client name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Contact name</label>
            <input className="input" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input className="input" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={String(form.is_active)} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'true' })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <textarea className="input" rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-900 mb-3">Cost Rules</p>
          <div className="space-y-3">
            {costs.map((cost, index) => (
              <div key={`${cost.document_type}-${index}`} className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg bg-gray-50 p-3">
                <select
                  className="input"
                  value={cost.document_type}
                  onChange={(e) => {
                    const next = [...costs]
                    next[index].document_type = e.target.value as CostRule['document_type']
                    setCosts(next)
                  }}
                >
                  <option value="PDF">PDF</option>
                  <option value="WORD">WORD</option>
                  <option value="EXCEL">EXCEL</option>
                </select>
                <select
                  className="input"
                  value={cost.pricing_mode}
                  onChange={(e) => {
                    const next = [...costs]
                    next[index].pricing_mode = e.target.value as CostRule['pricing_mode']
                    setCosts(next)
                  }}
                >
                  <option value="PER_FILE">Per file</option>
                  <option value="PER_PAGE">Per page</option>
                  <option value="PER_ROW">Per row</option>
                </select>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Unit cost"
                  value={cost.unit_cost}
                  onChange={(e) => {
                    const next = [...costs]
                    next[index].unit_cost = e.target.value
                    setCosts(next)
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
