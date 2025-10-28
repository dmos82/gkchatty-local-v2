import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({
            name,
            value,
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name: string, options: any) {
          request.cookies.set({
            name,
            value: '',
            ...options,
          })
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  // If accessing /admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Debug logging
    console.log('🔍 Middleware /admin check:', {
      path: request.nextUrl.pathname,
      hasUser: !!user,
      userId: user?.id,
      authError: authError?.message,
      cookies: request.cookies.getAll().map(c => c.name)
    })

    // Not authenticated → redirect to login
    if (!user || authError) {
      console.log('❌ No user or auth error, redirecting to login')
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirectTo', request.nextUrl.pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Get user profile with role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, deleted_at')
      .eq('id', user.id)
      .single()

    // Profile not found or deleted → redirect to home
    if (profileError || !profile || profile.deleted_at) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Not admin or super_admin → 403 Forbidden
    if (!['admin', 'super_admin'].includes(profile.role)) {
      return NextResponse.redirect(new URL('/403', request.url))
    }

    // Admin authenticated and authorized → allow
    return response
  }

  // Non-admin routes → allow
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
