'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TestEnv() {
  const [result, setResult] = useState('')

  const checkEnv = () => {
    console.log('🔵 Checking environment variables...')

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('URL:', url)
    console.log('Key:', key ? `${key.substring(0, 20)}...` : 'MISSING')

    setResult(`URL: ${url}\nKey: ${key ? 'Present' : 'MISSING'}`)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Environment Variables</h1>
      <Button onClick={checkEnv}>Check Env</Button>
      <pre className="mt-4 p-4 bg-gray-100">{result || 'Click to check'}</pre>
    </div>
  )
}
