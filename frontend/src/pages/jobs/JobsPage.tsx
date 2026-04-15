import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jobsApi, usersApi, chunksApi, clientsApi } from '@/api/client'
import {
  Alert,
  Badge,
  EmptyState,
  JobStatusBadge,
  Modal,
  PageLoader,
  Table,
} from '@/components/shared'
import { FileTreeViewer } from '@/components/shared/FileTree'
import { useAuth } from '@/store/auth'
import { ChevronRight, Plus, Trash2, Upload, UserCheck, Users } from 'lucide-react'

export function JobsListPage() {
  const { isRole } = useAuth()
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
  })

  const jobs = data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Work batches exposed by the Django API</p>
        </div>
        {isRole('superadmin', 'admin') && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            Upload Job
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['Job', 'Client', 'Files', 'Folders', 'Status', '']} loading={isLoading}>
          {jobs.map((job: any) => (
            <tr key={job.id} className="hover:bg-gray-50">
              <td className="table-td">
                <p className="font-medium text-gray-900">{job.title}</p>
                <p className="text-xs text-gray-500">{new Date(job.created_at).toLocaleString()}</p>
              </td>
              <td className="table-td text-gray-600">{job.client_name || 'No client'}</td>
              <td className="table-td text-gray-600">{job.total_files || 0}</td>
              <td className="table-td text-gray-600">{job.total_directories || 0}</td>
              <td className="table-td"><JobStatusBadge status={job.status} /></td>
              <td className="table-td">
                <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  View
                </Link>
              </td>
            </tr>
          ))}
          {!isLoading && jobs.length === 0 && (
            <tr>
              <td colSpan={6}>
                <EmptyState title="No jobs yet" description="Upload a ZIP archive from an admin account." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}

function CreateJobModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [zipFile, setZipFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  })

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => jobsApi.create(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Job upload failed.')
    },
  })

  const handleSubmit = () => {
    if (!title || !clientId || !zipFile) {
      setError('Name, client, and ZIP archive are required.')
      return
    }

    const formData = new FormData()
    formData.append('name', title)
    formData.append('client_id', clientId)
    formData.append('source_archive', zipFile)
    createMutation.mutate(formData)
  }

  return (
    <Modal open onClose={onClose} title="Upload Job" size="md">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div>
          <label className="label">Job name</label>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Accessibility batch name" />
        </div>

        <div>
          <label className="label">Client</label>
          <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Select client</option>
            {(clientsData?.data || []).map((client: any) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">ZIP archive</label>
          <input type="file" accept=".zip" className="input" onChange={(e) => setZipFile(e.target.files?.[0] || null)} />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Upload className="w-4 h-4" />
            {createMutation.isPending ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function JobDetailPage() {
  const { id } = useParams()
  const { isRole } = useAuth()

  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id || ''),
    enabled: Boolean(id),
  })

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['job-files', id],
    queryFn: () => jobsApi.files(id || ''),
    enabled: Boolean(id),
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['job-members', id],
    queryFn: () => jobsApi.members(id || ''),
    enabled: Boolean(id),
  })

  const { data: unitsData, isLoading: unitsLoading } = useQuery({
    queryKey: ['job-units', id],
    queryFn: () => chunksApi.byBatch(id || ''),
    enabled: Boolean(id),
  })

  if (jobLoading || filesLoading || membersLoading || unitsLoading) {
    return <PageLoader />
  }

  const job = jobData?.data
  const files = filesData?.data || []
  const members = membersData?.data || []
  const units = unitsData?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/jobs" className="hover:text-gray-700">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>{job?.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{job?.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {job?.client_name || 'No client'} • {job?.total_files || 0} files • {job?.total_directories || 0} folders
          </p>
        </div>
        <JobStatusBadge status={job?.status || ''} />
      </div>

      {job?.error_message && <Alert type="error" message={job.error_message} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Files</h2>
            <Badge variant="blue">{files.length}</Badge>
          </div>
          <FileTreeViewer jobId={id || ''} />
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Batch Members</h2>
              {isRole('sme') && id && <ManageMembers batchId={id} />}
            </div>
            <div className="space-y-3">
              {members.map((member: any) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  batchId={id || ''}
                  canManage={Boolean(isRole('sme') && id)}
                />
              ))}
              {members.length === 0 && <EmptyState title="No members yet" description="SME can add production and validation users to this batch." />}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Assigned Files</h2>
              <Badge variant="purple">{units.length}</Badge>
            </div>
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {units.map((unit: any) => (
                <UnitRow
                  key={unit.chunk_id}
                  unit={unit}
                  members={members}
                  batchId={id || ''}
                  canManage={Boolean(isRole('sme') && id)}
                />
              ))}
              {units.length === 0 && <EmptyState title="No assigned files yet" description="Files appear here after auto-assignment is run." />}
            </div>
            {isRole('sme') && id && <AutoAssignPanel batchId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChunkStatusPill({ status }: { status: string }) {
  return <Badge variant={status === 'completed' ? 'green' : status === 'in_validation' ? 'yellow' : 'blue'}>{status.replace('_', ' ')}</Badge>
}

function ManageMembers({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRole, setSelectedRole] = useState<'PRODUCTION' | 'VALIDATION'>('PRODUCTION')
  const [error, setError] = useState('')

  const { data: usersData } = useQuery({
    queryKey: ['assignable-users', 'available'],
    queryFn: () => usersApi.list({ available: true }),
  })

  const users = useMemo(() => {
    return (usersData?.data || []).filter((user: any) =>
      selectedRole === 'PRODUCTION' ? user.role === 'production' : user.role === 'validation'
    )
  }, [selectedRole, usersData?.data])

  const addMutation = useMutation({
    mutationFn: () => jobsApi.addMember(batchId, { user_id: selectedUserId, role: selectedRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-members', batchId] })
      setSelectedUserId('')
      setOpen(false)
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Unable to add member.'),
  })

  return (
    <>
      <button className="btn-secondary text-sm" onClick={() => setOpen(true)}>
        <Users className="w-4 h-4" />
        Add Member
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add Batch Member" size="sm">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <div>
            <label className="label">Role</label>
            <select className="input" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as 'PRODUCTION' | 'VALIDATION')}>
              <option value="PRODUCTION">Production</option>
              <option value="VALIDATION">Validation</option>
            </select>
          </div>
          <div>
            <label className="label">User</label>
            <select className="input" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select user</option>
              {users.map((user: any) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" onClick={() => addMutation.mutate()} disabled={!selectedUserId || addMutation.isPending}>
              {addMutation.isPending ? 'Saving...' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function AutoAssignPanel({ batchId }: { batchId: string }) {
  const queryClient = useQueryClient()
  const [productionIds, setProductionIds] = useState<string[]>([])
  const [validationIds, setValidationIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const { data: usersData } = useQuery({
    queryKey: ['assignment-users', 'available'],
    queryFn: () => usersApi.list({ available: true }),
  })

  const productionUsers = (usersData?.data || []).filter((user: any) => user.role === 'production')
  const validationUsers = (usersData?.data || []).filter((user: any) => user.role === 'validation')

  const autoAssignMutation = useMutation({
    mutationFn: () =>
      jobsApi.autoAssign({
        batch_id: batchId,
        production_user_ids: productionIds,
        validation_user_ids: validationIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['assignment-users', 'available'] })
      queryClient.invalidateQueries({ queryKey: ['assignable-users', 'available'] })
      setError('')
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Auto-assignment failed.'),
  })

  const toggle = (value: string, current: string[], setState: (value: string[]) => void) => {
    setState(current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
  }

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <h3 className="font-medium text-gray-900">Auto Assign</h3>
      <p className="text-xs text-gray-500 mt-1">Select active production and validation users, then create units for this batch.</p>
      {error && <Alert type="error" message={error} />}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">Production</p>
          <div className="space-y-2">
            {productionUsers.map((user: any) => (
              <label key={user.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={productionIds.includes(user.id)} onChange={() => toggle(user.id, productionIds, setProductionIds)} />
                <span>{user.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">Validation</p>
          <div className="space-y-2">
            {validationUsers.map((user: any) => (
              <label key={user.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={validationIds.includes(user.id)} onChange={() => toggle(user.id, validationIds, setValidationIds)} />
                <span>{user.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button
          className="btn-primary"
          onClick={() => autoAssignMutation.mutate()}
          disabled={productionIds.length === 0 || validationIds.length === 0 || autoAssignMutation.isPending}
        >
          {autoAssignMutation.isPending ? 'Assigning...' : 'Run Auto Assign'}
        </button>
      </div>
    </div>
  )
}

function MemberRow({ member, batchId, canManage }: { member: any; batchId: string; canManage: boolean }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const removeMutation = useMutation({
    mutationFn: () =>
      jobsApi.removeMember(batchId, { user_id: member.user_id, role: member.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-members', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['assignment-users', 'available'] })
      queryClient.invalidateQueries({ queryKey: ['assignable-users', 'available'] })
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Unable to remove member.'),
  })

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{member.user_name}</p>
          <p className="text-xs text-gray-500">{member.user_email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={member.role === 'PRODUCTION' ? 'green' : 'yellow'}>{member.role}</Badge>
          {canManage && (
            <button
              type="button"
              className="btn-secondary py-1 px-2 text-xs"
              title="Remove member (their active units will be returned to pending)"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${member.user_name} from this job? Their active units will be returned to pending.`)) {
                  removeMutation.mutate()
                }
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  )
}

function UnitRow({
  unit,
  members,
  batchId,
  canManage,
}: {
  unit: any
  members: any[]
  batchId: string
  canManage: boolean
}) {
  const [assignOpen, setAssignOpen] = useState(false)
  const prodMember = members.find((m: any) => m.user_id === unit.production_user_id)
  const isPending = unit.status === 'pending'

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{unit.file_name}</p>
          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
            <span>{unit.unit_start || unit.unit_end ? `${unit.unit_start || '?'} - ${unit.unit_end || '?'}` : 'Whole file'}</span>
            {prodMember && (
              <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide">
                {prodMember.user_name}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ChunkStatusPill status={unit.status} />
          {canManage && isPending && (
            <button
              type="button"
              className="btn-secondary py-1 px-2 text-xs"
              title="Manually assign this unit"
              onClick={() => setAssignOpen(true)}
            >
              <UserCheck className="w-3.5 h-3.5" />
              Assign
            </button>
          )}
        </div>
      </div>
      {assignOpen && (
        <ManualAssignModal
          unit={unit}
          batchId={batchId}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  )
}

function ManualAssignModal({
  unit,
  batchId,
  onClose,
}: {
  unit: any
  batchId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [productionUserId, setProductionUserId] = useState('')
  const [validationUserId, setValidationUserId] = useState('')
  const [error, setError] = useState('')

  const { data: membersData } = useQuery({
    queryKey: ['job-members', batchId],
    queryFn: () => jobsApi.members(batchId),
  })

  const members = membersData?.data || []
  const productionMembers = members.filter((m: any) => m.role === 'PRODUCTION')
  const validationMembers = members.filter((m: any) => m.role === 'VALIDATION')

  const assignMutation = useMutation({
    mutationFn: () =>
      chunksApi.manualAssign(unit.chunk_id, {
        production_user_id: productionUserId,
        validation_user_id: validationUserId,
        reason: 'Manual assignment by SME.',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['assignment-users', 'available'] })
      queryClient.invalidateQueries({ queryKey: ['assignable-users', 'available'] })
      onClose()
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Manual assignment failed.'),
  })

  return (
    <Modal open onClose={onClose} title={`Assign "${unit.file_name}"`} size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        {productionMembers.length === 0 && (
          <Alert type="error" message="No production members on this job. Add one first." />
        )}
        {validationMembers.length === 0 && (
          <Alert type="error" message="No validation members on this job. Add one first." />
        )}
        <div>
          <label className="label">Production user</label>
          <select className="input" value={productionUserId} onChange={(e) => setProductionUserId(e.target.value)}>
            <option value="">Select production user</option>
            {productionMembers.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Validation user</label>
          <select className="input" value={validationUserId} onChange={(e) => setValidationUserId(e.target.value)}>
            <option value="">Select validation user</option>
            {validationMembers.map((m: any) => (
              <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            onClick={() => assignMutation.mutate()}
            disabled={!productionUserId || !validationUserId || assignMutation.isPending}
          >
            {assignMutation.isPending ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
