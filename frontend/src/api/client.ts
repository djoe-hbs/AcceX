import axios, { type AxiosProgressEvent } from 'axios'

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
  COMPLETED: 'completed',
  INACTIVE: 'inactive',
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

function deriveBatchDisplayStatus(batch: any): string {
  const base = batchStatusMap[batch.status] || batch.status?.toLowerCase()
  if (base !== 'completed') return base
  if (batch.delivery_status === 'SIGNED_OFF') return 'fully_completed'
  if (batch.delivery_status === 'REWORK_REQUESTED') return 'on_rework'
  return base
}

function mapBatch(batch: any) {
  return {
    ...batch,
    title: batch.name,
    status: deriveBatchDisplayStatus(batch),
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
  const fileType = unit.count_type === 'ROW' ? 'excel' : (unit.work_file_path?.split('.').pop()?.toLowerCase() ?? 'other')
  return {
    ...unit,
    chunk_id: unit.id,
    batch_id: unit.batch_id,
    batch_name: unit.batch_name || null,
    file_name: unit.work_file_path?.split('/').pop() || unit.work_file_path,
    file_path: unit.work_file_path,
    file_type: fileType,
    production_user_id: unit.production_user_id ?? null,
    validation_user_id: unit.validation_user_id ?? null,
    production_user_name: unit.production_user_name ?? null,
    validation_user_name: unit.validation_user_name ?? null,
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

function extractListData(payload: any) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (Array.isArray(payload?.results)) {
    return payload.results
  }

  if (payload != null) {
    console.warn('[extractListData] unexpected response shape:', typeof payload, Object.keys(payload ?? {}))
  }
  return []
}

function toRelativeApiPath(url: string) {
  if (!url) return url
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url)
      const prefix = '/api/v1'
      const pathWithQuery = `${parsed.pathname}${parsed.search}`
      return pathWithQuery.startsWith(prefix) ? pathWithQuery.slice(prefix.length) : pathWithQuery
    } catch {
      return url
    }
  }
  return url
}

export async function fetchAllPages(url: string) {
  let nextUrl: string | null = url
  const items: any[] = []

  while (nextUrl) {
    const response: any = await api.get(nextUrl)
    const pageItems = extractListData(response.data)
    items.push(...pageItems)
    const rawNext = response.data?.next || null
    nextUrl = rawNext ? toRelativeApiPath(rawNext) : null
  }

  return items
}

export function buildFileTree(files: any[]) {
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

      originalRequest._retry = true
      isRefreshing = true

      try {
        // Refresh token is sent automatically via httpOnly cookie
        const { data } = await axios.post('/api/v1/auth/refresh/', {}, { withCredentials: true })
        localStorage.setItem('access_token', data.access)
        processQueue(null, data.access)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        localStorage.removeItem('access_token')
        localStorage.removeItem('auth_user')
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
    // withCredentials ensures the browser stores the httpOnly refresh cookie
    const response = await api.post('/auth/login/', { email, password }, { withCredentials: true })
    return {
      ...response,
      data: {
        ...response.data,
        access_token: response.data.access,
        user: mapUser(response.data.user),
      },
    }
  },
  logout: () => api.post('/auth/logout/', {}, { withCredentials: true }),
  me: async () => {
    const response = await api.get('/auth/me/')
    return { ...response, data: mapUser(response.data) }
  },
  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/password/change-password/', {
      old_password: oldPassword,
      new_password: newPassword,
    }),
  changeUserPassword: (targetUserId: string, newPassword: string) =>
    api.post('/auth/password/change-password/', {
      target_user_id: targetUserId,
      new_password: newPassword,
    }),
}

