import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gradient-to-br from-background to-muted">
      <div className="max-w-3xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">CommiSocial</h1>
          <p className="text-2xl text-muted-foreground">
            Where creators build communities
          </p>
        </div>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Join music producers, visual artists, and writers in vibrant communities.
          Share your work, get feedback, and grow your audience.
        </p>

        <div className="flex gap-4 justify-center pt-4">
          <Link href="/signup">
            <Button size="lg" className="text-lg px-8">
              Get Started
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="text-lg px-8">
              Sign In
            </Button>
          </Link>
        </div>

        <div className="pt-12 grid grid-cols-3 gap-8 text-left">
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Communities</h3>
            <p className="text-sm text-muted-foreground">
              Join hubs for music, visual arts, writing, and more
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Share Your Work</h3>
            <p className="text-sm text-muted-foreground">
              Post your creations with smart embedding for YouTube, Spotify, SoundCloud
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-lg">Build Your Profile</h3>
            <p className="text-sm text-muted-foreground">
              Showcase your best work and connect with your audience
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}