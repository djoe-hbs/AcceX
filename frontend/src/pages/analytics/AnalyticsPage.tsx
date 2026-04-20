import { useQuery } from '@tanstack/react-query'
import { analyticsApi, jobsApi, usersApi } from '@/api/client'
import { EmptyState, JobStatusBadge, PageLoader, RoleBadge, StatCard } from '@/components/shared'

export default function AnalyticsPage() {
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: () => analyticsApi.dashboard(),
    refetchInterval: 15000,
  })

  const { data: jobsData, isLoading: jobsLoading } = useQuery({
    queryKey: ['analytics-jobs'],
    queryFn: () => jobsApi.list(),
    refetchInterval: 15000,
  })

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['analytics-users'],
    queryFn: () => usersApi.list(),
    refetchInterval: 15000,
  })

  if (summaryLoading || jobsLoading || usersLoading) {
    return <PageLoader />
  }

  const summary = summaryData?.data
  const jobs = jobsData?.data || []
  const users = usersData?.data || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-500 mt-0.5">Live summary computed from currently exposed backend endpoints</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Jobs" value={summary?.total_jobs ?? 0} color="blue" />
        <StatCard label="Ready" value={summary?.ready_jobs ?? 0} color="green" />
        <StatCard label="Processing" value={summary?.processing_jobs ?? 0} color="yellow" />
        <StatCard label="Failed" value={summary?.failed_jobs ?? 0} color="red" />
        <StatCard label="Files" value={summary?.total_files ?? 0} color="blue" />
        <StatCard label="Users" value={summary?.total_users ?? 0} color="gray" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Job Status</h2>
          <div className="space-y-3">
            {jobs.map((job: any) => (
              <div key={job.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{job.title}</p>
                  <p className="text-xs text-gray-500">{job.client_name || 'No client'}</p>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
            ))}
            {jobs.length === 0 && <EmptyState title="No jobs yet" />}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Users By Role</h2>
          <div className="space-y-3">
            {users.map((user: any) => (
              <div key={user.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <RoleBadge role={user.role} />
              </div>
            ))}
            {users.length === 0 && <EmptyState title="No users found" />}
          </div>
        </div>
      </div>
    </div>
  )
}
