import { NextRequest } from 'next/server'
import { getLogs } from '@/lib/server-log-store'

export const dynamic = 'force-dynamic' // Ensure this route is not cached

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const since = searchParams.get('since')
    
    if (since) {
      const sinceTimestamp = parseInt(since, 10)
      if (isNaN(sinceTimestamp)) {
        return Response.json({ logs: [] }, { status: 400 })
      }
      const filteredLogs = getLogs(sinceTimestamp)
      return Response.json({ logs: filteredLogs })
    }
    
    const allLogs = getLogs()
    return Response.json({ logs: allLogs })
  } catch (error: any) {
    console.error('Error in /api/logs:', error)
    return Response.json({ logs: [], error: error.message }, { status: 500 })
  }
}
