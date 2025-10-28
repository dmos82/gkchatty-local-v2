import { createClient } from '@/lib/supabase/server'
import { PostCard } from './PostCard'

export async function FeedList() {
  const supabase = await createClient()

  // Get current user to check their votes
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch posts with author information
  const { data: posts, error } = await supabase
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
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error fetching posts:', error)
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Error loading posts</p>
      </div>
    )
  }

  if (!posts || posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No posts yet. Be the first to create one!</p>
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

  // Transform posts to include user votes
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
