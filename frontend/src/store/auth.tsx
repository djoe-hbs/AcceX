import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authApi } from '@/api/client'

interface User {
  id: string
  email: string
  name: string
  role: 'superadmin' | 'admin' | 'sme' | 'production' | 'validation'
  is_active: boolean
  created_at: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isRole: (...roles: string[]) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (token) {
      const cachedUser = localStorage.getItem('auth_user')
      if (cachedUser) {
        try {
          setUser(JSON.parse(cachedUser))
        } catch {
          localStorage.removeItem('auth_user')
        }
      }

      authApi.me()
        .then((res) => {
          setUser(res.data)
          localStorage.setItem('auth_user', JSON.stringify(res.data))
        })
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('auth_user', JSON.stringify(data.user))
    setUser(data.user)
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
    window.location.href = '/login'
  }

  const isRole = (...roles: string[]) => {
    return user ? roles.includes(user.role) : false
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
