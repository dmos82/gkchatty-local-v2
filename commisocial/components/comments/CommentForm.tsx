'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface CommentFormProps {
  postId: string
  parentId?: string | null
  onSuccess?: () => void
  onCancel?: () => void
  placeholder?: string
  autoFocus?: boolean
}

export function CommentForm({
  postId,
  parentId = null,
  onSuccess,
  onCancel,
  placeholder = 'Write a comment...',
  autoFocus = false
}: CommentFormProps) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (content.trim().length < 1) {
      setError('Comment cannot be empty')
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      // Create comment
      const { error: commentError } = await supabase
        .from('comments')
        .insert({
          post_id: postId,
          parent_id: parentId,
          author_id: user.id,
          content: content.trim(),
          vote_count: 0,
        })

      if (commentError) {
        setError('Failed to post comment')
        return
      }

      // Update post comment count
      const { data: post } = await supabase
        .from('posts')
        .select('comment_count')
        .eq('id', postId)
        .single()

      if (post) {
        await supabase
          .from('posts')
          .update({ comment_count: (post.comment_count || 0) + 1 })
          .eq('id', postId)
      }

      // Reset form
      setContent('')
      onSuccess?.()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && (
        <div className="p-2 text-xs text-red-500 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}

      <Textarea
        placeholder={placeholder}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={loading}
        autoFocus={autoFocus}
        rows={3}
        className="resize-none"
      />

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={loading || content.trim().length === 0}>
          {loading ? 'Posting...' : parentId ? 'Reply' : 'Comment'}
        </Button>
      </div>
    </form>
  )
}
