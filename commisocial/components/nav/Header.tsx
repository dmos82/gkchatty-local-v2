import Link from 'next/link'
import { PlusCircle, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { UserMenu } from './UserMenu'

export async function Header() {
  // TEMPORARY: Disable auth check to test if this is causing lockup
  const user = null
  const profile = null

  // const supabase = await createClient()
  // const { data: { user } } = await supabase.auth.getUser()
  //
  // let profile = null
  // if (user) {
  //   const { data } = await supabase
  //     .from('profiles')
  //     .select('username, display_name')
  //     .eq('id', user.id)
  //     .single()
  //   profile = data
  // }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold whitespace-nowrap">
            CommiSocial
          </Link>

          {user && (
            <nav className="flex items-center gap-2">
              <Link href="/feed">
                <Button variant="ghost" size="sm">
                  Feed
                </Button>
              </Link>
              <Link href="/search">
                <Button variant="ghost" size="sm">
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </Button>
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user && profile ? (
            <>
              <Link href="/post/create">
                <Button size="sm">
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Create
                </Button>
              </Link>
              <UserMenu user={profile} />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">
                  Login
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm">
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
