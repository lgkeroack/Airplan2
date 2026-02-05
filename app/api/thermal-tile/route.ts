import { NextRequest, NextResponse } from 'next/server'

const TILE_TYPES: Record<string, string> = {
    'hotspots': 'thermals_jul_07',
    'skyways': 'skyways_all_all'
}

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams
    const z = searchParams.get('z')
    const x = searchParams.get('x')
    const y = searchParams.get('y')
    const type = searchParams.get('type') || 'hotspots'

    if (!z || !x || !y) {
        return NextResponse.json({ error: 'Missing tile coordinates' }, { status: 400 })
    }

    const tilePath = TILE_TYPES[type]
    if (!tilePath) {
        return NextResponse.json({ error: 'Invalid tile type' }, { status: 400 })
    }

    try {
        const tileUrl = `https://thermal.kk7.ch/tiles/${tilePath}/${z}/${x}/${y}.png`

        const response = await fetch(tileUrl, {
            headers: {
                'User-Agent': 'Airplan2/1.0',
                'Referer': 'https://thermal.kk7.ch/'
            }
        })

        if (!response.ok) {
            // Return transparent 1x1 PNG for missing tiles
            if (response.status === 404) {
                const transparentPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')
                return new NextResponse(transparentPng, {
                    headers: {
                        'Content-Type': 'image/png',
                        'Cache-Control': 'public, max-age=86400',
                    }
                })
            }
            return NextResponse.json({ error: 'Failed to fetch tile' }, { status: response.status })
        }

        const arrayBuffer = await response.arrayBuffer()

        return new NextResponse(arrayBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
            }
        })
    } catch (error) {
        console.error('Error fetching thermal tile:', error)
        return NextResponse.json({ error: 'Failed to fetch thermal tile' }, { status: 500 })
    }
}
