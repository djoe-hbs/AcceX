import api, { fetchAllPages } from '@/api/client'

export type InvoiceTrigger = 'MANUAL' | 'AUTO' | string
export type InvoiceStatus = 'GENERATED' | 'SENT' | string

export type InvoiceItem = {
  id: string
  batch_id: string | null
  batch_name: string | null
  work_file_id: string | null
  work_file_path: string | null
  description: string
  quantity: string
  unit_cost: string
  amount: string
  created: string
  updated: string
}

export type Invoice = {
  id: string
  client_id: string
  client_name: string
  year: number
  month: number
  period_start: string | null
  period_end: string | null
  trigger: InvoiceTrigger
  status: InvoiceStatus
  total_amount: string
  generated_by: string | null
  sent_at: string | null
  items: InvoiceItem[]
  created: string
  updated: string
}

export type InvoiceListParams = {
  clientId?: string
  year?: number
  month?: number
}

export type GenerateInvoicePayload = {
  client_id: string
  year: number
  month: number
  send_email?: boolean
}

export type GenerateMonthlyInvoicesPayload = {
  year?: number
  month?: number
  send_email?: boolean
}

export type SendInvoiceEmailPayload = {
  recipients?: string[]
}

export type MonthlyInvoiceResult = {
  count: number
  results: Invoice[]
}

function mapInvoiceItem(item: any): InvoiceItem {
  return {
    id: item.id,
    batch_id: item.batch_id ?? null,
    batch_name: item.batch_name ?? null,
    work_file_id: item.work_file_id ?? null,
    work_file_path: item.work_file_path ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    amount: item.amount,
    created: item.created,
    updated: item.updated,
  }
}

function mapInvoice(invoice: any): Invoice {
  return {
    id: invoice.id,
    client_id: invoice.client_id,
    client_name: invoice.client_name,
    year: invoice.year,
    month: invoice.month,
    period_start: invoice.period_start ?? null,
    period_end: invoice.period_end ?? null,
    trigger: invoice.trigger,
    status: invoice.status,
    total_amount: invoice.total_amount,
    generated_by: invoice.generated_by ?? null,
    sent_at: invoice.sent_at ?? null,
    items: Array.isArray(invoice.items) ? invoice.items.map(mapInvoiceItem) : [],
    created: invoice.created,
    updated: invoice.updated,
  }
}

function buildQuery(params?: InvoiceListParams) {
  const query = new URLSearchParams()

  if (params?.clientId) query.set('client_id', params.clientId)
  if (params?.year) query.set('year', String(params.year))
  if (params?.month) query.set('month', String(params.month))

  const suffix = query.toString()
  return suffix ? `?${suffix}` : ''
}

export const invoiceApi = {
  list: async (params?: InvoiceListParams) => {
    const data = await fetchAllPages(`/work/invoice/${buildQuery(params)}`)
    return { data: data.map(mapInvoice) as Invoice[] }
  },
  get: async (id: string) => {
    const response = await api.get(`/work/invoice/${id}/`)
    return { ...response, data: mapInvoice(response.data) as Invoice }
  },
  generate: async (payload: GenerateInvoicePayload) => {
    const response = await api.post('/work/invoice/generate/', {
      ...payload,
      send_email: payload.send_email ?? true,
    })
    return { ...response, data: mapInvoice(response.data) as Invoice }
  },
  generateMonthly: async (payload: GenerateMonthlyInvoicesPayload = {}) => {
    const response = await api.post('/work/invoice/generate-monthly/', {
      ...payload,
      send_email: payload.send_email ?? true,
    })
    return {
      ...response,
      data: {
        count: response.data?.count ?? 0,
        results: Array.isArray(response.data?.results) ? response.data.results.map(mapInvoice) : [],
      } as MonthlyInvoiceResult,
    }
  },
  sendEmail: async (id: string, payload: SendInvoiceEmailPayload = {}) => {
    const response = await api.post(`/work/invoice/${id}/send-email/`, payload)
    return { ...response, data: { detail: response.data?.detail ?? 'Invoice email sent.' } }
  },
}

