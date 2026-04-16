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
import { ChevronRight, Download, Plus, Trash2, Upload, UserCheck, Users } from 'lucide-react'

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
                <div className="flex items-center gap-2">
                  <Link to={`/jobs/${job.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    View
                  </Link>
                  {job.status === 'completed' && isRole('superadmin', 'admin') && (
                    <button
                      className="text-purple-600 hover:text-purple-800 text-sm font-medium flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        jobsApi.downloadCompleted(job.id)
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  )}
                </div>
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

  const MAX_UPLOAD_SIZE = 500 * 1024 * 1024 // 500 MB

  const handleSubmit = () => {
    if (!title || !clientId || !zipFile) {
      setError('Name, client, and ZIP archive are required.')
      return
    }

    if (!zipFile.name.toLowerCase().endsWith('.zip')) {
      setError('Only .zip files are accepted.')
      return
    }

    if (zipFile.size > MAX_UPLOAD_SIZE) {
      setError(`File exceeds the 500 MB limit (${(zipFile.size / 1024 / 1024).toFixed(1)} MB).`)
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
  const [downloading, setDownloading] = useState(false)

  const { data: jobData, isLoading: jobLoading, isError: jobError } = useQuery({
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

  if (jobError) {
    return <Alert type="error" message="Failed to load job details. Please try again." />
  }

  const job = jobData?.data
  const files = filesData?.data || []
  const members = membersData?.data || []
  const units = unitsData?.data || []

  const showAutoAssign = units.length === 0 || units.some((u: any) => u.status === 'pending')

  const handleDownloadCompleted = async () => {
    if (!id) return
    setDownloading(true)
    try {
      await jobsApi.downloadCompleted(id)
    } catch {
      // download helper handles errors silently
    } finally {
      setDownloading(false)
    }
  }

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
        <div className="flex items-center gap-3">
          <JobStatusBadge status={job?.status || ''} />
          {job?.status === 'completed' && isRole('superadmin', 'admin') && (
            <button
              className="btn-primary"
              onClick={handleDownloadCompleted}
              disabled={downloading}
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download Completed Files'}
            </button>
          )}
        </div>
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
              {isRole('sme') && id && <ManageMembers batchId={id} existingMembers={members} />}
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
            <AssignedFilesView units={units} members={members} batchId={id || ''} canManage={Boolean(isRole('sme') && id)} />
            {isRole('sme') && id && showAutoAssign && <AutoAssignPanel batchId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChunkStatusPill({ status }: { status: string }) {
  return <Badge variant={status === 'completed' ? 'green' : status === 'in_validation' ? 'yellow' : 'blue'}>{status.replace('_', ' ')}</Badge>
}

function ManageMembers({ batchId, existingMembers }: { batchId: string; existingMembers: any[] }) {
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
    return (usersData?.data || []).filter((user: any) => {
      const matchRole = selectedRole === 'PRODUCTION' ? user.role === 'production' : user.role === 'validation'
      const isExisting = existingMembers.some((m: any) => m.user_id === user.id && m.role === selectedRole)
      return matchRole && !isExisting
    })
  }, [selectedRole, usersData?.data, existingMembers])

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
  const [splitThreshold, setSplitThreshold] = useState(100)
  const [splitChunkSize, setSplitChunkSize] = useState(25)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [manualCap, setManualCap] = useState<number | null>(null)
  const [error, setError] = useState('')

  const { data: membersData } = useQuery({
    queryKey: ['job-members', batchId],
    queryFn: () => jobsApi.members(batchId),
  })

  const { data: unitsData } = useQuery({
    queryKey: ['job-units', batchId],
    queryFn: () => chunksApi.byBatch(batchId),
  })

  const productionUsers = (membersData?.data || []).filter((m: any) => m.role === 'PRODUCTION' && m.is_active).map((m: any) => ({ id: m.user_id, name: m.user_name }))
  const validationUsers = (membersData?.data || []).filter((m: any) => m.role === 'VALIDATION' && m.is_active).map((m: any) => ({ id: m.user_id, name: m.user_name }))

  const allUnits = unitsData?.data || []
  const pendingCount = allUnits.filter((u: any) => u.status === 'pending').length
  const totalPages = allUnits.reduce((sum: number, u: any) => sum + (u.unit_count || 1), 0)
  const pendingPages = allUnits.filter((u: any) => u.status === 'pending').reduce((sum: number, u: any) => sum + (u.unit_count || 1), 0)
  const pagesPerUser = productionIds.length > 0 ? Math.ceil(pendingPages / productionIds.length) : 0

  const autoAssignMutation = useMutation({
    mutationFn: () =>
      jobsApi.autoAssign({
        batch_id: batchId,
        production_user_ids: productionIds,
        validation_user_ids: validationIds,
        batch_size_per_production_user: manualCap || undefined,
        split_threshold: splitThreshold,
        split_chunk_size: splitChunkSize,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job-members', batchId] })
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
      <p className="text-xs text-gray-500 mt-1">Select production and validation users. Pages are distributed equally across selected users.</p>
      {error && <Alert type="error" message={error} />}

      {(totalPages > 0 || pendingCount > 0) && (
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="bg-blue-50 rounded-md px-3 py-1.5">
            <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Total pages</p>
            <p className="text-sm font-semibold text-blue-900">{totalPages}</p>
          </div>
          <div className="bg-amber-50 rounded-md px-3 py-1.5">
            <p className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Pending pages</p>
            <p className="text-sm font-semibold text-amber-900">{pendingPages}</p>
          </div>
          {productionIds.length > 0 && (
            <div className="bg-green-50 rounded-md px-3 py-1.5">
              <p className="text-[10px] font-medium text-green-600 uppercase tracking-wide">Per user</p>
              <p className="text-sm font-semibold text-green-900">~{pagesPerUser} pages</p>
            </div>
          )}
        </div>
      )}

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

      <div className="mt-3">
        <button type="button" className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setShowAdvanced(!showAdvanced)}>
          {showAdvanced ? 'Hide' : 'Show'} advanced settings
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 rounded-md p-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Max pages per user (override)</label>
            <input
              type="number"
              className="input mt-1"
              min={1}
              value={manualCap ?? ''}
              placeholder="Auto"
              onChange={(e) => setManualCap(e.target.value ? Math.max(1, Number(e.target.value)) : null)}
            />
            <p className="text-[11px] text-gray-400 mt-0.5">Leave blank to distribute equally</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Split threshold</label>
            <input type="number" className="input mt-1" min={1} value={splitThreshold} onChange={(e) => setSplitThreshold(Math.max(1, Number(e.target.value)))} />
            <p className="text-[11px] text-gray-400 mt-0.5">Files above this page/row count get split</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Chunk size</label>
            <input type="number" className="input mt-1" min={1} value={splitChunkSize} onChange={(e) => setSplitChunkSize(Math.max(1, Number(e.target.value)))} />
            <p className="text-[11px] text-gray-400 mt-0.5">Pages/rows per chunk when splitting</p>
          </div>
        </div>
      )}

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
  const [showConfirm, setShowConfirm] = useState(false)

  const removeMutation = useMutation({
    mutationFn: () =>
      jobsApi.removeMember(batchId, { user_id: member.user_id, role: member.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-members', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['assignable-users', 'available'] })
      setShowConfirm(false)
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
              onClick={() => setShowConfirm(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {showConfirm && (
        <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Remove Member" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to remove <strong>{member.user_name}</strong> from this job? Their active units will be returned to pending.
            </p>
            <div className="flex justify-end gap-2">
              <button 
                className="btn-secondary" 
                onClick={() => setShowConfirm(false)} 
                disabled={removeMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="btn-primary !bg-red-600 !border-red-600 hover:!bg-red-700"
                onClick={() => removeMutation.mutate()}
                disabled={removeMutation.isPending}
              >
                {removeMutation.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function AssignedFilesView({ units, members, batchId, canManage }: { units: any[]; members: any[]; batchId: string; canManage: boolean }) {
  const pendingUnits = units.filter((u: any) => u.status === 'pending')
  const assignedUnits = units.filter((u: any) => u.status !== 'pending')

  // Group assigned units by production user
  const userGroups = useMemo(() => {
    const groups: Record<string, { user: any; units: any[]; totalPages: number }> = {}
    for (const unit of assignedUnits) {
      const uid = unit.production_user_id || 'unassigned'
      if (!groups[uid]) {
        const member = members.find((m: any) => m.user_id === uid)
        groups[uid] = { user: member || { user_name: 'Unassigned', user_id: uid }, units: [], totalPages: 0 }
      }
      groups[uid].units.push(unit)
      groups[uid].totalPages += unit.unit_count || 1
    }
    return Object.values(groups).sort((a, b) => b.totalPages - a.totalPages)
  }, [assignedUnits, members])

  if (units.length === 0) {
    return <EmptyState title="No assigned files yet" description="Files appear here after auto-assignment is run." />
  }

  return (
    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
      {userGroups.map((group) => (
        <div key={group.user.user_id} className="rounded-lg border border-gray-200">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900">{group.user.user_name}</span>
              <Badge variant="blue">{group.units.length} {group.units.length === 1 ? 'file' : 'files'}</Badge>
            </div>
            <span className="text-xs font-medium text-gray-600 bg-white px-2 py-0.5 rounded-md border border-gray-200">
              {group.totalPages} {group.totalPages === 1 ? 'page' : 'pages'}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {group.units.map((unit: any) => (
              <UnitRow
                key={unit.chunk_id}
                unit={unit}
                members={members}
                batchId={batchId}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      ))}

      {pendingUnits.length > 0 && (
        <div className="rounded-lg border border-dashed border-gray-300">
          <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-t-lg">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-500">Pending</span>
              <Badge variant="purple">{pendingUnits.length} {pendingUnits.length === 1 ? 'file' : 'files'}</Badge>
            </div>
            <span className="text-xs font-medium text-gray-500 bg-white px-2 py-0.5 rounded-md border border-gray-200">
              {pendingUnits.reduce((sum: number, u: any) => sum + (u.unit_count || 1), 0)} pages
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {pendingUnits.map((unit: any) => (
              <UnitRow
                key={unit.chunk_id}
                unit={unit}
                members={members}
                batchId={batchId}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}
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

  const collaborators = unit.collaborators || []
  const isSharedFile = collaborators.length > 1

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{unit.file_name}</p>
          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
            <span>{unit.unit_start || unit.unit_end ? `Pages ${unit.unit_start || '?'} - ${unit.unit_end || '?'}` : 'Whole file'}</span>
            <span className="text-gray-400">({unit.unit_count || 1} {(unit.unit_count || 1) === 1 ? 'page' : 'pages'})</span>
            {isSharedFile && (
              <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wide flex items-center gap-1">
                <Users className="w-3 h-3" />
                Team file
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
      {isSharedFile && (
        <div className="mt-2 bg-gray-50 rounded-md p-2">
          <p className="text-[11px] font-medium text-gray-600 mb-1">Collaborators on this file</p>
          <div className="flex flex-wrap gap-1.5">
            {collaborators.map((c: any) => (
              <span
                key={c.id}
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                  c.id === unit.production_user_id
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                {c.name}
                {c.chunks?.length > 0 && (
                  <span className="text-[9px] ml-1 opacity-70">({c.chunks.join(', ')})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
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
