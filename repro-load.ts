import { loadAirspaceData } from './lib/load-airspace-data'

async function test() {
    console.log('Testing loadAirspaceData...')
    try {
        const data = await loadAirspaceData('ALL')
        console.log(`Success! Loaded ${data.length} entries.`)
        if (data.length > 0) {
            console.log('Sample entry:', JSON.stringify(data[0], null, 2))
        }
    } catch (error) {
        console.error('Error in loadAirspaceData:', error)
    }
}

test()
