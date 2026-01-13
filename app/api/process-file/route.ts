import { NextRequest } from 'next/server'
import { processUploadedFile } from '@/lib/load-airspace-data'

export const dynamic = 'force-dynamic' // Ensure this route is not cached

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const fileName = formData.get('fileName') as string || file?.name || 'uploaded.txt'
    
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }
    
    const content = await file.text()
    const processedData = await processUploadedFile(content, fileName)
    
    return Response.json({ data: processedData })
  } catch (error: any) {
    console.error('Error processing file:', error)
    return Response.json(
      { error: error.message || 'Failed to process file' },
      { status: 500 }
    )
  }
}
