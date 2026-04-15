import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usersApi } from '@/api/client'
import { Alert, EmptyState, Modal, RoleBadge, Table } from '@/components/shared'
import { Plus } from 'lucide-react'

const ROLE_OPTIONS = ['admin', 'sme', 'production', 'validation']

export default function UsersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => usersApi.list(roleFilter ? { role: roleFilter } : undefined),
  })

  const users = useMemo(() => data?.data || [], [data?.data])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Accounts currently available through the backend</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4" />
          Create User
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', ...ROLE_OPTIONS].map((role) => (
          <button
            key={role}
            className={`rounded-full px-3 py-1.5 text-sm ${roleFilter === role ? 'bg-blue-600 text-white' : 'border border-gray-200 bg-white text-gray-700'}`}
            onClick={() => setRoleFilter(role)}
          >
            {role || 'All roles'}
          </button>
        ))}
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['Name', 'Email', 'Role', 'Status', 'Created']} loading={isLoading}>
          {users.map((user: any) => (
            <tr key={user.id} className="hover:bg-gray-50">
              <td className="table-td font-medium text-gray-900">{user.name}</td>
              <td className="table-td text-gray-600">{user.email}</td>
              <td className="table-td"><RoleBadge role={user.role} /></td>
              <td className="table-td">
                <span className={`badge ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {user.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="table-td text-gray-500">{new Date(user.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
          {!isLoading && users.length === 0 && (
            <tr>
              <td colSpan={5}>
                <EmptyState title="No users found" description="Try another filter or create a new account." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', role: 'production', password: '' })
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => usersApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Unable to create user.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Create User" size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
