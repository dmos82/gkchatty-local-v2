'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestSupabasePage() {
  const [status, setStatus] = useState<string>('Initializing...')
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    console.log(msg)
    setLogs(prev => [...prev, `${new Date().toISOString()}: ${msg}`])
  }

  useEffect(() => {
    async function testConnection() {
      addLog('🧪 Starting Supabase connection test')

      try {
        const supabase = createClient()
        addLog('✅ Supabase client created')

        // Test 1: Simple query
        addLog('🔄 Test 1: Querying profiles table...')
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .limit(1)

        if (error) {
          addLog(`❌ Query error: ${error.message}`)
          setStatus(`Error: ${error.message}`)
        } else {
          addLog(`✅ Query successful! Result: ${JSON.stringify(data)}`)
          setStatus('✅ Connection working!')
        }

        // Test 2: Check network
        addLog('🔄 Test 2: Direct fetch to Supabase REST API...')
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        const response = await fetch(`${url}/rest/v1/profiles?select=username&limit=1`, {
          headers: {
            'apikey': key!,
            'Authorization': `Bearer ${key}`
          }
        })

        if (response.ok) {
          const data = await response.json()
          addLog(`✅ Direct fetch successful! Data: ${JSON.stringify(data)}`)
        } else {
          addLog(`❌ Direct fetch failed: ${response.status} ${response.statusText}`)
        }

      } catch (err) {
        addLog(`❌ Fatal error: ${err instanceof Error ? err.message : String(err)}`)
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    testConnection()
  }, [])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Supabase Connection Test</h1>
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <strong>Status:</strong> {status}
      </div>
      <div className="bg-black text-green-400 p-4 rounded font-mono text-sm">
        <div className="font-bold mb-2">Console Log:</div>
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
    </div>
  )
}
