import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { chunksApi, usersApi } from '@/api/client'
import { Alert, ChunkStatusBadge, EmptyState, Modal, PageLoader, Table } from '@/components/shared'
import { ChevronRight, RefreshCw } from 'lucide-react'

export default function ChunkProgressPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const [selectedUnit, setSelectedUnit] = useState<any>(null)
  const [newProductionUserId, setNewProductionUserId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['chunk-progress', id],
    queryFn: () => chunksApi.byBatch(id || ''),
    enabled: Boolean(id),
    refetchInterval: 15000,
  })

  const { data: usersData } = useQuery({
    queryKey: ['production-users'],
    queryFn: () => usersApi.list({ role: 'production', is_active: true }),
  })

  const reassignMutation = useMutation({
    mutationFn: ({ chunkId, userId, reassignReason }: { chunkId: string; userId: string; reassignReason: string }) =>
      chunksApi.reassignProduction(chunkId, {
        new_production_user_id: userId,
        reason: reassignReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chunk-progress', id] })
      setSelectedUnit(null)
      setNewProductionUserId('')
      setReason('')
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Unable to reassign unit.')
    },
  })

  if (isLoading) {
    return <PageLoader />
  }

  const units = data?.data || []
  const productionUsers = usersData?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/jobs" className="hover:text-gray-700">Jobs</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to={`/jobs/${id}`} className="hover:text-gray-700">Job</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Units</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Chunk Progress</h1>
        <p className="text-sm text-gray-500 mt-0.5">All work units currently attached to this batch</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['File', 'Range', 'Status', 'Production User', 'Validation User', 'Actions']}>
          {units.map((unit: any) => (
            <tr key={unit.chunk_id} className="hover:bg-gray-50">
              <td className="table-td font-medium text-gray-900">{unit.file_name}</td>
              <td className="table-td text-gray-600">
                {unit.unit_start || unit.unit_end ? `${unit.unit_start || '?'} - ${unit.unit_end || '?'}` : 'Whole file'}
              </td>
              <td className="table-td"><ChunkStatusBadge status={unit.status} /></td>
              <td className="table-td text-gray-600">{unit.production_user_id || 'Unassigned'}</td>
              <td className="table-td text-gray-600">{unit.validation_user_id || 'Unassigned'}</td>
              <td className="table-td">
                {(unit.status === 'assigned' || unit.status === 'redo') && (
                  <button
                    className="btn-secondary py-1.5 text-xs"
                    onClick={() => {
                      setSelectedUnit(unit)
                      setNewProductionUserId('')
                      setReason('')
                      setError('')
                    }}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reassign
                  </button>
                )}
              </td>
            </tr>
          ))}
          {units.length === 0 && (
            <tr>
              <td colSpan={6}>
                <EmptyState title="No units found" description="Auto-assign the batch first to create units." />
              </td>
            </tr>
          )}
        </Table>
      </div>

      <Modal open={Boolean(selectedUnit)} onClose={() => setSelectedUnit(null)} title="Reassign Production User" size="sm">
        <div className="space-y-4">
          {error && <Alert type="error" message={error} />}
          <div>
            <label className="label">Production user</label>
            <select className="input" value={newProductionUserId} onChange={(e) => setNewProductionUserId(e.target.value)}>
              <option value="">Select user</option>
              {productionUsers.map((user: any) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Reason</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setSelectedUnit(null)}>Cancel</button>
            <button
              className="btn-primary"
              onClick={() => selectedUnit && reassignMutation.mutate({ chunkId: selectedUnit.chunk_id, userId: newProductionUserId, reassignReason: reason })}
              disabled={!newProductionUserId || reassignMutation.isPending}
            >
              {reassignMutation.isPending ? 'Saving...' : 'Reassign'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
