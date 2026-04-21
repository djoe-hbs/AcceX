import { useCallback, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { jobsApi, chunksApi } from '@/api/client'
import {
  Alert,
  Badge,
  ChunkStatusBadge,
  EmptyState,
  Modal,
  PageLoader,
  Table,
} from '@/components/shared'
import { useAuth } from '@/store/auth'
import {
  ChevronRight,
  Upload,
  MessageSquare,
  CheckCircle,
  Download,
  Send,
} from 'lucide-react'
import { format } from 'date-fns'

const DELIVERY_STATUS_MAP: Record<string, { label: string; variant: 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'orange' }> = {
  IN_PROGRESS: { label: 'In Progress', variant: 'blue' },
  CLIENT_REVIEW_PENDING: { label: 'Client Review Pending', variant: 'yellow' },
  REWORK_REQUESTED: { label: 'Rework Requested', variant: 'red' },
  SIGNED_OFF: { label: 'Signed Off', variant: 'green' },
}

export default function FeedbackPage() {
  const { id } = useParams()
  const { isRole } = useAuth()
  const [showUpload, setShowUpload] = useState(false)
  const [showSignOff, setShowSignOff] = useState(false)

  const { data: jobData, isLoading: jobLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => jobsApi.get(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ['client-reviews', id],
    queryFn: () => jobsApi.clientReviews(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const [unitsPages, setUnitsPages] = useState<any[]>([])
  const loadedPageRef = useRef(1)
  const [unitsHasMore, setUnitsHasMore] = useState(false)
  const [unitsTotalCount, setUnitsTotalCount] = useState(0)
  const [unitsLoadingMore, setUnitsLoadingMore] = useState(false)

  const { isLoading: unitsLoading } = useQuery({
    queryKey: ['job-units', id, 'page-1'],
    queryFn: async () => {
      const pagesToLoad = loadedPageRef.current
      const allItems: any[] = []
      let lastRes: any = null
      for (let p = 1; p <= pagesToLoad; p++) {
        const res = await chunksApi.byBatchPaged(id || '', p)
        allItems.push(...res.data)
        lastRes = res
        if (!res.next) break
      }
      setUnitsPages(allItems)
      setUnitsHasMore(Boolean(lastRes?.next))
      setUnitsTotalCount(lastRes?.count ?? 0)
      return lastRes
    },
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const loadMoreUnits = useCallback(async () => {
    if (!id || unitsLoadingMore) return
    setUnitsLoadingMore(true)
    try {
      const nextPage = loadedPageRef.current + 1
      const res = await chunksApi.byBatchPaged(id, nextPage)
      setUnitsPages((prev) => [...prev, ...res.data])
      setUnitsHasMore(Boolean(res.next))
      loadedPageRef.current = nextPage
    } finally {
      setUnitsLoadingMore(false)
    }
  }, [id, unitsLoadingMore])

  if (jobLoading || reviewsLoading || unitsLoading) return <PageLoader />

  const job = jobData?.data
  const reviews = reviewsData?.data || []
  const units = unitsPages
  const deliveryStatus = job?.delivery_status || 'IN_PROGRESS'
  const statusInfo = DELIVERY_STATUS_MAP[deliveryStatus] || { label: deliveryStatus, variant: 'gray' as const }

  const completedUnits = units.filter((u: any) => u.status === 'completed')
  const redoUnits = units.filter((u: any) => u.status === 'redo')
  const hasReworkRequested = deliveryStatus === 'REWORK_REQUESTED'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/jobs" className="hover:text-gray-700">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/jobs/${id}`} className="hover:text-gray-700">{job?.title || 'Job'}</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Client Feedback</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Client Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {job?.client_name || 'No client'} — {job?.title}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          {isRole('superadmin', 'admin') && deliveryStatus !== 'SIGNED_OFF' && (
            <button className="btn-primary" onClick={() => setShowUpload(true)}>
              <Upload className="w-4 h-4" />
              Upload Feedback
            </button>
          )}
          {isRole('superadmin') && job?.status === 'completed' && (
            <button className="btn-secondary" onClick={() => setShowSignOff(true)}>
              <CheckCircle className="w-4 h-4" />
              Sign Off
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Total Units</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{unitsTotalCount}</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Completed</p>
          <p className="text-lg font-semibold text-green-700 mt-1">{completedUnits.length}</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">In Rework</p>
          <p className="text-lg font-semibold text-red-700 mt-1">{redoUnits.length}</p>
        </div>
        <div className="card">
          <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Feedback Rounds</p>
          <p className="text-lg font-semibold text-blue-700 mt-1">{reviews.length}</p>
        </div>
      </div>

      {/* Feedback history */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Feedback History</h2>
          <Badge variant="blue">{reviews.length}</Badge>
        </div>
        {reviews.length === 0 ? (
          <EmptyState
            title="No feedback yet"
            description="Client feedback will appear here once uploaded."
          />
        ) : (
          <div className="space-y-3">
            {reviews.map((review: any, index: number) => (
              <div key={review.id} className="rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <MessageSquare className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Feedback Round #{reviews.length - index}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {review.created ? format(new Date(review.created), 'MMM d, yyyy h:mm a') : 'Unknown date'}
                      </p>
                      {review.review_note && (
                        <p className="text-sm text-gray-700 mt-2 bg-gray-50 rounded-md p-3">
                          {review.review_note}
                        </p>
                      )}
                    </div>
                  </div>
                  {review.review_file && (
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs flex-shrink-0"
                      onClick={() =>
                        jobsApi.downloadClientReview(id || '', review.id).catch(() => {})
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      File
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Already in rework */}
      {redoUnits.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">Units In Rework</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                These units have been sent to production users for rework.
              </p>
            </div>
            <Badge variant="red">{redoUnits.length}</Badge>
          </div>
          <div className="card p-0 overflow-hidden">
            <Table headers={['File', 'Range', 'Status', 'Assigned To']}>
              {redoUnits.map((unit: any) => (
                <tr key={unit.chunk_id} className="hover:bg-gray-50">
                  <td className="table-td font-medium text-gray-900">{unit.file_name}</td>
                  <td className="table-td text-gray-600">
                    {unit.unit_start || unit.unit_end
                      ? `${unit.unit_start || '?'} - ${unit.unit_end || '?'}`
                      : 'Whole file'}
                  </td>
                  <td className="table-td"><ChunkStatusBadge status={unit.status} /></td>
                  <td className="table-td text-gray-600">
                    {unit.production_user_name || unit.production_user_id || 'Unassigned'}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        </div>
      )}

      {/* SME selects which completed files go for rework */}
      {hasReworkRequested && completedUnits.length > 0 && isRole('sme') && (
        <ReworkSelectionPanel
          batchId={id || ''}
          completedUnits={completedUnits}
        />
      )}

      {hasReworkRequested && completedUnits.length > 0 && !isRole('sme') && (
        <div className="card border border-amber-200 bg-amber-50/30">
          <p className="text-sm text-amber-800">
            <strong>{completedUnits.length}</strong> completed unit{completedUnits.length !== 1 ? 's' : ''} available for rework selection.
            The assigned SME will choose which files need rework and assign them to production users.
          </p>
        </div>
      )}

      {unitsHasMore && (
        <div className="text-center">
          <button
            className="btn-secondary text-sm"
            onClick={loadMoreUnits}
            disabled={unitsLoadingMore}
          >
            {unitsLoadingMore ? 'Loading...' : `Load More Units (${units.length} of ${unitsTotalCount})`}
          </button>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <UploadFeedbackModal batchId={id || ''} onClose={() => setShowUpload(false)} />
      )}

      {/* Sign Off Confirm */}
      {showSignOff && (
        <SignOffModal batchId={id || ''} onClose={() => setShowSignOff(false)} />
      )}
    </div>
  )
}

interface UnitAssignment {
  production_user_id: string
  validation_user_id: string
}

function ReworkSelectionPanel({
  batchId,
  completedUnits,
}: {
  batchId: string
  completedUnits: any[]
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Record<string, UnitAssignment>>({})
  const [reason, setReason] = useState('Client requested rework.')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: membersData } = useQuery({
    queryKey: ['job-members', batchId],
    queryFn: () => jobsApi.members(batchId),
  })

  const members = membersData?.data || []
  const productionMembers = members.filter((m: any) => m.role === 'PRODUCTION' && m.is_active)
  const validationMembers = members.filter((m: any) => m.role === 'VALIDATION' && m.is_active)

  const toggleUnit = (unitId: string, originalProdId: string, originalValId: string) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[unitId]) {
        delete next[unitId]
      } else {
        const defaultProd = productionMembers.find((m: any) => m.user_id === originalProdId)
        const defaultVal = validationMembers.find((m: any) => m.user_id === originalValId)
        next[unitId] = {
          production_user_id: defaultProd ? defaultProd.user_id : '',
          validation_user_id: defaultVal ? defaultVal.user_id : '',
        }
      }
      return next
    })
  }

  const selectAll = () => {
    const all: Record<string, UnitAssignment> = {}
    for (const unit of completedUnits) {
      const defaultProd = productionMembers.find((m: any) => m.user_id === unit.production_user_id)
      const defaultVal = validationMembers.find((m: any) => m.user_id === unit.validation_user_id)
      all[unit.chunk_id] = {
        production_user_id: defaultProd ? defaultProd.user_id : '',
        validation_user_id: defaultVal ? defaultVal.user_id : '',
      }
    }
    setSelected(all)
  }

  const clearAll = () => setSelected({})

  const setProdUser = (unitId: string, userId: string) => {
    setSelected((prev) => ({
      ...prev,
      [unitId]: { validation_user_id: '', ...prev[unitId], production_user_id: userId },
    }))
  }

  const setValUser = (unitId: string, userId: string) => {
    setSelected((prev) => ({
      ...prev,
      [unitId]: { production_user_id: '', ...prev[unitId], validation_user_id: userId },
    }))
  }

  const selectedCount = Object.keys(selected).length
  const allAssigned =
    selectedCount > 0 &&
    Object.values(selected).every(
      (a) => a.production_user_id !== '' && a.validation_user_id !== ''
    )

  const reworkMutation = useMutation({
    mutationFn: () =>
      chunksApi.bulkClientRework({
        batch_id: batchId,
        assignments: Object.entries(selected).map(([unitId, assign]) => ({
          unit_id: unitId,
          production_user_id: assign.production_user_id,
          validation_user_id: assign.validation_user_id,
        })),
        reason,
      }),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job', batchId] })
      setSelected({})
      setError('')
      setSuccess(res.data?.detail || `${selectedCount} unit(s) sent for rework.`)
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || err.response?.data?.assignments?.[0] || 'Failed to send units for rework.')
      setSuccess('')
    },
  })

  return (
    <div className="card border-2 border-amber-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Select Files for Rework</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose which completed files need rework and assign production + validation users.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs text-blue-600 hover:text-blue-800 font-medium" onClick={selectAll}>
            Select all
          </button>
          <span className="text-gray-300">|</span>
          <button className="text-xs text-gray-500 hover:text-gray-700 font-medium" onClick={clearAll}>
            Clear
          </button>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {completedUnits.map((unit: any) => {
          const isSelected = unit.chunk_id in selected
          const assign = selected[unit.chunk_id]
          return (
            <div
              key={unit.chunk_id}
              className={`rounded-lg border p-3 transition-colors ${
                isSelected ? 'border-amber-300 bg-amber-50/50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleUnit(unit.chunk_id, unit.production_user_id, unit.validation_user_id)}
                  className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 truncate">{unit.file_name}</p>
                    <span className="text-xs text-gray-400">
                      {unit.unit_start || unit.unit_end
                        ? `${unit.unit_start || '?'} - ${unit.unit_end || '?'}`
                        : 'Whole file'}
                    </span>
                  </div>
                  {unit.production_user_name && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Originally by: {unit.production_user_name}
                    </p>
                  )}
                </div>
              </div>
              {isSelected && (
                <div className="mt-2 ml-7 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Production user</label>
                    <select
                      className="input py-1.5 text-sm mt-1"
                      value={assign?.production_user_id || ''}
                      onChange={(e) => setProdUser(unit.chunk_id, e.target.value)}
                    >
                      <option value="">Select production user</option>
                      {productionMembers.map((m: any) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.user_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Validation user</label>
                    <select
                      className="input py-1.5 text-sm mt-1"
                      value={assign?.validation_user_id || ''}
                      onChange={(e) => setValUser(unit.chunk_id, e.target.value)}
                    >
                      <option value="">Select validation user</option>
                      {validationMembers.map((m: any) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.user_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedCount > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="mb-3">
            <label className="label">Rework reason</label>
            <input
              className="input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe the reason for rework..."
            />
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              <strong>{selectedCount}</strong> file{selectedCount !== 1 ? 's' : ''} selected
              {!allAssigned && (
                <span className="text-amber-600 ml-2">
                  — assign both users to each file
                </span>
              )}
            </p>
            <button
              className="btn-primary !bg-amber-600 !border-amber-600 hover:!bg-amber-700"
              onClick={() => reworkMutation.mutate()}
              disabled={!allAssigned || reworkMutation.isPending}
            >
              <Send className="w-4 h-4" />
              {reworkMutation.isPending
                ? 'Sending...'
                : `Send ${selectedCount} for Rework`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function UploadFeedbackModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => jobsApi.uploadClientReview(batchId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-reviews', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job', batchId] })
      queryClient.invalidateQueries({ queryKey: ['job-units', batchId] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Upload failed.')
    },
  })

  const handleSubmit = () => {
    if (!file) {
      setError('Please select a feedback file.')
      return
    }
    const formData = new FormData()
    formData.append('review_file', file)
    if (note.trim()) formData.append('review_note', note.trim())
    uploadMutation.mutate(formData)
  }

  return (
    <Modal open onClose={onClose} title="Upload Client Feedback" size="md">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-800">
            Upload the client's feedback file. The batch will be marked as "Rework Requested"
            and the SME can then select which files need rework.
          </p>
        </div>

        <div>
          <label className="label">Feedback file</label>
          <input
            type="file"
            className="input"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        <div>
          <label className="label">Review notes (optional)</label>
          <textarea
            className="input min-h-[80px]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe the issues found by the client..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={uploadMutation.isPending}
          >
            <Upload className="w-4 h-4" />
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Feedback'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function SignOffModal({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState('')

  const signOffMutation = useMutation({
    mutationFn: () => jobsApi.signOff(batchId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', batchId] })
      onClose()
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Sign off failed.')
    },
  })

  return (
    <Modal open onClose={onClose} title="Sign Off Batch" size="sm">
      <div className="space-y-4">
        {error && <Alert type="error" message={error} />}
        <p className="text-sm text-gray-700">
          Are you sure you want to sign off this batch? This confirms that the client has
          approved the delivered work and no further rework is needed.
        </p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={() => signOffMutation.mutate()}
            disabled={signOffMutation.isPending}
          >
            <CheckCircle className="w-4 h-4" />
            {signOffMutation.isPending ? 'Signing off...' : 'Confirm Sign Off'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
