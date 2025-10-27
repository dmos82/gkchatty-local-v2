'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function CreatePostForm() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validation
    if (title.trim().length < 3) {
      setError('Title must be at least 3 characters')
      setLoading(false)
      return
    }

    if (content.trim().length < 10) {
      setError('Content must be at least 10 characters')
      setLoading(false)
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Create post
      const { data: post, error: postError } = await supabase
        .from('posts')
        .insert({
          title: title.trim(),
          content: content.trim(),
          author_id: user.id,
          vote_count: 0,
          comment_count: 0,
        })
        .select()
        .single()

      if (postError) {
        setError('Failed to create post: ' + postError.message)
        return
      }

      // Redirect to feed
      router.push('/feed')
      router.refresh()
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create a Post</CardTitle>
        <CardDescription>Share your thoughts, work, or questions with the community</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              type="text"
              placeholder="Give your post a title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={loading}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">
              {title.length}/300 characters
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Write your post content here. Markdown is supported!"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              disabled={loading}
              rows={12}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              {content.length} characters • Markdown supported
            </p>
          </div>

          <div className="p-3 bg-muted rounded-md text-sm">
            <p className="font-medium mb-1">Markdown Tips:</p>
            <ul className="text-xs text-muted-foreground space-y-0.5">
              <li>**bold** for <strong>bold</strong></li>
              <li>*italic* for <em>italic</em></li>
              <li>[text](url) for links</li>
              <li>Add YouTube, Spotify, or SoundCloud links for automatic embedding</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? 'Posting...' : 'Post'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
