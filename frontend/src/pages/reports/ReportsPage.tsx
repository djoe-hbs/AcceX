import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyticsApi } from '@/api/client'
import { useAuth } from '@/store/auth'
import { EmptyState, PageLoader, StatCard, Table } from '@/components/shared'

export default function ReportsPage() {
  const { isRole } = useAuth()
  const adminView = isRole('superadmin', 'admin')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {adminView
            ? 'Completed work across all production and validation users (all time).'
            : 'Your successfully validated work (all time).'}
        </p>
      </div>

      {adminView ? <AdminReports /> : <MyReport />}
    </div>
  )
}

function MyReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-me'],
    queryFn: () => analyticsApi.myReport(),
  })

  if (isLoading) return <PageLoader />

  const report = data?.data
  const units = report?.completed_units || []

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Completed Files" value={report?.completed_count ?? 0} color="green" />
      </div>

      <div className="card p-0 overflow-hidden">
        <Table headers={['File', 'Batch', 'Production', 'Validation', 'Completed At']}>
          {units.map((unit: any) => (
            <tr key={unit.id} className="hover:bg-gray-50">
              <td className="table-td">
                <p className="font-medium text-gray-900">{unit.file_name}</p>
                <p className="text-xs text-gray-500">{unit.file_path}</p>
              </td>
              <td className="table-td text-gray-600">{unit.batch_name || '-'}</td>
              <td className="table-td text-gray-600">{unit.production_user?.name || '-'}</td>
              <td className="table-td text-gray-600">{unit.validation_user?.name || '-'}</td>
              <td className="table-td text-gray-600">
                {unit.completed_at ? new Date(unit.completed_at).toLocaleString() : '-'}
              </td>
            </tr>
          ))}
          {units.length === 0 && (
            <tr>
              <td colSpan={5}>
                <EmptyState title="No completed work yet" description="Files appear here after they are approved by a validator." />
              </td>
            </tr>
          )}
        </Table>
      </div>
    </div>
  )
}

function AdminReports() {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-users'],
    queryFn: () => analyticsApi.usersReport(),
  })
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  if (isLoading) return <PageLoader />

  const production = data?.data?.production || []
  const validation = data?.data?.validation || []
  const productionTotal = production.reduce((sum: number, row: any) => sum + (row.completed_count || 0), 0)
  const validationTotal = validation.reduce((sum: number, row: any) => sum + (row.completed_count || 0), 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Production Users" value={production.length} color="blue" />
        <StatCard label="Production Completions" value={productionTotal} color="green" />
        <StatCard label="Validation Users" value={validation.length} color="blue" />
        <StatCard label="Validation Completions" value={validationTotal} color="green" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <UserLeaderboard
          title="Production Users"
          rows={production}
          onSelect={(id) => setSelectedUserId(id)}
        />
        <UserLeaderboard
          title="Validation Users"
          rows={validation}
          onSelect={(id) => setSelectedUserId(id)}
        />
      </div>

      {selectedUserId && (
        <UserDetail userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  )
}

function UserLeaderboard({
  title,
  rows,
  onSelect,
}: {
  title: string
  rows: any[]
  onSelect: (userId: string) => void
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">{title}</h2>
      </div>
      <Table headers={['User', 'Email', 'Completed', '']}>
        {rows.map((row: any) => (
          <tr key={row.user_id} className="hover:bg-gray-50">
            <td className="table-td font-medium text-gray-900">{row.user_name}</td>
            <td className="table-td text-gray-600 text-xs">{row.user_email}</td>
            <td className="table-td text-gray-900 font-semibold">{row.completed_count}</td>
            <td className="table-td">
              <button
                type="button"
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                onClick={() => onSelect(row.user_id)}
              >
                View
              </button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={4}>
              <EmptyState title="No users found" />
            </td>
          </tr>
        )}
      </Table>
    </div>
  )
}

function UserDetail({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['reports-user', userId],
    queryFn: () => analyticsApi.userReport(userId),
  })

  const report = data?.data
  const units = report?.completed_units || []

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">
            {report?.user?.name || 'User details'}
          </h2>
          <p className="text-xs text-gray-500">
            {report?.user?.email} • {report?.completed_count ?? 0} completed
          </p>
        </div>
        <button type="button" className="btn-secondary text-sm" onClick={onClose}>
          Close
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {units.map((unit: any) => (
            <div key={unit.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{unit.file_name}</p>
                  <p className="text-xs text-gray-500">{unit.batch_name}</p>
                </div>
                <p className="text-xs text-gray-500">
                  {unit.completed_at ? new Date(unit.completed_at).toLocaleString() : '-'}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Production: {unit.production_user?.name || '-'} • Validation: {unit.validation_user?.name || '-'}
              </p>
            </div>
          ))}
          {units.length === 0 && <EmptyState title="No completed work" />}
        </div>
      )}
    </div>
  )
}
