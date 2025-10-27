import { CreatePostForm } from '@/components/post/CreatePostForm'

export default function CreatePostPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <CreatePostForm />
      </div>
    </div>
  )
}
