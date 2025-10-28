'use client'

import { Button } from '@/components/ui/button'

export default function TestSimpleClick() {
  const handleClick = () => {
    console.log('🔵 CLICK 1 - Just a log')
    console.log('🔵 CLICK 2 - Process env:', typeof process)
    console.log('🔵 CLICK 3 - Env var:', process.env.NEXT_PUBLIC_SUPABASE_URL)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Simple Click</h1>
      <Button onClick={handleClick}>Click Me</Button>
    </div>
  )
}
