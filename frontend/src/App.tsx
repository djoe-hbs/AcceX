import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/store/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import { JobsListPage, JobDetailPage } from '@/pages/jobs/JobsPage'
import MyTasksPage from '@/pages/production/MyTasksPage'
import ValidatePage from '@/pages/validation/ValidatePage'
import UsersPage from '@/pages/admin/UsersPage'
import ClientsPage from '@/pages/superadmin/ClientsPage'
import { InvoicesPage, NotificationsPage } from '@/pages/superadmin/InvoicesAndNotifs'
import SettingsPage from '@/pages/SettingsPage'
import ChunkProgressPage from '@/pages/sme/ChunkProgressPage'
import ReworkHistoryPage from '@/pages/sme/ReworkHistoryPage'
import AnalyticsPage from '@/pages/analytics/AnalyticsPage'
import ReportsPage from '@/pages/reports/ReportsPage'
import { PageLoader } from '@/components/shared'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <AppLayout>{children}</AppLayout>
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />

      {/* Jobs */}
      <Route path="/jobs" element={<ProtectedRoute roles={['superadmin','admin','sme']}><JobsListPage /></ProtectedRoute>} />
      <Route path="/jobs/:id" element={<ProtectedRoute roles={['superadmin','admin','sme']}><JobDetailPage /></ProtectedRoute>} />
      <Route path="/jobs/:id/chunks" element={<ProtectedRoute roles={['superadmin','admin','sme']}><ChunkProgressPage /></ProtectedRoute>} />

      {/* Chunk rework history - accessible to all who can see jobs */}
      <Route path="/chunks/:chunkId/history" element={<ProtectedRoute roles={['superadmin','admin','sme','validation']}><ReworkHistoryPage /></ProtectedRoute>} />

      {/* Production */}
      <Route path="/my-tasks" element={<ProtectedRoute roles={['production']}><MyTasksPage /></ProtectedRoute>} />

      {/* Validation */}
      <Route path="/validate" element={<ProtectedRoute roles={['validation']}><ValidatePage /></ProtectedRoute>} />

      {/* Management */}
      <Route path="/users" element={<ProtectedRoute roles={['superadmin','admin']}><UsersPage /></ProtectedRoute>} />
      <Route path="/clients" element={<ProtectedRoute roles={['superadmin']}><ClientsPage /></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute roles={['superadmin']}><InvoicesPage /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute roles={['superadmin','admin']}><AnalyticsPage /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute roles={['superadmin','admin','production','validation']}><ReportsPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
