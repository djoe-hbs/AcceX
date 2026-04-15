import axios from 'axios'

type UiRole = 'superadmin' | 'admin' | 'sme' | 'production' | 'validation'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

const roleMap: Record<string, UiRole> = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  SME: 'sme',
  PRODUCTION_USER: 'production',
  VALIDATION_USER: 'validation',
}

const batchStatusMap: Record<string, string> = {
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
}

const unitStatusMap: Record<string, string> = {
  PENDING: 'pending',
  ASSIGNED_TO_PRODUCTION: 'assigned',
  IN_VALIDATION: 'in_validation',
  REDO: 'redo',
  COMPLETED: 'completed',
}

function mapRole(role?: string): UiRole | string {
  return role ? roleMap[role] || role.toLowerCase() : ''
}

function mapBatch(batch: any) {
  return {
    ...batch,
    title: batch.name,
    status: batchStatusMap[batch.status] || batch.status?.toLowerCase(),
    created_at: batch.created,
    updated_at: batch.updated,
  }
}

function mapUser(user: any) {
  return {
    ...user,
    role: mapRole(user.role),
    created_at: user.created,
    updated_at: user.updated,
  }
}

function mapUnit(unit: any) {
  const fileType = unit.count_type === 'ROW' ? 'excel' : unit.work_file_path?.split('.').pop()?.toLowerCase()
  return {
    ...unit,
    chunk_id: unit.id,
    batch_id: unit.batch_id,
    file_name: unit.work_file_path?.split('/').pop() || unit.work_file_path,
    file_path: unit.work_file_path,
    file_type: fileType,
    status: unitStatusMap[unit.status] || unit.status?.toLowerCase(),
    unit_start: unit.range_start,
    unit_end: unit.range_end,
    unit_count: unit.workload_count,
    created_at: unit.created,
    updated_at: unit.updated,
    submitted_at: unit.production_submitted_at,
    download_url: `/api/v1/work/unit/${unit.id}/download-source/`,
    production_download_url: unit.production_output ? `/api/v1/work/unit/${unit.id}/download-production/` : null,
  }
}

