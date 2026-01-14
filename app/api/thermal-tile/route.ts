import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')
    
    if (!z || !x || !y) {
        return NextResponse.json({ error: 'Missing tile coordinates' }, { status: 400 })
    }
    
    try {
        const tileUrl = `https://thermal.kk7.ch/tiles/thermals_jul_07/${z}/${x}/${y}.png?src=airplan2`
        
        const response = await fetch(tileUrl)
        
        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch tile' }, { status: response.status })
        }
        
        const arrayBuffer = await response.arrayBuffer()
        
        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400', // Cache for 1 day
            }
        })
    } catch (error) {
        console.error('Error fetching thermal tile:', error)
        return NextResponse.json({ error: 'Failed to fetch thermal tile' }, { status: 500 })
    }
}
