import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { OutputFile, OutputFormat } from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp'])
const PDF_MIME = 'application/pdf'

export function isSupportedFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return file.type === PDF_MIME || ext === 'pdf' || IMAGE_EXTENSIONS.has(ext)
}

export function outputExtension(format: OutputFormat): string {
  return format === 'jpeg' ? 'jpg' : 'png'
}

function baseName(filename: string): string {
  const index = filename.lastIndexOf('.')
  return index > 0 ? filename.slice(0, index) : filename
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('瀏覽器無法建立輸出圖片。'))
      },
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      format === 'jpeg' ? quality : undefined,
    )
  })
}

function prepareCanvasForOutput(
  source: CanvasImageSource,
  width: number,
  height: number,
  format: OutputFormat,
): HTMLCanvasElement {
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: format === 'png' })
  if (!ctx) throw new Error('無法建立 Canvas 2D 環境。')

  // JPEG does not support transparency; use white instead of browser-dependent black.
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(source, 0, 0, width, height)
  return canvas
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Some browser/format combinations are better handled by <img>.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function convertImage(
  file: File,
  format: OutputFormat,
  quality: number,
): Promise<OutputFile[]> {
  const image = await loadImage(file)
  try {
    const width = image instanceof ImageBitmap ? image.width : image.naturalWidth
    const height = image instanceof ImageBitmap ? image.height : image.naturalHeight
    if (!width || !height) throw new Error('圖片尺寸無效。')

    const canvas = prepareCanvasForOutput(image, width, height, format)
    const blob = await canvasToBlob(canvas, format, quality)
    const name = `${baseName(file.name)}.${outputExtension(format)}`
    return [{ name, blob, url: URL.createObjectURL(blob) }]
  } finally {
    if (image instanceof ImageBitmap) image.close()
  }
}

async function convertPdf(
  file: File,
  format: OutputFormat,
  quality: number,
  pdfScale: number,
  onProgress?: (progress: number) => void,
): Promise<OutputFile[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdfAssetBase = `${import.meta.env.BASE_URL}pdfjs/`
  const loadingTask = pdfjsLib.getDocument({
    data: bytes,
    wasmUrl: `${pdfAssetBase}wasm/`,
    cMapUrl: `${pdfAssetBase}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${pdfAssetBase}standard_fonts/`,
    iccUrl: `${pdfAssetBase}iccs/`,
  })
  const pdf = await loadingTask.promise
  const outputs: OutputFile[] = []
  const root = baseName(file.name)

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: pdfScale })
      const width = Math.ceil(viewport.width)
      const height = Math.ceil(viewport.height)
      const canvas = makeCanvas(width, height)

      await page.render({
        canvas,
        viewport,
        background: '#ffffff',
      }).promise
      const blob = await canvasToBlob(canvas, format, quality)
      const suffix = String(pageNumber).padStart(Math.max(3, String(pdf.numPages).length), '0')
      const name = `${root}_page_${suffix}.${outputExtension(format)}`
      outputs.push({ name, blob, url: URL.createObjectURL(blob) })

      page.cleanup()
      canvas.width = 1
      canvas.height = 1
      onProgress?.(Math.round((pageNumber / pdf.numPages) * 100))
    }

    return outputs
  } catch (error) {
    for (const output of outputs) URL.revokeObjectURL(output.url)
    throw error
  } finally {
    await loadingTask.destroy()
  }
}

export async function convertFile(
  file: File,
  format: OutputFormat,
  quality: number,
  pdfScale: number,
  onProgress?: (progress: number) => void,
): Promise<OutputFile[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (file.type === PDF_MIME || ext === 'pdf') {
    return convertPdf(file, format, quality, pdfScale, onProgress)
  }

  onProgress?.(10)
  const result = await convertImage(file, format, quality)
  onProgress?.(100)
  return result
}
