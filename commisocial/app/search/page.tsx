import Link from 'next/link'
import { User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SearchBar } from '@/components/search/SearchBar'
import { PostCard } from '@/components/feed/PostCard'
import { Card } from '@/components/ui/card'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q: query } = await searchParams
  const supabase = await createClient()

  if (!query || query.trim() === '') {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">Search</h1>
          <SearchBar />
          <p className="mt-8 text-muted-foreground text-center">
            Enter a search term to find posts and users
          </p>
        </div>
      </div>
    )
  }

  const searchTerm = `%${query.trim()}%`

  // Search posts
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
    .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
    .order('created_at', { ascending: false })
    .limit(20)

  // Search users
  const { data: users } = await supabase
    .from('profiles')
    .select('username, display_name, bio')
    .or(`username.ilike.${searchTerm},display_name.ilike.${searchTerm}`)
    .limit(10)

  const hasResults = (posts && posts.length > 0) || (users && users.length > 0)

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Search Results</h1>
        <SearchBar />

        <div className="mt-8">
          {!hasResults && (
            <div className="text-center py-12 text-muted-foreground">
              No results found for "{query}"
            </div>
          )}

          {users && users.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Users</h2>
              <div className="grid gap-3">
                {users.map((user) => (
                  <Link key={user.username} href={`/profile/${user.username}`}>
                    <Card className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {user.display_name || user.username}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            @{user.username}
                          </p>
                          {user.bio && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                              {user.bio}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {posts && posts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Posts</h2>
              <div className="space-y-4">
                {posts.map((post) => (
                  <PostCard key={post.id} post={{ ...post, user_vote: null } as any} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
