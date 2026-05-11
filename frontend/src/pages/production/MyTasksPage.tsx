import { useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chunksApi } from '@/api/client'
import { Alert, Badge, ChunkStatusBadge, EmptyState, ListSkeleton, Modal } from '@/components/shared'
import { AlertTriangle, Download, Upload } from 'lucide-react'

export default function MyTasksPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'assigned' | 'redo' | 'in_validation'>('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
    queryKey: ['my-tasks'],
    queryFn: ({ pageParam }) => chunksApi.myTasksPaged(pageParam),
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
    refetchInterval: 15000,
  })

  const uploadMutation = useMutation({
    mutationFn: ({ taskId, file }: { taskId: string; file: File }) => {
      const formData = new FormData()
      formData.append('completed_file', file)
      return chunksApi.upload(taskId, formData)
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Work uploaded and submitted for validation.' })
      setSelectedTask(null)
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    },
    onError: (err: any) => {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Upload failed.' })
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <ListSkeleton rows={6} />
      </div>
    )
  }

  const tasks = data?.pages?.flatMap((page: any) => page.data || []) || []
  const filteredTasks = tasks.filter((t: any) => {
    const statusMatch = statusFilter === 'all' ? true : t.status === statusFilter
    const q = search.trim().toLowerCase()
    const textMatch = !q || `${t.file_name} ${t.file_path} ${t.batch_name || ''}`.toLowerCase().includes(q)
    return statusMatch && textMatch
  })
  const reworkTasks = filteredTasks.filter((t: any) => t.status === 'redo')
  const regularTasks = filteredTasks.filter((t: any) => t.status !== 'redo')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
      </div>

      {message && <Alert type={message.type} message={message.text} />}
      <div className="card grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          className="input"
          placeholder="Search by file, path, job..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">All statuses</option>
          <option value="assigned">Assigned</option>
          <option value="redo">Redo</option>
          <option value="in_validation">In Validation</option>
        </select>
        <div className="text-sm text-gray-500 flex items-center">{filteredTasks.length} task(s)</div>
      </div>

      {/* Rework section - always on top with prominent styling */}
      {reworkTasks.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-700">Rework Required</h2>
            <Badge variant="red">{reworkTasks.length}</Badge>
          </div>
          <div className="space-y-3">
            {reworkTasks.map((task: any) => (
              <div key={task.chunk_id} className="card border-2 border-red-200 bg-red-50/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{task.file_name}</p>
                      <Badge variant="red">Rework</Badge>
                    </div>
                    {task.batch_name && (
                      <p className="text-xs text-gray-500 mt-1">Job: {task.batch_name}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{task.file_path}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {task.unit_start || task.unit_end ? `Range ${task.unit_start || '?'} - ${task.unit_end || '?'}` : 'Whole file'}
                    </p>
                    {task.redo_reason && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-md p-2">
                        <p className="text-xs font-medium text-red-700">Reason:</p>
                        <p className="text-sm text-red-800">{task.redo_reason}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      onClick={() =>
                        chunksApi.downloadSource(task.chunk_id).catch(() =>
                          setMessage({ type: 'error', text: 'Failed to download source file.' })
                        )
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      Source
                    </button>
                    {task.redo_report_file && (
                      <button
                        type="button"
                        className="btn-secondary py-1.5 text-xs"
                        onClick={() =>
                          chunksApi.downloadRedoReport(task.chunk_id).catch(() =>
                            setMessage({ type: 'error', text: 'Failed to download redo report.' })
                          )
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                        Report
                      </button>
                    )}
                    <button className="btn-primary py-1.5 text-xs !bg-red-600 !border-red-600 hover:!bg-red-700" onClick={() => setSelectedTask(task)}>
                      <Upload className="w-3.5 h-3.5" />
                      Upload Rework
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regular tasks */}
      {regularTasks.length > 0 && (
        <div>
          {reworkTasks.length > 0 && (
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Current Tasks</h2>
          )}
          <div className="space-y-3">
            {regularTasks.map((task: any) => (
              <div key={task.chunk_id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{task.file_name}</p>
                    {task.batch_name && (
                      <p className="text-xs text-gray-500 mt-1">Job: {task.batch_name}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-0.5">{task.file_path}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {task.unit_start || task.unit_end ? `Range ${task.unit_start || '?'} - ${task.unit_end || '?'}` : 'Whole file'}
                    </p>
                    {task.redo_reason && (
                      <p className="text-xs text-red-600 mt-2">Redo reason: {task.redo_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <ChunkStatusBadge status={task.status} />
                    <button
                      type="button"
                      className="btn-secondary py-1.5 text-xs"
                      onClick={() =>
                        chunksApi.downloadSource(task.chunk_id).catch(() =>
                          setMessage({ type: 'error', text: 'Failed to download source file.' })
                        )
                      }
                    >
                      <Download className="w-3.5 h-3.5" />
                      Source
                    </button>
                    {task.status !== 'completed' && task.status !== 'in_validation' && (
                      <button className="btn-primary py-1.5 text-xs" onClick={() => setSelectedTask(task)}>
                        <Upload className="w-3.5 h-3.5" />
                        Upload
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredTasks.length === 0 && <EmptyState title="No tasks found" description="Try changing search/filter or wait for new assignments." />}

      {hasNextPage && (
        <div className="flex justify-center">
          <button className="btn-secondary" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}

      <Modal open={Boolean(selectedTask)} onClose={() => setSelectedTask(null)} title={selectedTask?.status === 'redo' ? 'Upload Rework File' : 'Upload Completed File'} size="sm">
        <div className="space-y-4">
          {selectedTask?.status === 'redo' && selectedTask?.redo_reason && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-xs font-medium text-red-700">Rework reason:</p>
              <p className="text-sm text-red-800">{selectedTask.redo_reason}</p>
            </div>
          )}
          <p className="text-sm text-gray-600">Upload the completed file for this unit. It will then move into validation.</p>
          <input ref={fileRef} type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
          <button className="btn-secondary w-full justify-center" onClick={() => fileRef.current?.click()}>
            <Upload className="w-4 h-4" />
            {selectedFile ? selectedFile.name : 'Choose file'}
          </button>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSelectedTask(null)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => selectedTask && selectedFile && uploadMutation.mutate({ taskId: selectedTask.chunk_id, file: selectedFile })}
              disabled={!selectedTask || !selectedFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Submit'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
