import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chunksApi } from '@/api/client'
import { Alert, ChunkStatusBadge, EmptyState, Modal, PageLoader } from '@/components/shared'
import { CheckCircle, Download, XCircle } from 'lucide-react'

export default function ValidatePage() {
  const queryClient = useQueryClient()
  const [selectedRejectTask, setSelectedRejectTask] = useState<any>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['validation-tasks'],
    queryFn: () => chunksApi.myValidationTasks(),
    refetchInterval: 15000,
  })

  const validateMutation = useMutation({
    mutationFn: ({ taskId, result, rejectionReason }: { taskId: string; result: 'approved' | 'rejected'; rejectionReason?: string }) =>
      chunksApi.validate(taskId, { result, rejection_reason: rejectionReason }),
    onSuccess: (_, variables) => {
      setMessage({
        type: 'success',
        text: variables.result === 'approved' ? 'Unit approved successfully.' : 'Unit sent back for redo.',
      })
      setSelectedRejectTask(null)
      setRejectReason('')
      queryClient.invalidateQueries({ queryKey: ['validation-tasks'] })
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Validation failed.' })
    },
  })

  if (isLoading) {
    return <PageLoader />
  }

  const tasks = data?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Validation Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">Review submitted production files</p>
      </div>

      {message && <Alert type={message.type} message={message.text} />}

      <div className="space-y-3">
        {tasks.map((task: any) => (
          <div key={task.chunk_id} className="card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{task.file_name}</p>
                <p className="text-xs text-gray-500 mt-1">{task.file_path}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {task.unit_start || task.unit_end ? `Range ${task.unit_start || '?'} - ${task.unit_end || '?'}` : 'Whole file'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ChunkStatusBadge status={task.status} />
                {task.production_download_url && (
                  <button
                    type="button"
                    className="btn-secondary py-1.5 text-xs"
                    onClick={() =>
                      chunksApi.downloadProduction(task.chunk_id).catch(() =>
                        setMessage({ type: 'error', text: 'Failed to download production file.' })
                      )
                    }
                  >
                    <Download className="w-3.5 h-3.5" />
                    Output
                  </button>
                )}
                <button
                  className="btn-success py-1.5 text-xs"
                  onClick={() => validateMutation.mutate({ taskId: task.chunk_id, result: 'approved' })}
                  disabled={validateMutation.isPending}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button className="btn-danger py-1.5 text-xs" onClick={() => setSelectedRejectTask(task)}>
                  <XCircle className="w-3.5 h-3.5" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}

        {tasks.length === 0 && <EmptyState title="Queue is clear" description="No units are waiting for validation." />}
      </div>

      <Modal open={Boolean(selectedRejectTask)} onClose={() => setSelectedRejectTask(null)} title="Reject Unit" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Provide the reason the unit should return to production.</p>
          <textarea className="input min-h-[120px]" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSelectedRejectTask(null)}>Cancel</button>
            <button
              className="btn-danger"
              onClick={() => selectedRejectTask && validateMutation.mutate({ taskId: selectedRejectTask.chunk_id, result: 'rejected', rejectionReason: rejectReason })}
              disabled={!rejectReason.trim() || validateMutation.isPending}
            >
              {validateMutation.isPending ? 'Sending...' : 'Reject'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
