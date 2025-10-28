import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { VoteButtons } from '@/components/feed/VoteButtons'
import { CommentList } from '@/components/comments/CommentList'

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch post with author
  const { data: post, error } = await supabase
    .from('posts')
    .select(`
      id,
      title,
      content,
      vote_count,
      comment_count,
      created_at,
      author:profiles!author_id (
        username,
        display_name
      )
    `)
    .eq('id', id)
    .single()

  if (error || !post) {
    notFound()
  }

  // Fetch user's vote if authenticated
  let userVote = null
  if (user) {
    const { data: vote } = await supabase
      .from('votes')
      .select('value')
      .eq('user_id', user.id)
      .eq('post_id', id)
      .single()

    userVote = vote?.value ?? null
  }

  const timeAgo = getTimeAgo(new Date(post.created_at))

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/feed">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Button>
        </Link>

        <div className="bg-card rounded-lg border shadow-sm p-6">
          <div className="flex gap-6">
            <div className="flex-shrink-0">
              <VoteButtons
                postId={post.id}
                initialVoteCount={post.vote_count}
                userVote={userVote}
              />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 text-sm text-muted-foreground mb-3">
                <Link
                  href={`/profile/${(post.author as any).username}`}
                  className="font-medium hover:underline"
                >
                  {(post.author as any).display_name || (post.author as any).username}
                </Link>
                <span>•</span>
                <span>{timeAgo}</span>
              </div>

              <h1 className="text-2xl font-bold mb-4">{post.title}</h1>

              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-foreground">{post.content}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <CommentList postId={post.id} />
        </div>
      </div>
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
