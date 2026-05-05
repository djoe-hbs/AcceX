import { useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { jobsApi, buildFileTree } from '@/api/client'
import { FileTypeIcon, PageLoader } from '@/components/shared'
import { ChevronRight, ChevronDown, Folder, FolderOpen } from 'lucide-react'
import { clsx } from 'clsx'

interface TreeNode {
  name: string
  full_path: string
  type: 'file' | 'folder'
  file_id?: number
  file_type?: string
  size_bytes?: number
  page_count?: number
  row_count?: number
  children?: TreeNode[]
}

function formatSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TreeNodeRow({
  node,
  depth = 0,
  onFileClick,
}: {
  node: TreeNode
  depth?: number
  onFileClick?: (node: TreeNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (node.type === 'folder') {
    const children = node.children || []

    return (
      <div>
        <div
          className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-gray-100 cursor-pointer select-none transition-colors"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
          {expanded
            ? <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
            : <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />}
          <span className="text-sm font-medium text-gray-800">{node.name}</span>
          {children.length > 0 && (
            <span className="text-xs text-gray-400 ml-1">({children.length})</span>
          )}
        </div>
        {expanded && children.length > 0 && (
          <div>
            {children.map((child) => (
              <TreeNodeRow
                key={child.full_path}
                node={child}
                depth={depth + 1}
                onFileClick={onFileClick}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'flex items-center gap-2 py-1.5 px-2 rounded-lg transition-colors',
        onFileClick ? 'hover:bg-blue-50 cursor-pointer' : 'hover:bg-gray-50'
      )}
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
      onClick={() => onFileClick?.(node)}
    >
      <div className="w-3.5 flex-shrink-0" />
      <FileTypeIcon type={node.file_type || 'other'} className="w-4 h-4 flex-shrink-0" />
      <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{node.name}</span>
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        {(node.page_count || node.row_count) && (
          <span className="text-xs text-gray-400">
            {node.page_count ? `${node.page_count}p` : `${node.row_count}r`}
          </span>
        )}
        {node.size_bytes && (
          <span className="text-xs text-gray-400">{formatSize(node.size_bytes)}</span>
        )}
      </div>
    </div>
  )
}

export function FileTreeViewer({
  jobId,
  onFileClick,
}: {
  jobId: string
  onFileClick?: (node: TreeNode) => void
}) {
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['job-files-paged', jobId],
    queryFn: ({ pageParam }) => jobsApi.filesPaged(jobId, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any) => lastPage.next ? lastPage.page + 1 : undefined,
  })

  if (isLoading) return <PageLoader />

  const allFiles = data?.pages.flatMap((p: any) => p.data) ?? []
  const totalCount = data?.pages[0]?.count ?? 0
  const loadedCount = allFiles.length
  const tree: TreeNode[] = buildFileTree(allFiles)

  if (tree.length === 0) {
    return (
      <div className="text-center py-8">
        <Folder className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No files extracted yet</p>
      </div>
    )
  }

  return (
    <div className="font-mono text-sm space-y-0.5">
      {tree.map((node) => (
        <TreeNodeRow key={node.full_path} node={node} depth={0} onFileClick={onFileClick} />
      ))}
      {hasNextPage && (
        <button
          className="mt-2 w-full text-sm text-blue-600 hover:text-blue-800 font-medium py-2 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage
            ? 'Loading...'
            : `Load More (${loadedCount} of ${totalCount} files)`}
        </button>
      )}
    </div>
  )
}
