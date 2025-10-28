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

  // HYPOTHESIS: Create client once using useMemo
  const supabase = useMemo(() => createClient(), [])

  const validateUsername = (username: string): boolean => {
    // Username must be 3-20 characters, alphanumeric and underscores only
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    return usernameRegex.test(username)
  }

  // React 18 pattern: Simple async event handler
  const handleSignup = async () => {
    setError(null)
    setLoading(true)

    // Validate username
    if (!validateUsername(username)) {
      setError('Username must be 3-20 characters and contain only letters, numbers, and underscores')
      setLoading(false)
      return
    }
      try {
        console.log('🔵 Starting signup for:', username)
        console.log('🔵 Using component-level Supabase client')

        // Check if username exists
        console.log('🔵 Checking if username exists...')
        const { data: existingProfiles, error: checkError } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', username.toLowerCase())

        console.log('🔵 Username check result:', existingProfiles)

        if (checkError) {
          console.error('❌ Username check error:', checkError)
          setError('Error checking username: ' + checkError.message)
          return
        }

        if (existingProfiles && existingProfiles.length > 0) {
          setError('Username is already taken')
          return
        }

        // Sign up user
        console.log('🔵 Creating auth user...')
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })

        if (signUpError) {
          console.error('❌ Signup error:', signUpError)
          setError(signUpError.message)
          return
        }

        console.log('✅ Auth user created:', data.user?.id)
        console.log('🔵 Session:', data.session ? 'exists' : 'null')

        if (data.user && data.session) {
          // Create profile (session is established, auth.uid() will work)
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
            return
          }

          console.log('✅ Profile created!')
          console.log('🔵 Redirecting to /feed...')
          router.push('/feed')
          router.refresh()
        } else if (data.user && !data.session) {
          // User created but no session (email confirmation required)
          console.log('⚠️ Email confirmation required')
          setError('Please check your email to confirm your account before signing in.')
        }
      } catch (err) {
        console.error('❌ Signup error:', err)
        setError('An unexpected error occurred: ' + (err instanceof Error ? err.message : String(err)))
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
      <div>
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
          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={handleSignup}
          >
            {loading ? 'Creating account...' : 'Sign up'}
          </Button>
          <p className="text-sm text-center text-muted-foreground">
            Already have an account?{' '}
            <a href="/login" className="text-primary hover:underline">
              Sign in
            </a>
          </p>
        </CardFooter>
      </div>
    </Card>
  )
}
