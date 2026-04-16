import { ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import {
  LayoutDashboard, Users, Building2, Briefcase, FileText,
  Bell, LogOut, ChevronLeft, ChevronRight, Settings,
  ClipboardCheck, Upload, BarChart3, FileBarChart
} from 'lucide-react'
import { clsx } from 'clsx'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  roles: string[]
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['superadmin', 'admin', 'sme', 'production', 'validation'] },
  { label: 'Jobs', href: '/jobs', icon: Briefcase, roles: ['superadmin', 'admin', 'sme'] },
  { label: 'My Tasks', href: '/my-tasks', icon: Upload, roles: ['production'] },
  { label: 'Validate', href: '/validate', icon: ClipboardCheck, roles: ['validation'] },
  { label: 'Clients', href: '/clients', icon: Building2, roles: ['superadmin'] },
  { label: 'Users', href: '/users', icon: Users, roles: ['superadmin', 'admin'] },
  { label: 'Invoices', href: '/invoices', icon: FileText, roles: ['superadmin'] },
  { label: 'Analytics', href: '/analytics', icon: BarChart3, roles: ['superadmin', 'admin'] },
  { label: 'Reports', href: '/reports', icon: FileBarChart, roles: ['superadmin', 'admin', 'production', 'validation'] },
]

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (v: boolean) => void }) {
  const { user, logout, isRole } = useAuth()
  const location = useLocation()
  const visibleItems = NAV_ITEMS.filter((item) => isRole(...item.roles))

  return (
    <aside className={clsx(
      'flex flex-col bg-gray-900 text-white h-screen sticky top-0 transition-all duration-200',
      collapsed ? 'w-16' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        {!collapsed && (
          <div>
            <p className="font-bold text-sm text-white">AccessPMS</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {visibleItems.map((item) => {
          const active = location.pathname === item.href ||
            (item.href !== '/' && location.pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              to={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors',
                active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="border-t border-gray-800 p-3">
        <Link
          to="/settings"
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors mb-1',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Settings' : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button
          onClick={logout}
          className={clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-900 hover:text-red-300 transition-colors w-full',
            collapsed && 'justify-center'
          )}
          title={collapsed ? 'Logout' : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // TODO: enable polling once the notifications API is implemented
  const unreadCount = 0

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10">
      <div />
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/notifications')}
          className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <Bell className="w-5 h-5 text-gray-600" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-semibold">
              {user?.name?.slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div className="hidden md:block">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>
    </header>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
