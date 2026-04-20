import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { analyticsApi, chunksApi, jobsApi } from '@/api/client'
import { useAuth } from '@/store/auth'
import { EmptyState, JobStatusBadge, ChunkStatusBadge, PageLoader, StatCard } from '@/components/shared'

export default function DashboardPage() {
  const { isRole } = useAuth()

  if (isRole('superadmin', 'admin', 'sme')) {
    return <ManagementDashboard />
  }

  if (isRole('production')) {
    return <ProductionDashboard />
  }

  return <ValidationDashboard />
}

function ManagementDashboard() {
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => analyticsApi.dashboard(),
    refetchInterval: 15000,
  })

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['dashboard-jobs'],
    queryFn: () => jobsApi.list(),
    refetchInterval: 15000,
  })

  if (statsLoading || jobsLoading) {
    return <PageLoader />
  }

  const stats = statsData?.data
  const jobs = jobsData?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Current backend-connected workspace overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={stats?.total_jobs ?? 0} color="blue" />
        <StatCard label="Ready Jobs" value={stats?.ready_jobs ?? 0} color="green" />
        <StatCard label="Processing" value={stats?.processing_jobs ?? 0} color="yellow" />
        <StatCard label="Failed Jobs" value={stats?.failed_jobs ?? 0} color="red" />
        <StatCard label="Total Files" value={stats?.total_files ?? 0} color="blue" />
        <StatCard label="Users" value={stats?.total_users ?? 0} color="gray" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Recent Jobs</h2>
          <Link to="/jobs" className="text-sm text-blue-600 hover:underline">View all</Link>
        </div>
        <div className="space-y-3">
          {jobs.slice(0, 8).map((job: any) => (
            <Link
              key={job.id}
              to={`/jobs/${job.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{job.title}</p>
                <p className="text-xs text-gray-500">
                  {job.client_name || 'No client'} • {job.total_files || 0} files
                </p>
              </div>
              <JobStatusBadge status={job.status} />
            </Link>
          ))}
          {jobs.length === 0 && <EmptyState title="No jobs yet" description="Upload a ZIP batch to get started." />}
        </div>
      </div>
    </div>
  )
}

function ProductionDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['production-dashboard-tasks'],
    queryFn: () => chunksApi.myTasks(),
    refetchInterval: 15000,
  })

  if (isLoading) {
    return <PageLoader />
  }

  const tasks = data?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">My Work</h1>
        <p className="text-sm text-gray-500 mt-0.5">Current production assignments from the backend</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Assigned" value={tasks.filter((t: any) => t.status === 'assigned').length} color="blue" />
        <StatCard label="Redo" value={tasks.filter((t: any) => t.status === 'redo').length} color="orange" />
        <StatCard label="Completed" value={tasks.filter((t: any) => t.status === 'completed').length} color="green" />
        <StatCard label="Total" value={tasks.length} color="gray" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Assigned Units</h2>
          <Link to="/my-tasks" className="text-sm text-blue-600 hover:underline">Open queue</Link>
        </div>
        <div className="space-y-3">
          {tasks.slice(0, 6).map((task: any) => (
            <Link
              key={task.chunk_id}
              to="/my-tasks"
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{task.file_name}</p>
                <p className="text-xs text-gray-500">{task.file_path}</p>
              </div>
              <ChunkStatusBadge status={task.status} />
            </Link>
          ))}
          {tasks.length === 0 && <EmptyState title="No assigned work" description="New assignments will show up here." />}
        </div>
      </div>
    </div>
  )
}

function ValidationDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['validation-dashboard-tasks'],
    queryFn: () => chunksApi.myValidationTasks(),
    refetchInterval: 15000,
  })

  if (isLoading) {
    return <PageLoader />
  }

  const tasks = data?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Validation Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">Units waiting for review</p>
      </div>

      <StatCard label="Pending Review" value={tasks.length} color="yellow" />

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Incoming Units</h2>
          <Link to="/validate" className="text-sm text-blue-600 hover:underline">Open queue</Link>
        </div>
        <div className="space-y-3">
          {tasks.slice(0, 6).map((task: any) => (
            <Link
              key={task.chunk_id}
              to="/validate"
              className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{task.file_name}</p>
                <p className="text-xs text-gray-500">{task.file_path}</p>
              </div>
              <ChunkStatusBadge status={task.status} />
            </Link>
          ))}
          {tasks.length === 0 && <EmptyState title="Queue is clear" description="There are no units in validation right now." />}
        </div>
      </div>
    </div>
  )
}
