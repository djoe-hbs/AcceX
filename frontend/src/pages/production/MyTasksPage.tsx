import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chunksApi } from '@/api/client'
import { Alert, ChunkStatusBadge, EmptyState, Modal, PageLoader } from '@/components/shared'
import { Download, Upload } from 'lucide-react'

export default function MyTasksPage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedTask, setSelectedTask] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['my-tasks'],
    queryFn: () => chunksApi.myTasks(),
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
    return <PageLoader />
  }

  const tasks = data?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
        <p className="text-sm text-gray-500 mt-0.5">Production units assigned to your account</p>
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
                {task.redo_reason && (
                  <p className="text-xs text-red-600 mt-2">Redo reason: {task.redo_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ChunkStatusBadge status={task.status} />
                <a href={task.download_url} className="btn-secondary py-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" />
                  Source
                </a>
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

        {tasks.length === 0 && <EmptyState title="No assigned tasks" description="When units are assigned to you, they will appear here." />}
      </div>

      <Modal open={Boolean(selectedTask)} onClose={() => setSelectedTask(null)} title="Upload Completed File" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Upload the completed file for this unit. The backend will move it into validation.</p>
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
