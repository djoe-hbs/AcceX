import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { chatApi } from '@/api/client'
import { Send, Plus, ArrowLeft, MessageCircle, Search } from 'lucide-react'
import { clsx } from 'clsx'

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

function roleBadgeColor(role: string) {
  switch (role) {
    case 'SME': return 'bg-purple-100 text-purple-700'
    case 'PRODUCTION_USER': return 'bg-blue-100 text-blue-700'
    case 'VALIDATION_USER': return 'bg-green-100 text-green-700'
    default: return 'bg-gray-100 text-gray-700'
  }
}

function roleLabel(role: string) {
  switch (role) {
    case 'SME': return 'SME'
    case 'PRODUCTION_USER': return 'Production'
    case 'VALIDATION_USER': return 'Validation'
    default: return role
  }
}

export default function ChatPage() {
  const queryClient = useQueryClient()
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [showNewChat, setShowNewChat] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileShowMessages, setMobileShowMessages] = useState(false)

  // ── Thread list pagination ──
  const [threads, setThreads] = useState<any[]>([])
  const threadLoadedPageRef = useRef(1)
  const [threadsHasMore, setThreadsHasMore] = useState(false)
  const [threadsTotalCount, setThreadsTotalCount] = useState(0)
  const [threadsLoadingMore, setThreadsLoadingMore] = useState(false)

  useQuery({
    queryKey: ['chat-threads', 'page-1'],
    queryFn: async () => {
      const pagesToLoad = threadLoadedPageRef.current
      const all: any[] = []
      let lastRes: any = null
      for (let p = 1; p <= pagesToLoad; p++) {
        const res = await chatApi.threadsPaged(p)
        all.push(...res.data)
        lastRes = res
        if (!res.next) break
      }
      setThreads(all)
      setThreadsHasMore(Boolean(lastRes?.next))
      setThreadsTotalCount(lastRes?.count ?? 0)
      return lastRes
    },
    refetchInterval: 5000,
  })

  const loadMoreThreads = useCallback(async () => {
    if (threadsLoadingMore) return
    setThreadsLoadingMore(true)
    try {
      const nextPage = threadLoadedPageRef.current + 1
      const res = await chatApi.threadsPaged(nextPage)
      setThreads((prev) => [...prev, ...res.data])
      setThreadsHasMore(Boolean(res.next))
      threadLoadedPageRef.current = nextPage
    } finally {
      setThreadsLoadingMore(false)
    }
  }, [threadsLoadingMore])

  const activeThread = threads.find((t: any) => t.id === activeThreadId)

  function handleSelectThread(threadId: string) {
    setActiveThreadId(threadId)
    setShowNewChat(false)
    setMobileShowMessages(true)
  }

  function handleBackToList() {
    setMobileShowMessages(false)
  }

  function handleThreadCreated(thread: any) {
    setActiveThreadId(thread.id)
    setShowNewChat(false)
    setMobileShowMessages(true)
    queryClient.invalidateQueries({ queryKey: ['chat-threads', 'page-1'] })
  }

  const filteredThreads = threads.filter((t: any) =>
    t.other_user?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="h-[calc(100vh-8rem)] flex bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Thread list sidebar */}
      <div className={clsx(
        'w-full md:w-80 flex-shrink-0 border-r border-gray-200 flex flex-col',
        mobileShowMessages && 'hidden md:flex'
      )}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">
              Chat
              {threadsTotalCount > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-400">({threadsTotalCount})</span>
              )}
            </h2>
            <button
              onClick={() => setShowNewChat(true)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-blue-600"
              title="New chat"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredThreads.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-500">
              {searchTerm ? 'No matches found' : 'No conversations yet'}
            </div>
          )}
          {filteredThreads.map((thread: any) => (
            <button
              key={thread.id}
              onClick={() => handleSelectThread(thread.id)}
              className={clsx(
                'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50',
                activeThreadId === thread.id && 'bg-blue-50 hover:bg-blue-50'
              )}
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-semibold">
                  {thread.other_user?.name?.slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {thread.other_user?.name}
                  </p>
                  {thread.last_message && (
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                      {formatTime(thread.last_message.created)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-gray-500 truncate">
                    {thread.last_message
                      ? `${thread.last_message.is_mine ? 'You: ' : ''}${thread.last_message.body}`
                      : 'No messages yet'}
                  </p>
                  {thread.unread_count > 0 && (
                    <span className="ml-2 flex-shrink-0 w-5 h-5 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center">
                      {thread.unread_count > 9 ? '9+' : thread.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}

          {/* Load more threads */}
          {threadsHasMore && !searchTerm && (
            <div className="p-3 text-center">
              <button
                className="text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                onClick={loadMoreThreads}
                disabled={threadsLoadingMore}
              >
                {threadsLoadingMore ? 'Loading...' : `Load more (${threads.length} of ${threadsTotalCount})`}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Message panel */}
      <div className={clsx(
        'flex-1 flex flex-col',
        !mobileShowMessages && 'hidden md:flex'
      )}>
        {showNewChat ? (
          <NewChatPanel
            onBack={() => setShowNewChat(false)}
            onThreadCreated={handleThreadCreated}
          />
        ) : activeThread ? (
          <MessagePanel
            thread={activeThread}
            onBack={handleBackToList}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Select a conversation to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NewChatPanel({
  onBack,
  onThreadCreated,
}: {
  onBack: () => void
  onThreadCreated: (thread: any) => void
}) {
  const [search, setSearch] = useState('')

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['chat-eligible-users'],
    queryFn: async () => (await chatApi.eligibleUsers()).data,
  })

  const createMutation = useMutation({
    mutationFn: (recipientId: string) => chatApi.createThread(recipientId),
    onSuccess: (res) => onThreadCreated(res.data),
  })

  const filtered = users.filter((u: any) =>
    u.name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
        <button onClick={onBack} className="p-1 rounded hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-sm font-semibold text-gray-900">New Conversation</h3>
      </div>
      <div className="px-4 py-3 border-b border-gray-100">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-gray-500">Loading...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="p-4 text-sm text-gray-500">No users found</p>
        )}
        {filtered.map((u: any) => (
          <button
            key={u.id}
            onClick={() => createMutation.mutate(u.id)}
            disabled={createMutation.isPending}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left border-b border-gray-50"
          >
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">
                {u.name?.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{u.name}</p>
              <span className={clsx('text-xs px-1.5 py-0.5 rounded', roleBadgeColor(u.role))}>
                {roleLabel(u.role)}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function MessagePanel({
  thread,
  onBack,
}: {
  thread: any
  onBack: () => void
}) {
  const [body, setBody] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // ── Message pagination state ──
  // Backend returns newest-first; we reverse for display (oldest at top).
  const [messages, setMessages] = useState<any[]>([])
  const msgLoadedPageRef = useRef(1)
  const [msgsHasMore, setMsgsHasMore] = useState(false)
  const [msgsTotalCount, setMsgsTotalCount] = useState(0)
  const [msgsLoadingOlder, setMsgsLoadingOlder] = useState(false)
  // Track the newest message id we've seen so we only scroll on truly new messages
  const latestMsgIdRef = useRef<string | null>(null)

  // Page-1 query: newest 20 messages. On each poll tick, also re-fetch any
  // additional pages already loaded so the user's expanded history stays fresh.
  useQuery({
    queryKey: ['chat-messages', thread.id, 'page-1'],
    queryFn: async () => {
      const pagesToLoad = msgLoadedPageRef.current
      const all: any[] = []
      let lastRes: any = null
      for (let p = 1; p <= pagesToLoad; p++) {
        const res = await chatApi.messagesPaged(thread.id, p)
        all.push(...res.data)
        lastRes = res
        if (!res.next) break
      }
      // Backend returns newest-first per page; reverse the combined list so
      // oldest message is at the top of the chat.
      const ordered = [...all].reverse()
      setMessages(ordered)
      setMsgsHasMore(Boolean(lastRes?.next))
      setMsgsTotalCount(lastRes?.count ?? 0)
      return lastRes
    },
    refetchInterval: 3000,
  })

  // Scroll to bottom only when a new message arrives (latest id changes)
  useEffect(() => {
    if (messages.length === 0) return
    const newestId = messages[messages.length - 1]?.id
    if (newestId !== latestMsgIdRef.current) {
      latestMsgIdRef.current = newestId
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const loadOlderMessages = useCallback(async () => {
    if (msgsLoadingOlder) return
    setMsgsLoadingOlder(true)
    // Remember scroll position so loading older msgs doesn't jump the view
    const container = scrollContainerRef.current
    const prevScrollHeight = container?.scrollHeight ?? 0
    try {
      const nextPage = msgLoadedPageRef.current + 1
      const res = await chatApi.messagesPaged(thread.id, nextPage)
      // Older messages come back newest-first within the page; reverse so they
      // prepend correctly (oldest at top).
      const olderOrdered = [...res.data].reverse()
      setMessages((prev) => [...olderOrdered, ...prev])
      setMsgsHasMore(Boolean(res.next))
      msgLoadedPageRef.current = nextPage
      // Restore scroll position after prepend
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = container.scrollHeight - prevScrollHeight
        }
      })
    } finally {
      setMsgsLoadingOlder(false)
    }
  }, [thread.id, msgsLoadingOlder])

  const sendMutation = useMutation({
    mutationFn: () => chatApi.sendMessage(thread.id, body),
    onSuccess: () => {
      setBody('')
      queryClient.invalidateQueries({ queryKey: ['chat-messages', thread.id, 'page-1'] })
      queryClient.invalidateQueries({ queryKey: ['chat-threads', 'page-1'] })
    },
  })

  function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim() || sendMutation.isPending) return
    sendMutation.mutate()
  }

  const other = thread.other_user

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
        <button onClick={onBack} className="p-1 rounded hover:bg-gray-100 md:hidden">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-semibold">
            {other?.name?.slice(0, 2).toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{other?.name}</p>
          <span className={clsx('text-xs px-1.5 py-0.5 rounded', roleBadgeColor(other?.role))}>
            {roleLabel(other?.role)}
          </span>
        </div>
        {msgsTotalCount > 0 && (
          <span className="ml-auto text-xs text-gray-400">{msgsTotalCount} messages</span>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50"
      >
        {/* Load older button at the top */}
        {msgsHasMore && (
          <div className="text-center pb-2">
            <button
              className="text-xs text-blue-600 hover:text-blue-700 font-medium bg-white border border-gray-200 rounded-full px-4 py-1.5 shadow-sm disabled:opacity-50"
              onClick={loadOlderMessages}
              disabled={msgsLoadingOlder}
            >
              {msgsLoadingOlder ? 'Loading...' : `Load older messages (${messages.length} of ${msgsTotalCount})`}
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">
            No messages yet. Say hello!
          </p>
        )}

        {messages.map((msg: any) => (
          <div
            key={msg.id}
            className={clsx('flex', msg.is_mine ? 'justify-end' : 'justify-start')}
          >
            <div
              className={clsx(
                'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
                msg.is_mine
                  ? 'bg-blue-600 text-white rounded-br-md'
                  : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
              )}
            >
              <p className="whitespace-pre-wrap break-words">{msg.body}</p>
              <p className={clsx(
                'text-xs mt-1',
                msg.is_mine ? 'text-blue-200' : 'text-gray-400'
              )}>
                {formatTime(msg.created)}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 bg-white">
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
        <button
          type="submit"
          disabled={!body.trim() || sendMutation.isPending}
          className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  )
}
