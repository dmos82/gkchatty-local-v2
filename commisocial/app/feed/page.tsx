import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FeedList } from '@/components/feed/FeedList'
import { PlusCircle } from 'lucide-react'

export default function FeedPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Feed</h1>
            <p className="text-muted-foreground mt-1">
              Latest posts from the community
            </p>
          </div>
          <Link href="/post/create">
            <Button size="lg">
              <PlusCircle className="w-4 h-4 mr-2" />
              Create Post
            </Button>
          </Link>
        </div>

        <Suspense fallback={<LoadingSkeleton />}>
          <FeedList />
        </Suspense>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-3/4 mb-4" />
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}
