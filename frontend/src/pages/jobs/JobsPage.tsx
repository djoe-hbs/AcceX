import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jobsApi, usersApi, chunksApi, clientsApi } from '@/api/client'
import {
  Alert,
  Badge,
  EmptyState,
  JobStatusBadge,
  Modal,
  PageLoader,
  ProgressBar,
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
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedBytes, setUploadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [processingBatchId, setProcessingBatchId] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState(false)

  const { data: clientsData } = useQuery({
    queryKey: ['clients'],
    queryFn: () => clientsApi.list(),
  })

  const { data: pollData } = useQuery({
    queryKey: ['job-upload-poll', processingBatchId],
    queryFn: () => jobsApi.get(processingBatchId!),
    enabled: Boolean(processingBatchId) && !succeeded,
    refetchInterval: (query) => {
      const s = (query.state.data as any)?.data?.status
      if (s === 'ready' || s === 'failed') return false
      return 2000
    },
  })

  const batchStatus = pollData?.data?.status
  const batchFileCount = pollData?.data?.total_files ?? 0
  const batchErrorMessage = pollData?.data?.error_message

  useEffect(() => {
    if (batchStatus === 'ready') {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      setSucceeded(true)
      const timer = setTimeout(() => onClose(), 2000)
      return () => clearTimeout(timer)
    }
  }, [batchStatus, queryClient, onClose])

  const createMutation = useMutation({
    mutationFn: async (vars: { title: string; clientId: string; zipFile: File }) => {
      const onProgress = (event: any) => {
        const loaded: number = event.loaded ?? 0
        const total: number = event.total ?? vars.zipFile.size
        setUploadedBytes(loaded)
        setTotalBytes(total)
        setUploadProgress(total > 0 ? Math.round((loaded / total) * 100) : 0)
      }

      const metaRes = await jobsApi.requestUpload()
      const meta = metaRes.data

      if (meta.type === 'direct') {
        const formData = new FormData()
        formData.append('name', vars.title)
        formData.append('client_id', vars.clientId)
        formData.append('source_archive', vars.zipFile)
        return jobsApi.create(formData, onProgress)
      }

      await jobsApi.uploadToS3(meta.upload_url, meta.fields, vars.zipFile, onProgress)
      return jobsApi.confirmUpload({ name: vars.title, client_id: vars.clientId, s3_key: meta.s3_key })
    },
    onSuccess: (response) => {
      setUploadProgress(100)
      setProcessingBatchId(response.data.id)
    },
    onError: (err: any) => {
      setUploadProgress(0)
      setUploadedBytes(0)
      setTotalBytes(0)
      setError(err.response?.data?.detail || err.message || 'Job upload failed.')
    },
  })

  const formatBytes = (bytes: number) => {
    if (bytes <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
    const value = bytes / 1024 ** exponent
    return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`
  }

  const handleSubmit = () => {
    setError('')
    if (!title || !clientId || !zipFile) {
      setError('Name, client, and ZIP archive are required.')
      return
    }
    if (!zipFile.name.toLowerCase().endsWith('.zip')) {
      setError('Only .zip files are accepted.')
      return
    }
    setUploadProgress(0)
    setUploadedBytes(0)
    setTotalBytes(zipFile.size)
    createMutation.mutate({ title, clientId, zipFile })
  }

  const isUploading = createMutation.isPending && !processingBatchId
  const isSendingToServer = createMutation.isPending && uploadProgress >= 100 && !processingBatchId
  const isServerProcessing = Boolean(processingBatchId) && !succeeded && batchStatus !== 'failed'
  const isFailed = batchStatus === 'failed'
  const isActive = isUploading || isServerProcessing || succeeded

  return (
    <Modal open onClose={onClose} title="Upload Job" size="md">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        {!isActive && !isFailed && (
          <>
            <div>
              <label className="label">Job name</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Accessibility batch name"
                disabled={isUploading}
              />
            </div>
            <div>
              <label className="label">Client</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={isUploading}>
                <option value="">Select client</option>
                {(clientsData?.data || []).map((client: any) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ZIP archive</label>
              <input type="file" accept=".zip" className="input" onChange={(e) => setZipFile(e.target.files?.[0] || null)} disabled={isUploading} />
            </div>
          </>
        )}

        {isUploading && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <p className="font-medium text-blue-900">
                {isSendingToServer ? 'Sending to server…' : 'Uploading ZIP to cloud storage'}
              </p>
              <span className="font-semibold text-blue-700">
                {isSendingToServer ? '100%' : `${uploadProgress}%`}
              </span>
            </div>
            <ProgressBar value={Math.max(uploadProgress, 2)} className="h-2" />
            <p className="text-xs text-blue-700">
              {isSendingToServer
                ? 'Transfer complete — waiting for server confirmation…'
                : uploadedBytes > 0
                ? `${formatBytes(uploadedBytes)} of ${formatBytes(totalBytes || zipFile?.size || 0)}`
                : 'Preparing upload…'}
            </p>
          </div>
        )}

        {isServerProcessing && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="font-medium text-indigo-900 text-sm">Server is extracting and indexing files…</p>
            </div>
            <div className="w-full h-1.5 rounded-full bg-indigo-100 overflow-hidden">
              <div className="h-full bg-indigo-400 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
            <p className="text-xs text-indigo-700">
              The ZIP is being unpacked and each file is being counted. This may take a few seconds for large batches.
            </p>
          </div>
        )}

        {succeeded && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 flex items-start gap-3">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-green-900 text-sm">Job created successfully</p>
              <p className="text-xs text-green-700 mt-0.5">
                {batchFileCount > 0 ? `${batchFileCount} file${batchFileCount !== 1 ? 's' : ''} indexed. ` : ''}
                Closing…
              </p>
            </div>
          </div>
        )}

        {isFailed && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1">
            <p className="font-semibold text-red-800 text-sm">Processing failed on the server</p>
            {batchErrorMessage && <p className="text-xs text-red-700">{batchErrorMessage}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={isUploading}>
            {succeeded || isFailed ? 'Close' : 'Cancel'}
          </button>
          {!isActive && !isFailed && (
            <button className="btn-primary" onClick={handleSubmit} disabled={isUploading}>
              <Upload className="w-4 h-4" />
              Upload
            </button>
          )}
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
  const [showFileTree, setShowFileTree] = useState(false)

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

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['job-members', id],
    queryFn: () => jobsApi.members(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const {
    data: unitsData,
    isLoading: unitsLoading,
    hasNextPage: hasMoreUnits,
    isFetchingNextPage: loadingMoreUnits,
    fetchNextPage: fetchMoreUnits,
  } = useInfiniteQuery({
    queryKey: ['job-units-paged', id],
    queryFn: ({ pageParam }) => chunksApi.byBatchPaged(id || '', pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.next) return undefined
      try {
        const parsed = new URL(lastPage.next, window.location.origin)
        const nextPage = parsed.searchParams.get('page')
        return nextPage ? Number(nextPage) : undefined
      } catch {
        return undefined
      }
    },
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  if (jobLoading) {
    return <PageLoader />
  }

  if (jobError) {
    return <Alert type="error" message="Failed to load job details. Please try again." />
  }

  const job = jobData?.data
  const members = membersData?.data || []
  const units = unitsData?.pages?.flatMap((page: any) => page.data || []) || []

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
            <Badge variant="blue">{job?.total_files || 0}</Badge>
          </div>
          {!showFileTree ? (
            <button className="btn-secondary" onClick={() => setShowFileTree(true)}>
              Load File Tree
            </button>
          ) : (
            <FileTreeViewer jobId={id || ''} />
          )}
        </div>

        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Batch Members</h2>
            </div>
            <div className="space-y-3">
              {membersLoading ? (
                <PageLoader />
              ) : (
                <>
                  {members.map((member: any) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      batchId={id || ''}
                      canManage={Boolean(isRole('sme') && id)}
                    />
                  ))}
                  {members.length === 0 && <EmptyState title="No members yet" description="SME can add production and validation users to this batch." />}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Assigned Files</h2>
              <Badge variant="purple">{units.length}</Badge>
            </div>
            {unitsLoading ? (
              <PageLoader />
            ) : (
              <>
                <AssignedFilesView
                  units={units}
                  members={members}
                  batchId={id || ''}
                  canManage={Boolean(isRole('sme') && id)}
                />
                {hasMoreUnits && (
                  <div className="mt-3">
                    <button className="btn-secondary w-full" onClick={() => fetchMoreUnits()} disabled={loadingMoreUnits}>
                      {loadingMoreUnits ? 'Loading...' : 'Load More Units'}
                    </button>
                  </div>
                )}
                {isRole('sme') && id && showAutoAssign && <AutoAssignPanel batchId={id} units={units} />}
              </>
            )}
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
      queryClient.invalidateQueries({ queryKey: ['job-units-paged', batchId] })
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
      queryClient.invalidateQueries({ queryKey: ['job-units-paged', batchId] })
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

const UNITS_PAGE_SIZE = 5

function UnitGroupList({ units, members, batchId, canManage }: { units: any[]; members: any[]; batchId: string; canManage: boolean }) {
  const [visibleCount, setVisibleCount] = useState(UNITS_PAGE_SIZE)
  const visibleUnits = units.slice(0, visibleCount)
  const hasMore = visibleCount < units.length

  return (
    <div className="divide-y divide-gray-50">
      {visibleUnits.map((unit: any) => (
        <UnitRow key={unit.chunk_id} unit={unit} members={members} batchId={batchId} canManage={canManage} />
      ))}
      {hasMore && (
        <div className="px-3 py-2">
          <button
            className="w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            onClick={() => setVisibleCount((v) => v + UNITS_PAGE_SIZE)}
          >
            Load More ({visibleCount} of {units.length} files)
          </button>
        </div>
      )}
    </div>
  )
}

function AssignedFilesView({ units, members, batchId, canManage }: { units: any[]; members: any[]; batchId: string; canManage: boolean }) {
  const [visibleGroupCount, setVisibleGroupCount] = useState(3)

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

  const visibleGroups = userGroups.slice(0, visibleGroupCount)
  const hasMoreGroups = visibleGroupCount < userGroups.length

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
          <UnitGroupList units={group.units} members={members} batchId={batchId} canManage={canManage} />
        </div>
      ))}

      {hasMoreGroups && (
        <button
          className="btn-secondary text-sm w-full"
          onClick={() => setVisibleGroupCount((v) => v + 3)}
        >
          Load More ({visibleGroupCount} of {userGroups.length} users)
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
          <UnitGroupList units={pendingUnits} members={members} batchId={batchId} canManage={canManage} />
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
      queryClient.invalidateQueries({ queryKey: ['job-units-paged', batchId] })
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
