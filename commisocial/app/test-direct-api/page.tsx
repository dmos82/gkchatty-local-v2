'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TestDirectAPI() {
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(false)

  const testDirectFetch = async () => {
    setLoading(true)
    setResult('Starting direct fetch test...')

    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      console.log('🔵 Testing direct REST API call')
      console.log('URL:', url)

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

      setResult(`SUCCESS! Status: ${response.status}, Data: ${JSON.stringify(data, null, 2)}`)
    } catch (error) {
      console.error('❌ Error:', error)
      setResult(`ERROR: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Direct REST API</h1>
      <p className="mb-4">This bypasses Supabase client and uses fetch directly</p>

      <Button onClick={testDirectFetch} disabled={loading}>
        {loading ? 'Testing...' : 'Test Direct Fetch'}
      </Button>

      <div className="mt-4 p-4 bg-gray-100 rounded">
        <pre>{result || 'Click button to test'}</pre>
      </div>
    </div>
  )
}
