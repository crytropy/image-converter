import { access, cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const sourceRoot = join(process.cwd(), 'node_modules', 'pdfjs-dist')
const destRoot = join(process.cwd(), 'dist', 'pdfjs')
const directories = ['wasm', 'cmaps', 'standard_fonts', 'iccs', 'image_decoders']

await mkdir(destRoot, { recursive: true })

for (const directory of directories) {
  const source = join(sourceRoot, directory)
  try {
    await access(source)
    await cp(source, join(destRoot, directory), { recursive: true })
    console.log(`Copied PDF.js asset directory: ${directory}`)
  } catch {
    console.log(`PDF.js asset directory not present, skipped: ${directory}`)
  }
}
