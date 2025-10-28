'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function TestSync() {
  const [clicks, setClicks] = useState(0)

  const handleClick = () => {
    console.log('🔵 SYNC CLICK - This should appear immediately')
    setClicks(prev => prev + 1)
    console.log('✅ Click count updated to:', clicks + 1)
  }

  const handleAsyncClick = async () => {
    console.log('🔵 ASYNC START - Before any await')
    setClicks(prev => prev + 10)
    console.log('✅ ASYNC END - After state update')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Sync vs Async</h1>
      <p className="mb-4">Clicks: {clicks}</p>

      <div className="space-x-4">
        <Button onClick={handleClick}>
          Sync Click
        </Button>

        <Button onClick={handleAsyncClick}>
          Async Click
        </Button>
      </div>
    </div>
  )
}
