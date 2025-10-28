'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CommentThread, Comment } from './CommentThread'
import { CommentForm } from './CommentForm'

interface CommentListProps {
  postId: string
}

export function CommentList({ postId }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          content,
          vote_count,
          created_at,
          parent_id,
          author:profiles!author_id (
            username,
            display_name
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching comments:', error)
        return
      }

      if (data) {
        // Organize comments into threaded structure
        const commentMap = new Map<string, Comment>()
        const rootComments: Comment[] = []

        // First pass: create all comment objects
        data.forEach((comment: any) => {
          commentMap.set(comment.id, {
            ...comment,
            replies: [],
          })
        })

        // Second pass: build the tree structure
        data.forEach((comment: any) => {
          const commentObj = commentMap.get(comment.id)!

          if (comment.parent_id) {
            const parent = commentMap.get(comment.parent_id)
            if (parent) {
              parent.replies!.push(commentObj)
            }
          } else {
            rootComments.push(commentObj)
          }
        })

        setComments(rootComments)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchComments()
  }, [postId])

  const handleCommentSuccess = () => {
    fetchComments() // Refresh comments after new comment
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-16 bg-muted rounded" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-32" />
                <div className="h-12 bg-muted rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" id="comments">
      <div>
        <h3 className="text-lg font-semibold mb-4">
          {comments.length === 0 ? 'Be the first to comment' : 'Comments'}
        </h3>
        <CommentForm postId={postId} onSuccess={handleCommentSuccess} />
      </div>

      {comments.length > 0 && (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              postId={postId}
              onReply={handleCommentSuccess}
            />
          ))}
        </div>
      )}
    </div>
  )
}
