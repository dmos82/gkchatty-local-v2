import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { VoteButtons } from './VoteButtons'

interface Post {
  id: string
  title: string
  content: string
  vote_count: number
  comment_count: number
  created_at: string
  author: {
    username: string
    display_name: string | null
  }
  user_vote?: number | null
}

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  const timeAgo = getTimeAgo(new Date(post.created_at))

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="flex gap-4">
        <div className="pl-4 pt-4">
          <VoteButtons
            postId={post.id}
            initialVoteCount={post.vote_count}
            userVote={post.user_vote}
          />
        </div>

        <div className="flex-1 pr-4">
          <CardHeader className="pb-3">
            <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
              <Link
                href={`/profile/${post.author.username}`}
                className="font-medium hover:underline"
              >
                {post.author.display_name || post.author.username}
              </Link>
              <span>•</span>
              <span>{timeAgo}</span>
            </div>
          </CardHeader>

          <CardContent className="pb-3">
            <Link href={`/post/${post.id}`}>
              <h3 className="text-lg font-semibold mb-2 hover:text-primary cursor-pointer">
                {post.title}
              </h3>
              <p className="text-muted-foreground line-clamp-3">
                {post.content}
              </p>
            </Link>
          </CardContent>

          <CardFooter className="pt-0">
            <Link
              href={`/post/${post.id}#comments`}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{post.comment_count} {post.comment_count === 1 ? 'comment' : 'comments'}</span>
            </Link>
          </CardFooter>
        </div>
      </div>
    </Card>
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
