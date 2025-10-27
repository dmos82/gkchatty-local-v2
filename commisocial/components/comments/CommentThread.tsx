'use client'

import { useState } from 'react'
import { MessageCircle, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommentForm } from './CommentForm'
import { cn } from '@/lib/utils'

export interface Comment {
  id: string
  content: string
  vote_count: number
  created_at: string
  author: {
    username: string
    display_name: string | null
  }
  replies?: Comment[]
}

interface CommentThreadProps {
  comment: Comment
  postId: string
  depth?: number
  onReply?: () => void
}

export function CommentThread({ comment, postId, depth = 0, onReply }: CommentThreadProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [showReplies, setShowReplies] = useState(true)
  const timeAgo = getTimeAgo(new Date(comment.created_at))
  const hasReplies = comment.replies && comment.replies.length > 0
  const maxDepth = 5

  const handleReplySuccess = () => {
    setShowReplyForm(false)
    onReply?.()
  }

  return (
    <div className={cn('space-y-2', depth > 0 && 'ml-6 mt-4 border-l-2 border-muted pl-4')}>
      <div className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1">
            <button className="p-0.5 rounded hover:bg-accent transition-colors">
              <ArrowUp className="w-4 h-4 text-muted-foreground hover:text-orange-500" />
            </button>
            <span className="text-xs font-medium text-muted-foreground">
              {comment.vote_count}
            </span>
            <button className="p-0.5 rounded hover:bg-accent transition-colors">
              <ArrowDown className="w-4 h-4 text-muted-foreground hover:text-blue-500" />
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 text-xs text-muted-foreground mb-1">
              <span className="font-medium text-foreground">
                {comment.author.display_name || comment.author.username}
              </span>
              <span>•</span>
              <span>{timeAgo}</span>
            </div>

            <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>

            <div className="flex items-center gap-3 mt-2">
              {depth < maxDepth && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto py-1 px-2 text-xs"
                  onClick={() => setShowReplyForm(!showReplyForm)}
                >
                  <MessageCircle className="w-3 h-3 mr-1" />
                  Reply
                </Button>
              )}

              {hasReplies && (
                <button
                  onClick={() => setShowReplies(!showReplies)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showReplies ? 'Hide' : 'Show'} {comment.replies!.length}{' '}
                  {comment.replies!.length === 1 ? 'reply' : 'replies'}
                </button>
              )}
            </div>

            {showReplyForm && (
              <div className="mt-3">
                <CommentForm
                  postId={postId}
                  parentId={comment.id}
                  onSuccess={handleReplySuccess}
                  onCancel={() => setShowReplyForm(false)}
                  placeholder="Write a reply..."
                  autoFocus
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showReplies && hasReplies && (
        <div className="space-y-2">
          {comment.replies!.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              postId={postId}
              depth={depth + 1}
              onReply={onReply}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)}mo ago`
  return `${Math.floor(seconds / 31536000)}y ago`
}
