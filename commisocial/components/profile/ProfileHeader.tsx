import { User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface ProfileHeaderProps {
  profile: {
    username: string
    display_name: string | null
    bio: string | null
    avatar_url: string | null
    created_at: string
  }
  isOwnProfile: boolean
}

export function ProfileHeader({ profile, isOwnProfile }: ProfileHeaderProps) {
  const joinDate = new Date(profile.created_at).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  return (
    <Card className="p-6">
      <div className="flex items-start gap-6">
        <div className="flex-shrink-0">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-24 h-24 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
              <User className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {profile.display_name || profile.username}
              </h1>
              <p className="text-muted-foreground">@{profile.username}</p>
            </div>

            {isOwnProfile && (
              <Button variant="outline" size="sm">
                Edit Profile
              </Button>
            )}
          </div>

          {profile.bio && (
            <p className="mt-4 text-foreground">{profile.bio}</p>
          )}

          <p className="mt-4 text-sm text-muted-foreground">
            Joined {joinDate}
          </p>
        </div>
      </div>
    </Card>
  )
}
