// Script to download, parse, and simplify Canadian airspace file
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { parseOpenAirFile, convertToApiFormat } from '../lib/openair-parser'
import { filterValidAirspaces, consolidateSimilarAirspaces } from '../lib/load-airspace-data'

async function processCanadianAirspace() {
  const url = 'https://soaringweb.org/Airspace/NA/CanAirspace318all.txt'
  const outputPath = join(process.cwd(), 'data', 'canadian-airspace-simplified.json')
  
  console.log('Downloading Canadian airspace file...')
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TopographicAirspaceApp/1.0',
    },
  })
  
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`)
  }
  
  const content = await response.text()
  console.log(`Downloaded ${content.length} characters`)
  
  console.log('Parsing OpenAir file...')
  const parsed = parseOpenAirFile(content, 'CA')
  console.log(`Parsed ${parsed.length} airspace entries`)
  
  console.log('Converting to API format...')
  let converted = convertToApiFormat(parsed, 'CA')
  console.log(`Converted to ${converted.length} entries`)
  
  console.log('Filtering invalid geometry...')
  converted = filterValidAirspaces(converted)
  console.log(`After filtering: ${converted.length} entries`)
  
  console.log('Consolidating similar/duplicate airspaces...')
  converted = await consolidateSimilarAirspaces(converted)
  console.log(`After consolidation: ${converted.length} entries (simplified)`)
  
  console.log(`Saving simplified file to ${outputPath}...`)
  await writeFile(outputPath, JSON.stringify(converted, null, 2), 'utf-8')
  
  console.log(`\n✅ Success! Simplified file saved to: ${outputPath}`)
  console.log(`   Original entries: ${parsed.length}`)
  console.log(`   Final entries: ${converted.length}`)
  console.log(`   Reduction: ${((1 - converted.length / parsed.length) * 100).toFixed(1)}%`)
}

// Run the script
processCanadianAirspace().catch(error => {
  console.error('Error processing Canadian airspace:', error)
  process.exit(1)
})