export const usersApi = {
  list: async (params?: { role?: string; is_active?: boolean; available?: boolean }) => {
    const roleParam = params?.role
      ? {
          superadmin: 'SUPERADMIN',
          admin: 'ADMIN',
          sme: 'SME',
          production: 'PRODUCTION_USER',
          validation: 'VALIDATION_USER',
        }[params.role] || params.role
      : undefined

    const query = new URLSearchParams()
    if (roleParam) query.set('role', roleParam)
    if (params?.is_active !== undefined) query.set('is_active', String(params.is_active))
    if (params?.available) query.set('available', 'true')

    const suffix = query.toString() ? `?${query.toString()}` : ''
    const data = await fetchAllPages(`/user/${suffix}`)
    return { data: data.map(mapUser) }
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
  delete: (id: string) => api.delete(`/user/${id}/`),
}

export const clientsApi = {
  list: async () => {
    const data = await fetchAllPages('/client/')
    return { data }
  },
  get: (id: string) => api.get(`/client/${id}/`),
  create: (data: object) => api.post('/client/', data),
  update: (id: string, data: object) => api.patch(`/client/${id}/`, data),
}

export const jobsApi = {
  list: async () => {
    const data = await fetchAllPages('/work/batch/')
    return { data: data.map(mapBatch) }
  },
  listPaged: async (page = 1) => {
    const response = await api.get(`/work/batch/?page=${page}`)
    const payload = response.data
    const results = (Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []).map(mapBatch)
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  get: async (id: string) => {
    const response = await api.get(`/work/batch/${id}/`)
    return { ...response, data: mapBatch(response.data) }
  },
  create: async (formData: FormData, onUploadProgress?: (event: AxiosProgressEvent) => void) => {
    const response = await api.post('/work/batch/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
    return { ...response, data: mapBatch(response.data) }
  },
  files: async (id: string) => {
    const data = await fetchAllPages(`/work/batch/${id}/files/`)
    return { data }
  },
  filesPaged: async (id: string, page = 1) => {
    const response = await api.get(`/work/batch/${id}/files/?page=${page}`)
    const payload = response.data
    const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  fileTree: async (id: string) => {
    const response = await jobsApi.files(id)
    return { ...response, data: buildFileTree(response.data) }
  },
  members: async (id: string) => {
    const data = await fetchAllPages(`/work/batch/${id}/members/`)
    return { data }
  },
  addMember: (id: string, data: { user_id: string; role: 'PRODUCTION' | 'VALIDATION' }) =>
    api.post(`/work/batch/${id}/members/add/`, data),
  removeMember: (id: string, data: { user_id: string; role: 'PRODUCTION' | 'VALIDATION' }) =>
    api.post(`/work/batch/${id}/members/remove/`, data),
  autoAssign: (
    data: {
      batch_id: string
      production_user_ids: string[]
      validation_user_ids: string[]
    }
  ) => api.post('/work/unit/auto-assign/', data),
  downloadCompleted: (id: string) => downloadUnitFile(`/work/batch/${id}/download-completed/`),
  downloadClientReview: (batchId: string, reviewId: string) =>
    downloadUnitFile(`/work/batch/${batchId}/client-review/download/${reviewId}/`),
  clientReviews: async (id: string) => {
    const response = await api.get(`/work/batch/${id}/client-review/`)
    return { data: extractListData(response.data) }
  },
  uploadClientReview: (id: string, formData: FormData) =>
    api.post(`/work/batch/${id}/client-review/upload/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  signOff: (id: string, signedOff: boolean) =>
    api.post(`/work/batch/${id}/sign-off/`, { signed_off: signedOff }),
  markReworkComplete: (id: string) =>
    api.post(`/work/batch/${id}/mark-rework-complete/`),
  deactivate: (id: string) =>
    api.post(`/work/batch/${id}/deactivate/`),
  requestUpload: () =>
    api.post<
      | { type: 'direct' }
      | { type: 's3_presigned'; upload_url: string; fields: Record<string, string>; s3_key: string }
    >('/work/batch/request-upload/'),
  uploadToS3: (uploadUrl: string, fields: Record<string, string>, file: File, onUploadProgress?: (e: AxiosProgressEvent) => void) => {
    const formData = new FormData()
    Object.entries(fields).forEach(([k, v]) => formData.append(k, v))
    formData.append('file', file)
    return axios.post(uploadUrl, formData, { onUploadProgress })
  },
  confirmUpload: async (data: { name: string; client_id: string; s3_key: string }) => {
    const response = await api.post('/work/batch/confirm-upload/', data)
    return { ...response, data: mapBatch(response.data) }
  },
}

export const chunksApi = {
  myTasks: async () => {
    const data = await fetchAllPages('/work/unit/')
    return { data: data.map(mapUnit) }
  },
  myTasksPaged: async (page = 1) => {
    const response = await api.get(`/work/unit/?page=${page}`)
    const payload = response.data
    const results = (Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []).map(mapUnit)
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  myTasksByStatusPaged: async (status: string, page = 1) => {
    const response = await api.get(`/work/unit/?status=${encodeURIComponent(status)}&page=${page}`)
    const payload = response.data
    const results = (Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []).map(mapUnit)
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  myValidationTasks: async () => {
    const data = await fetchAllPages('/work/unit/')
    return {
      data: data.map(mapUnit).filter((unit: any) => unit.status === 'in_validation'),
    }
  },
  myValidationTasksPaged: async (page = 1) => {
    const response = await api.get(`/work/unit/?status=IN_VALIDATION&page=${page}`)
    const payload = response.data
    const results = (Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []).map(mapUnit)
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  byBatch: async (batchId: string) => {
    const data = await fetchAllPages(`/work/unit/?batch_id=${encodeURIComponent(batchId)}`)
    return { data: data.map(mapUnit) }
  },
  byBatchPaged: async (batchId: string, page = 1) => {
    const response = await api.get(`/work/unit/?batch_id=${encodeURIComponent(batchId)}&page=${page}`)
    const payload = response.data
    const results = (Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []).map(mapUnit)
    return {
      data: results,
      count: payload?.count ?? results.length,
      next: payload?.next ?? null,
      page,
    }
  },
  get: async (id: string) => {
    const response = await api.get(`/work/unit/${id}/`)
    return { ...response, data: mapUnit(response.data) }
  },
  upload: (id: string, formData: FormData) =>
    api.post(`/work/unit/${id}/submit-production/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  validate: (id: string, data: { result: 'approved' | 'rejected'; rejection_reason?: string; report_file?: File }) => {
    const formData = new FormData()
    formData.append('decision', data.result === 'approved' ? 'APPROVE' : 'REDO')
    formData.append('reason', data.rejection_reason || '')
    if (data.report_file) {
      formData.append('report_file', data.report_file)
    }
    return api.post(`/work/unit/${id}/validate/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  acceptValidation: (id: string) => api.post(`/work/unit/${id}/accept-validation/`),
  downloadRedoReport: (id: string) => downloadUnitFile(`/work/unit/${id}/download-redo-report/`),
  reassignProduction: (id: string, data: { new_production_user_id: string; reason?: string }) =>
    api.post(`/work/unit/${id}/reassign-production/`, data),
  manualAssign: (id: string, data: { production_user_id: string; validation_user_id: string; reason?: string }) =>
    api.post(`/work/unit/${id}/manual-assign/`, data),
  downloadSource: (id: string) => downloadUnitFile(`/work/unit/${id}/download-source/`),
  downloadProduction: (id: string) => downloadUnitFile(`/work/unit/${id}/download-production/`),
  bulkClientRework: (data: {
    batch_id: string
    assignments: { unit_id: string; production_user_id: string; validation_user_id: string }[]
    reason?: string
  }) => api.post('/work/unit/bulk-client-rework/', data),
}

async function downloadUnitFile(path: string) {
  const response = await api.get(path, { responseType: 'blob' })

  let filename = 'download'
  const disposition = response.headers?.['content-disposition'] as string | undefined
  if (disposition) {
    const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
    const plainMatch = /filename="?([^";]+)"?/i.exec(disposition)
    if (utf8Match) {
      filename = decodeURIComponent(utf8Match[1])
    } else if (plainMatch) {
      filename = plainMatch[1]
    }
  }

  const blobUrl = window.URL.createObjectURL(response.data)
  const anchor = document.createElement('a')
  anchor.href = blobUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.URL.revokeObjectURL(blobUrl)
}

export const analyticsApi = {
  dashboard: async () => {
    const response = await api.get('/analytics/summary/')
    return { data: response.data }
  },
  myReport: async () => {
    const response = await api.get('/analytics/me/')
    return { data: response.data }
  },
  myReportPaged: async (page = 1, pageSize = 20) => {
    const response = await api.get(`/analytics/me/?page=${page}&page_size=${pageSize}`)
    return { data: response.data }
  },
  usersReport: async () => {
    const response = await api.get('/analytics/users/')
    return { data: response.data }
  },
  userReport: async (userId: string) => {
    const response = await api.get(`/analytics/users/${userId}/`)
    return { data: response.data }
  },
}

export const chatApi = {
  threadsPaged: async (page = 1) => {
    const response = await api.get(`/chat/thread/?page=${page}`)
    const payload = response.data
    const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []
    return { data: results, count: payload?.count ?? results.length, next: payload?.next ?? null }
  },
  createThread: async (recipientId: string) => {
    const response = await api.post('/chat/thread/', { recipient_id: recipientId })
    return { data: response.data }
  },
  messagesPaged: async (threadId: string, page = 1) => {
    const response = await api.get(`/chat/thread/${threadId}/messages/?page=${page}`)
    const payload = response.data
    const results = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : []
    return { data: results, count: payload?.count ?? results.length, next: payload?.next ?? null }
  },
  sendMessage: async (threadId: string, body: string) => {
    const response = await api.post(`/chat/thread/${threadId}/messages/`, { body })
    return { data: response.data }
  },
  eligibleUsers: async () => {
    const response = await api.get('/chat/thread/eligible-users/')
    return { data: extractListData(response.data) }
  },
  unreadCount: async () => {
    const response = await api.get('/chat/thread/unread-count/')
    return { data: response.data }
  },
}

export const notifApi = {
  list: async (_unreadOnly?: boolean) => ({ data: [] as any[] }),
}

export default api