function buildFileTree(files: any[]) {
  const roots: any[] = []
  const folders = new Map<string, any>()

  for (const file of files) {
    const parts = file.relative_path.split('/').filter(Boolean)
    let currentPath = ''
    let currentChildren = roots

    parts.forEach((part: string, index: number) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isLeaf = index === parts.length - 1

      if (isLeaf && !file.is_directory) {
        currentChildren.push({
          name: part,
          full_path: file.relative_path,
          type: 'file',
          file_id: file.id,
          file_type: (file.file_type || 'OTHER').toLowerCase(),
          size_bytes: file.size_bytes,
          page_count: file.count_type === 'PAGE' ? file.count : undefined,
          row_count: file.count_type === 'ROW' ? file.count : undefined,
        })
        return
      }

      if (!folders.has(currentPath)) {
        const folder = {
          name: part,
          full_path: currentPath,
          type: 'folder',
          children: [],
        }
        folders.set(currentPath, folder)
        currentChildren.push(folder)
      }

      currentChildren = folders.get(currentPath).children
    })
  }

  return roots
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let isRefreshing = false
let failedQueue: Array<{ resolve: (v: string) => void; reject: (e: unknown) => void }> = []

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => (token ? p.resolve(token) : p.reject(error)))
  failedQueue = []
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest?._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`
          return api(originalRequest)
        })
      }

      const refreshToken = localStorage.getItem('refresh_token')
      if (!refreshToken) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const { data } = await axios.post('/api/v1/auth/refresh/', { refresh: refreshToken })
        localStorage.setItem('access_token', data.access)
        if (data.refresh) {
          localStorage.setItem('refresh_token', data.refresh)
        }
        processQueue(null, data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)

export const authApi = {
  login: async (email: string, password: string) => {
    const response = await api.post('/auth/login/', { email, password })
    return {
      ...response,
      data: {
        ...response.data,
        access_token: response.data.access,
        refresh_token: response.data.refresh,
        user: mapUser(response.data.user),
      },
    }
  },
  me: async () => {
    const response = await api.get('/auth/me/')
    return { ...response, data: mapUser(response.data) }
  },
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/password/change-password/', {
      old_password: oldPassword,
      new_password: newPassword,
    }),
}

export const usersApi = {
  list: async (params?: { role?: string; is_active?: boolean }) => {
    const roleParam = params?.role
      ? {
          superadmin: 'SUPERADMIN',
          admin: 'ADMIN',
          sme: 'SME',
          production: 'PRODUCTION_USER',
          validation: 'VALIDATION_USER',
        }[params.role] || params.role
      : undefined

    const response = await api.get('/user/', {
      params: {
        role: roleParam,
        is_active: params?.is_active,
      },
    })

    return {
      ...response,
      data: response.data.map(mapUser),
    }
  },
  get: async (id: string) => {
    const response = await api.get(`/user/${id}/`)
    return { ...response, data: mapUser(response.data) }
  },
  create: async (data: { name: string; email: string; password: string; role: string }) => {
    const role = {
      admin: 'ADMIN',
      sme: 'SME',
      production: 'PRODUCTION_USER',
      validation: 'VALIDATION_USER',
    }[data.role] || data.role

    const response = await api.post('/auth/user/create-user/', { ...data, role })
    return { ...response, data: mapUser(response.data) }
  },
  update: async (id: string, data: object) => {
    const response = await api.patch(`/user/${id}/`, data)
    return { ...response, data: mapUser(response.data) }
  },
}

export const clientsApi = {
  list: async () => {
    const response = await api.get('/client/')
    return response
  },
  get: (id: string) => api.get(`/client/${id}/`),
  create: (data: object) => api.post('/client/', data),
  update: (id: string, data: object) => api.patch(`/client/${id}/`, data),
}

export const jobsApi = {
  list: async () => {
    const response = await api.get('/work/batch/')
    return { ...response, data: response.data.map(mapBatch) }
  },
  get: async (id: string) => {
    const response = await api.get(`/work/batch/${id}/`)
    return { ...response, data: mapBatch(response.data) }
  },
  create: async (formData: FormData) => {
    const response = await api.post('/work/batch/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return { ...response, data: mapBatch(response.data) }
  },
  files: async (id: string) => {
    const response = await api.get(`/work/batch/${id}/files/`)
    return response
  },
  fileTree: async (id: string) => {
    const response = await jobsApi.files(id)
    return { ...response, data: buildFileTree(response.data) }
  },
  members: (id: string) => api.get(`/work/batch/${id}/members/`),
  addMember: (id: string, data: { user_id: string; role: 'PRODUCTION' | 'VALIDATION' }) =>
    api.post(`/work/batch/${id}/members/add/`, data),
  removeMember: (id: string, data: { user_id: string; role: 'PRODUCTION' | 'VALIDATION' }) =>
    api.post(`/work/batch/${id}/members/remove/`, data),
  autoAssign: (
    data: {
      batch_id: string
      production_user_ids: string[]
      validation_user_ids: string[]
      batch_size_per_production_user?: number
      split_threshold?: number
      split_chunk_size?: number
    }
  ) => api.post('/work/unit/auto-assign/', data),
}

export const chunksApi = {
  myTasks: async () => {
    const response = await api.get('/work/unit/')
    return { ...response, data: response.data.map(mapUnit) }
  },
  myValidationTasks: async () => {
    const response = await api.get('/work/unit/')
    return {
      ...response,
      data: response.data.map(mapUnit).filter((unit: any) => unit.status === 'in_validation'),
    }
  },
  byBatch: async (batchId: string) => {
    const response = await api.get('/work/unit/', { params: { batch_id: batchId } })
    return { ...response, data: response.data.map(mapUnit) }
  },
  get: async (id: string) => {
    const response = await api.get(`/work/unit/${id}/`)
    return { ...response, data: mapUnit(response.data) }
  },
  upload: (id: string, formData: FormData) =>
    api.post(`/work/unit/${id}/submit-production/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validate: (id: string, data: { result: 'approved' | 'rejected'; rejection_reason?: string }) =>
    api.post(`/work/unit/${id}/validate/`, {
      decision: data.result === 'approved' ? 'APPROVE' : 'REDO',
      reason: data.rejection_reason || '',
    }),
  reassignProduction: (id: string, data: { new_production_user_id: string; reason?: string }) =>
    api.post(`/work/unit/${id}/reassign-production/`, data),
}

export const analyticsApi = {
  dashboard: async () => {
    const [jobsResponse, usersResponse] = await Promise.all([jobsApi.list(), usersApi.list()])
    const jobs = jobsResponse.data
    const users = usersResponse.data
    return {
      data: {
        total_jobs: jobs.length,
        ready_jobs: jobs.filter((job: any) => job.status === 'ready').length,
        processing_jobs: jobs.filter((job: any) => job.status === 'processing').length,
        failed_jobs: jobs.filter((job: any) => job.status === 'failed').length,
        total_files: jobs.reduce((sum: number, job: any) => sum + (job.total_files || 0), 0),
        total_users: users.length,
        total_clients: 0,
      },
    }
  },
}

export const notifApi = {
  list: async (_unreadOnly?: boolean) => ({ data: [] as any[] }),
}

export default api
