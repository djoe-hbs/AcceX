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
import { CheckCircle, ChevronDown, ChevronRight, Download, MessageSquare, Plus, PowerOff, Trash2, Upload, UserCheck } from 'lucide-react'

export function JobsListPage() {
  const { isRole } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<any>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => jobsApi.list(),
    refetchInterval: 15000,
  })

  const deactivateMutation = useMutation({
    mutationFn: (jobId: string) => jobsApi.deactivate(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setDeactivateTarget(null)
    },
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
            <tr key={job.id} className={`hover:bg-gray-50 ${job.status === 'inactive' ? 'opacity-60' : ''}`}>
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
                  {job.status !== 'inactive' && isRole('superadmin', 'admin') && (
                    <button
                      className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center gap-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeactivateTarget(job)
                      }}
                    >
                      <PowerOff className="w-3.5 h-3.5" />
                      Deactivate
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

      {deactivateTarget && (
        <Modal open onClose={() => setDeactivateTarget(null)} title="Deactivate Job" size="sm">
          <div className="space-y-4">
            {deactivateMutation.isError && (
              <Alert type="error" message={(deactivateMutation.error as any)?.response?.data?.detail || 'Deactivation failed.'} />
            )}
            <p className="text-sm text-gray-700">
              Are you sure you want to deactivate <strong>{deactivateTarget.title}</strong>? The job will be hidden from the default list but no data will be deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeactivateTarget(null)}>Cancel</button>
              <button
                className="btn-primary !bg-red-600 !border-red-600 hover:!bg-red-700"
                onClick={() => deactivateMutation.mutate(deactivateTarget.id)}
                disabled={deactivateMutation.isPending}
              >
                <PowerOff className="w-4 h-4" />
                {deactivateMutation.isPending ? 'Deactivating...' : 'Deactivate'}
              </button>
            </div>
          </div>
        </Modal>
      )}
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
  const queryClient = useQueryClient()
  const [downloading, setDownloading] = useState(false)
  const [showSignOff, setShowSignOff] = useState(false)
  const [showDeactivate, setShowDeactivate] = useState(false)

  const signOffMutation = useMutation({
    mutationFn: () => jobsApi.signOff(id || '', true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setShowSignOff(false)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: () => jobsApi.deactivate(id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setShowDeactivate(false)
    },
  })

  const markReworkCompleteMutation = useMutation({
    mutationFn: () => jobsApi.markReworkComplete(id || ''),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })

  const { data: jobData, isLoading: jobLoading, isError: jobError } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['job-files', id],
    queryFn: () => jobsApi.files(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['job-members', id],
    queryFn: () => jobsApi.members(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const { data: unitsData, isLoading: unitsLoading } = useQuery({
    queryKey: ['job-units', id],
    queryFn: () => chunksApi.byBatch(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
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
          <Link to={`/jobs/${id}/feedback`} className="btn-secondary">
            <MessageSquare className="w-4 h-4" />
            Client Feedback
          </Link>
          {['completed', 'on_rework', 'fully_completed'].includes(job?.status) && isRole('superadmin', 'admin') && (
            <button
              className="btn-primary"
              onClick={handleDownloadCompleted}
              disabled={downloading}
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download Completed Files'}
            </button>
          )}
          {job?.status === 'on_rework' && isRole('sme') && (
            <button
              className="btn-primary"
              onClick={() => markReworkCompleteMutation.mutate()}
              disabled={markReworkCompleteMutation.isPending}
            >
              <CheckCircle className="w-4 h-4" />
              {markReworkCompleteMutation.isPending ? 'Updating...' : 'Completed'}
            </button>
          )}
          {job?.status === 'completed' && isRole('superadmin') && (
            <button className="btn-primary !bg-green-600 !border-green-600 hover:!bg-green-700" onClick={() => setShowSignOff(true)}>
              <CheckCircle className="w-4 h-4" />
              Sign Off
            </button>
          )}
          {job?.status !== 'inactive' && isRole('superadmin', 'admin') && (
            <button className="btn-secondary text-red-600 border-red-200 hover:bg-red-50" onClick={() => setShowDeactivate(true)}>
              <PowerOff className="w-4 h-4" />
              Deactivate
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
            <AssignedFilesView
              units={units}
              members={members}
              batchId={id || ''}
              canManage={Boolean(isRole('sme') && id)}
            />
            {isRole('sme') && id && showAutoAssign && <AutoAssignPanel batchId={id} units={units} />}
          </div>
        </div>
      </div>

      <Modal open={showSignOff} onClose={() => setShowSignOff(false)} title="Sign Off Job" size="sm">
        <div className="space-y-4">
          {signOffMutation.isError && (
            <Alert type="error" message={(signOffMutation.error as any)?.response?.data?.detail || 'Sign off failed.'} />
          )}
          <p className="text-sm text-gray-700">
            Are you sure you want to sign off this job? This confirms the client has accepted the delivered work.
            No further reworks or client feedback will be possible.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowSignOff(false)}>Cancel</button>
            <button
              className="btn-primary !bg-green-600 !border-green-600 hover:!bg-green-700"
              onClick={() => signOffMutation.mutate()}
              disabled={signOffMutation.isPending}
            >
              <CheckCircle className="w-4 h-4" />
              {signOffMutation.isPending ? 'Signing off...' : 'Confirm Sign Off'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showDeactivate} onClose={() => setShowDeactivate(false)} title="Deactivate Job" size="sm">
        <div className="space-y-4">
          {deactivateMutation.isError && (
            <Alert type="error" message={(deactivateMutation.error as any)?.response?.data?.detail || 'Deactivation failed.'} />
          )}
          <p className="text-sm text-gray-700">
            Are you sure you want to deactivate <strong>{job?.title}</strong>? The job will be hidden from the default list but no data will be deleted.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowDeactivate(false)}>Cancel</button>
            <button
              className="btn-primary !bg-red-600 !border-red-600 hover:!bg-red-700"
              onClick={() => deactivateMutation.mutate()}
              disabled={deactivateMutation.isPending}
            >
              <PowerOff className="w-4 h-4" />
              {deactivateMutation.isPending ? 'Deactivating...' : 'Confirm Deactivate'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function ChunkStatusPill({ status }: { status: string }) {
  return <Badge variant={status === 'completed' ? 'green' : status === 'in_validation' ? 'yellow' : 'blue'}>{status.replace('_', ' ')}</Badge>
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  openUpward = false,
}: {
  options: { id: string; name: string }[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder: string
  openUpward?: boolean
}) {
  const [open, setOpen] = useState(false)
  const label =
    selected.length === 0
      ? placeholder
      : options
          .filter((o) => selected.includes(o.id))
          .map((o) => o.name)
          .join(', ')

  const listPosition = openUpward
    ? 'bottom-full mb-1'
    : 'top-full mt-1'

  return (
    <div className="relative">
      <button
        type="button"
        className="input w-full text-left flex items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`truncate ${selected.length === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{label}</span>
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute z-30 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto overscroll-contain ${listPosition}`} style={{ maxHeight: '12rem' }}>
          {options.length === 0 ? (
            <p className="text-sm text-gray-400 px-3 py-2">No users available</p>
          ) : (
            options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="flex-shrink-0"
                  checked={selected.includes(opt.id)}
                  onChange={() =>
                    onChange(
                      selected.includes(opt.id)
                        ? selected.filter((id) => id !== opt.id)
                        : [...selected, opt.id]
                    )
                  }
                />
                <span className="text-sm text-gray-700">{opt.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function AutoAssignPanel({ batchId, units }: { batchId: string; units: any[] }) {
  const queryClient = useQueryClient()
  const [productionIds, setProductionIds] = useState<string[]>([])
  const [validationIds, setValidationIds] = useState<string[]>([])
  const [error, setError] = useState('')

  const { data: membersData } = useQuery({
    queryKey: ['job-members', batchId],
    queryFn: () => jobsApi.members(batchId),
  })

  const { data: usersData } = useQuery({
    queryKey: ['all-users'],
    queryFn: () => usersApi.list(),
  })

  const existingMembers = membersData?.data || []
  const allUsers = usersData?.data || []

  const productionUsers = allUsers
    .filter((u: any) => u.role === 'production')
    .map((u: any) => ({ id: u.id, name: u.name }))

  const validationUsers = allUsers
    .filter((u: any) => u.role === 'validation')
    .map((u: any) => ({ id: u.id, name: u.name }))

  const totalPages = units.reduce((sum: number, u: any) => sum + (u.unit_count || 1), 0)
  const pendingPages = units
    .filter((u: any) => u.status === 'pending')
    .reduce((sum: number, u: any) => sum + (u.unit_count || 1), 0)
  const pagesPerUser = productionIds.length > 0 ? Math.ceil(pendingPages / productionIds.length) : 0

  const autoAssignMutation = useMutation({
    mutationFn: async () => {
      for (const userId of productionIds) {
        const already = existingMembers.some((m: any) => m.user_id === userId && m.role === 'PRODUCTION')
        if (!already) await jobsApi.addMember(batchId, { user_id: userId, role: 'PRODUCTION' })
      }
      for (const userId of validationIds) {
        const already = existingMembers.some((m: any) => m.user_id === userId && m.role === 'VALIDATION')
        if (!already) await jobsApi.addMember(batchId, { user_id: userId, role: 'VALIDATION' })
      }
      await jobsApi.autoAssign({
        batch_id: batchId,
        production_user_ids: productionIds,
        validation_user_ids: validationIds,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job-members', batchId] })
      setError('')
    },
    onError: (err: any) => setError(err.response?.data?.detail || 'Auto-assignment failed.'),
  })

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <h3 className="font-medium text-gray-900">Auto Assign</h3>
      <p className="text-xs text-gray-500 mt-1">
        Select production and validation users. New selections will be added as members automatically before assignment.
      </p>
      {error && <Alert type="error" message={error} />}

      {totalPages > 0 && (
        <div className="mt-3 flex flex-wrap gap-3">
          <div className="bg-blue-50 rounded-md px-3 py-1.5">
            <p className="text-[10px] font-medium text-blue-600 uppercase tracking-wide">Total units</p>
            <p className="text-sm font-semibold text-blue-900">{totalPages}</p>
          </div>
          <div className="bg-amber-50 rounded-md px-3 py-1.5">
            <p className="text-[10px] font-medium text-amber-600 uppercase tracking-wide">Pending units</p>
            <p className="text-sm font-semibold text-amber-900">{pendingPages}</p>
          </div>
          {productionIds.length > 0 && (
            <div className="bg-green-50 rounded-md px-3 py-1.5">
              <p className="text-[10px] font-medium text-green-600 uppercase tracking-wide">~Per user</p>
              <p className="text-sm font-semibold text-green-900">~{pagesPerUser} units</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">Production</p>
          <MultiSelectDropdown
            options={productionUsers}
            selected={productionIds}
            onChange={setProductionIds}
            placeholder="Select production users..."
            openUpward
          />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800 mb-2">Validation</p>
          <MultiSelectDropdown
            options={validationUsers}
            selected={validationIds}
            onChange={setValidationIds}
            placeholder="Select validation users..."
            openUpward
          />
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
  const [visibleCount, setVisibleCount] = useState(1)

  const pendingUnits = units.filter((u: any) => u.status === 'pending')
  const assignedUnits = units.filter((u: any) => u.status !== 'pending')

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

  const visibleGroups = userGroups.slice(0, visibleCount)
  const hasMoreUsers = visibleCount < userGroups.length

  return (
    <div className="space-y-4">
      {visibleGroups.map((group) => (
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
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {group.units.map((unit: any) => (
              <UnitRow key={unit.chunk_id} unit={unit} members={members} batchId={batchId} canManage={canManage} />
            ))}
          </div>
        </div>
      ))}

      {hasMoreUsers && (
        <button
          className="btn-secondary text-sm w-full"
          onClick={() => setVisibleCount((v) => v + 1)}
        >
          Load More ({visibleCount} of {userGroups.length} users)
        </button>
      )}

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
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {pendingUnits.map((unit: any) => (
              <UnitRow key={unit.chunk_id} unit={unit} members={members} batchId={batchId} canManage={canManage} />
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
  const isPending = unit.status === 'pending'

  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{unit.file_name}</p>
          <p className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
            <span>Whole file</span>
            <span className="text-gray-400">({unit.unit_count || 1} {(unit.unit_count || 1) === 1 ? 'unit' : 'units'})</span>
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
