import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { jobsApi } from '@/api/client'
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
  const [expanded, setExpanded] = useState(depth < 2) // auto-expand first 2 levels

  if (node.type === 'folder') {
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
          {node.children && (
            <span className="text-xs text-gray-400 ml-1">({node.children.length})</span>
          )}
        </div>
        {expanded && node.children && (
          <div>
            {node.children.map((child) => (
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

  // File node
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
  const { data, isLoading } = useQuery({
    queryKey: ['job-file-tree', jobId],
    queryFn: () => jobsApi.fileTree(jobId),
  })

  if (isLoading) return <PageLoader />

  const tree: TreeNode[] = data?.data || []

  if (tree.length === 0) {
    return (
      <div className="text-center py-8">
        <Folder className="w-10 h-10 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">No files extracted yet</p>
      </div>
    )
  }

  return (
    <div className="font-mono text-sm">
      {tree.map((node) => (
        <TreeNodeRow key={node.full_path} node={node} depth={0} onFileClick={onFileClick} />
      ))}
    </div>
  )
}
