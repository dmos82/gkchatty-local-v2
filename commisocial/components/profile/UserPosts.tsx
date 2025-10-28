import { createClient } from '@/lib/supabase/server'
import { PostCard } from '@/components/feed/PostCard'

interface UserPostsProps {
  username: string
  userId: string
}

export async function UserPosts({ username, userId }: UserPostsProps) {
  const supabase = await createClient()

  // Get current user for vote data
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch user's posts
  const { data: posts } = await supabase
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
    .eq('author_id', userId)
    .order('created_at', { ascending: false })

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No posts yet
      </div>
    )
  }

  // Fetch user's votes if authenticated
  let userVotes: Record<string, number> = {}
  if (user) {
    const { data: votes } = await supabase
      .from('votes')
      .select('post_id, value')
      .eq('user_id', user.id)
      .in('post_id', posts.map(p => p.id))

    if (votes) {
      userVotes = votes.reduce((acc, vote) => {
        acc[vote.post_id] = vote.value
        return acc
      }, {} as Record<string, number>)
    }
  }

  const postsWithVotes = posts.map(post => ({
    ...post,
    user_vote: userVotes[post.id] ?? null,
  }))

  return (
    <div className="space-y-4">
      {postsWithVotes.map((post) => (
        <PostCard key={post.id} post={post as any} />
      ))}
    </div>
  )
}
