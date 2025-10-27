'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const validateUsername = (username: string): boolean => {
    // Username must be 3-20 characters, alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    return usernameRegex.test(username)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate username
    if (!validateUsername(username)) {
      setError('Username must be 3-20 characters and contain only letters, numbers, and underscores')
      setLoading(false)
      return
    }

    try {
      console.log('🔵 Starting signup for:', username)

      // Create fresh Supabase client
      console.log('🔵 Creating fresh Supabase client...')
      const supabase = createClient()
      console.log('✅ Client created')

      // SKIP username check for now - test if auth.signUp works
      console.log('🔵 SKIPPING username check, going straight to auth.signUp...')

      // Sign up user
      console.log('🔵 Creating auth user...')
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (signUpError) {
        console.error('❌ Signup error:', signUpError)
        setError(signUpError.message)
        setLoading(false)
        return
      }

      console.log('✅ Auth user created:', data.user?.id)

      if (data.user) {
        // Create profile
        console.log('🔵 Creating profile...')
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            username: username.toLowerCase(),
            display_name: username,
          })

        if (profileError) {
          console.error('❌ Profile error:', profileError)
          setError('Failed to create profile: ' + profileError.message)
          setLoading(false)
          return
        }

        console.log('✅ Profile created!')
        console.log('🔵 Redirecting to /feed...')
        router.push('/feed')
        router.refresh()
      }
    } catch (err) {
      console.error('❌ Signup error:', err)
      setError('An unexpected error occurred: ' + (err instanceof Error ? err.message : String(err)))
      setLoading(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Join CommiSocial</CardTitle>
        <CardDescription>Create your account to get started</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="coolcreator"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              3-20 characters, letters, numbers, and underscores only
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
            />
            <p className="text-xs text-muted-foreground">
              Minimum 6 characters
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Sign up'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </CardFooter>
      </form>
    </Card>
  )
}
