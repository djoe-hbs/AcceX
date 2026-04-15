import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { chunksApi } from '@/api/client'
import { ChunkStatusBadge, EmptyState, PageLoader } from '@/components/shared'
import { ChevronRight } from 'lucide-react'

export default function ReworkHistoryPage() {
  const { chunkId } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['chunk', chunkId],
    queryFn: () => chunksApi.get(chunkId || ''),
    enabled: Boolean(chunkId),
  })

  if (isLoading) {
    return <PageLoader />
  }

  const chunk = data?.data

  if (!chunk) {
    return <EmptyState title="Unit not found" description="The requested unit could not be loaded." />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/jobs" className="hover:text-gray-700">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Unit {chunkId}</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Unit Details</h1>
        <p className="text-sm text-gray-500 mt-0.5">The backend does not expose historical versions yet, so this page shows the current state of the unit.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">{chunk.file_name}</p>
            <p className="text-xs text-gray-500">{chunk.file_path}</p>
          </div>
          <ChunkStatusBadge status={chunk.status} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Range</p>
            <p className="text-gray-900">{chunk.unit_start || chunk.unit_end ? `${chunk.unit_start || '?'} - ${chunk.unit_end || '?'}` : 'Whole file'}</p>
          </div>
          <div>
            <p className="text-gray-500">Assigned production user</p>
            <p className="text-gray-900">{chunk.production_user_id || 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-gray-500">Assigned validation user</p>
            <p className="text-gray-900">{chunk.validation_user_id || 'Unassigned'}</p>
          </div>
          <div>
            <p className="text-gray-500">Redo reason</p>
            <p className="text-gray-900">{chunk.redo_reason || 'None'}</p>
          </div>
          <div>
            <p className="text-gray-500">Validator feedback</p>
            <p className="text-gray-900">{chunk.validator_feedback || 'None'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
