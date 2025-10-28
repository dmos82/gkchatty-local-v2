'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TestRawFetch() {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)

  const testFetch = async () => {
    setLoading(true)
    console.log('🔵 Starting raw fetch test')

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      console.log('🔵 Fetching from:', `${url}/rest/v1/profiles`)

      const response = await fetch(
        `${url}/rest/v1/profiles?select=username&limit=1`,
        {
          headers: {
            'apikey': key!,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          }
        }
      )

      console.log('✅ Response received:', response.status)
      const data = await response.json()
      console.log('✅ Data:', data)

      setResult(`SUCCESS! ${JSON.stringify(data)}`)
    } catch (error) {
      console.error('❌ Error:', error)
      setResult(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Raw Fetch in onClick</h1>
      <Button onClick={testFetch} disabled={loading}>
        {loading ? 'Testing...' : 'Test Fetch'}
      </Button>
      <div className="mt-4 p-4 bg-gray-100">
        <pre>{result || 'Click to test'}</pre>
      </div>
    </div>
  )
}
