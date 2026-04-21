import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, usersApi } from '@/api/client'
import { useAuth } from '@/store/auth'
import { Alert, EmptyState, Modal, RoleBadge, Table } from '@/components/shared'
import { Pencil, Plus, Trash2 } from 'lucide-react'

const ROLE_OPTIONS = ['admin', 'sme', 'production', 'validation']

export default function UsersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<any | null>(null)
  const [deleteUser, setDeleteUser] = useState<any | null>(null)
  const [roleFilter, setRoleFilter] = useState('')
  const { isRole, user: currentUser } = useAuth()
  const canManage = isRole('superadmin', 'admin')

  const canManageUser = (target: any) => {
    if (!canManage) return false
    if (currentUser?.role === 'admin' && target.role === 'superadmin') return false
    return true
  }

  const { data, isLoading } = useQuery({
    queryKey: ['users', roleFilter],
    queryFn: () => usersApi.list(roleFilter ? { role: roleFilter } : undefined),
    refetchInterval: 15000,
  })

  const users = useMemo(() => data?.data || [], [data?.data])

  const headers = canManage
    ? ['Name', 'Email', 'Role', 'Status', 'Created', 'Actions']
    : ['Name', 'Email', 'Role', 'Status', 'Created']

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
        <Table headers={headers} loading={isLoading}>
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
              {canManage && (
                <td className="table-td">
                  <div className="flex items-center gap-2">
                    {canManageUser(user) ? (
                    <>
                    <button
                      className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                      title="Edit user"
                      onClick={() => setEditUser(user)}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-red-50 text-red-600"
                      title="Delete user"
                      onClick={() => setDeleteUser(user)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </>) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {!isLoading && users.length === 0 && (
            <tr>
              <td colSpan={headers.length}>
                <EmptyState title="No users found" description="Try another filter or create a new account." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} />}
      {deleteUser && <DeleteUserModal user={deleteUser} onClose={() => setDeleteUser(null)} />}
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

function EditUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: user.name, email: user.email })
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')

  const updateMutation = useMutation({
    mutationFn: async () => {
      await usersApi.update(user.id, form)
      if (newPassword) {
        await authApi.changeUserPassword(user.id, newPassword)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.response?.data?.new_password?.[0] || 'Unable to update user.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Edit User" size="sm">
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
          <label className="label">New Password <span className="text-gray-400 font-normal">(leave blank to keep unchanged)</span></label>
          <input className="input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DeleteUserModal({ user, onClose }: { user: any; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const deleteMutation = useMutation({
    mutationFn: () => usersApi.delete(user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Unable to delete user.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Delete User" size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <p className="text-sm text-gray-700">
          Are you sure you want to delete <span className="font-semibold">{user.name}</span>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary bg-red-600 hover:bg-red-700"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
