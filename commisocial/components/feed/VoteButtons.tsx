'use client'

import { useState } from 'react'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface VoteButtonsProps {
  postId: string
  initialVoteCount: number
  userVote?: number | null
}

export function VoteButtons({ postId, initialVoteCount, userVote: initialUserVote }: VoteButtonsProps) {
  const [voteCount, setVoteCount] = useState(initialVoteCount)
  const [userVote, setUserVote] = useState<number | null>(initialUserVote ?? null)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleVote = async (value: number) => {
    if (loading) return

    setLoading(true)

    // Store old values for rollback
    const oldVote = userVote
    const oldCount = voteCount

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // Redirect to login if not authenticated
        window.location.href = '/login'
        return
      }

      if (userVote === value) {
        // Remove vote
        setUserVote(null)
        setVoteCount(voteCount - value)

        await supabase
          .from('votes')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
      } else {
        // Add or change vote
        const newVote = value
        const countDelta = userVote === null ? value : value - userVote

        setUserVote(newVote)
        setVoteCount(voteCount + countDelta)

        const { error: upsertError } = await supabase
          .from('votes')
          .upsert({
            user_id: user.id,
            post_id: postId,
            value: newVote,
          }, {
            onConflict: 'user_id,post_id'
          })

        if (upsertError) throw upsertError
      }

      // Database triggers will automatically update post vote_count
      // No manual update needed

    } catch (error) {
      console.error('Error voting:', error)
      // Revert optimistic update on error
      setUserVote(oldVote)
      setVoteCount(oldCount)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={() => handleVote(1)}
        disabled={loading}
        className={cn(
          'p-1 rounded hover:bg-accent transition-colors',
          userVote === 1 && 'text-orange-500',
          loading && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Upvote"
      >
        <ArrowUp className="w-5 h-5" />
      </button>

      <span className={cn(
        'text-sm font-medium min-w-[2rem] text-center',
        userVote === 1 && 'text-orange-500',
        userVote === -1 && 'text-blue-500'
      )}>
        {voteCount}
      </span>

      <button
        onClick={() => handleVote(-1)}
        disabled={loading}
        className={cn(
          'p-1 rounded hover:bg-accent transition-colors',
          userVote === -1 && 'text-blue-500',
          loading && 'opacity-50 cursor-not-allowed'
        )}
        aria-label="Downvote"
      >
        <ArrowDown className="w-5 h-5" />
      </button>
    </div>
  )
}
