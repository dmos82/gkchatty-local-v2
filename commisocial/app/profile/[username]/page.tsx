import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ProfileHeader } from '@/components/profile/ProfileHeader'
import { UserPosts } from '@/components/profile/UserPosts'

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username.toLowerCase())
    .single()

  if (error || !profile) {
    notFound()
  }

  const isOwnProfile = user?.id === profile.id

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <ProfileHeader profile={profile} isOwnProfile={isOwnProfile} />

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Posts</h2>
          <Suspense fallback={<LoadingSkeleton />}>
            <UserPosts username={username} userId={profile.id} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <div key={i} className="border rounded-lg p-6 animate-pulse">
          <div className="h-6 bg-muted rounded w-3/4 mb-4" />
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="h-4 bg-muted rounded w-5/6" />
        </div>
      ))}
    </div>
  )
}
