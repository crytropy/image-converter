import { useEffect, useMemo, useRef, useState } from 'react'
import { zipSync } from 'fflate'
import { convertFile, isSupportedFile, outputExtension } from './converter'
import type { ConversionJob, OutputFormat } from './types'

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function makeId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null)
  const jobsRef = useRef<ConversionJob[]>([])
  const [jobs, setJobs] = useState<ConversionJob[]>([])
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('jpeg')
  const [quality, setQuality] = useState(0.9)
  const [pdfScale, setPdfScale] = useState(2)
  const [isConverting, setIsConverting] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    jobsRef.current = jobs
  }, [jobs])

  useEffect(() => {
    return () => {
      for (const job of jobsRef.current) {
        for (const output of job.outputs) URL.revokeObjectURL(output.url)
      }
    }
  }, [])

  const doneOutputs = useMemo(
    () => jobs.flatMap((job) => (job.status === 'done' ? job.outputs : [])),
    [jobs],
  )

  const addFiles = (files: File[]) => {
    const supported = files.filter(isSupportedFile)
    const rejected = files.length - supported.length

    if (rejected) {
      setNotice(`已略過 ${rejected} 個不支援的檔案。`)
    } else {
      setNotice('')
    }

    if (!supported.length) return

    setJobs((current) => [
      ...current,
      ...supported.map((file) => ({
        id: makeId(),
        file,
        status: 'queued' as const,
        progress: 0,
        outputs: [],
      })),
    ])
  }

  const removeJob = (id: string) => {
    setJobs((current) => {
      const target = current.find((job) => job.id === id)
      target?.outputs.forEach((output) => URL.revokeObjectURL(output.url))
      return current.filter((job) => job.id !== id)
    })
  }

  const clearAll = () => {
    setJobs((current) => {
      current.forEach((job) => job.outputs.forEach((output) => URL.revokeObjectURL(output.url)))
      return []
    })
    setNotice('')
  }

  const convertAll = async () => {
    if (!jobs.length || isConverting) return
    setIsConverting(true)
    setNotice('')

    const ids = jobs.map((job) => job.id)

    // Sequential conversion intentionally limits memory use for large batches/PDFs.
    for (const id of ids) {
      const source = jobsRef.current.find((job) => job.id === id)
      if (!source) continue

      source.outputs.forEach((output) => URL.revokeObjectURL(output.url))
      setJobs((current) =>
        current.map((job) =>
          job.id === id
            ? { ...job, status: 'processing', progress: 0, outputs: [], error: undefined }
            : job,
        ),
      )

      try {
        const outputs = await convertFile(
          source.file,
          outputFormat,
          quality,
          pdfScale,
          (progress) => {
            setJobs((current) =>
              current.map((job) => (job.id === id ? { ...job, progress } : job)),
            )
          },
        )

        setJobs((current) =>
          current.map((job) =>
            job.id === id ? { ...job, status: 'done', progress: 100, outputs } : job,
          ),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : '轉換失敗。'
        setJobs((current) =>
          current.map((job) =>
            job.id === id ? { ...job, status: 'error', progress: 0, error: message } : job,
          ),
        )
      }
    }

    setIsConverting(false)
  }

  const downloadAllZip = async () => {
    if (!doneOutputs.length) return

    const entries: Record<string, Uint8Array> = {}
    const nameCounter = new Map<string, number>()

    for (const output of doneOutputs) {
      let name = output.name
      const count = nameCounter.get(name) ?? 0
      nameCounter.set(name, count + 1)
      if (count > 0) {
        const dot = name.lastIndexOf('.')
        const stem = dot >= 0 ? name.slice(0, dot) : name
        const ext = dot >= 0 ? name.slice(dot) : ''
        name = `${stem}_${count + 1}${ext}`
      }
      entries[name] = new Uint8Array(await output.blob.arrayBuffer())
    }

    const zipped = zipSync(entries, { level: 6 })
    const zipBuffer = zipped.slice().buffer as ArrayBuffer
    downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), 'converted-images.zip')
  }

  const doneCount = jobs.filter((job) => job.status === 'done').length

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="eyebrow">Browser Image Converter</div>
        <h1>圖檔轉換器</h1>
        <p>
          PDF 與常見圖片直接在你的瀏覽器中轉換，不上傳伺服器。支援批次輸出 JPG / PNG。
        </p>
      </section>

      <section className="panel upload-panel">
        <div
          className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            event.preventDefault()
            if (event.currentTarget === event.target) setDragActive(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragActive(false)
            addFiles(Array.from(event.dataTransfer.files))
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <div className="upload-icon">＋</div>
          <strong>拖曳檔案到這裡</strong>
          <span>或點擊選擇檔案</span>
          <small>JPEG · JPG · PNG · WebP · BMP · PDF</small>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf,image/jpeg,image/png,image/webp,image/bmp,application/pdf"
            hidden
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []))
              event.currentTarget.value = ''
            }}
          />
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="panel settings-panel">
        <div className="setting-group">
          <label>輸出格式</label>
          <div className="segmented">
            <button
              className={outputFormat === 'jpeg' ? 'active' : ''}
              onClick={() => setOutputFormat('jpeg')}
              disabled={isConverting}
            >
              JPG
            </button>
            <button
              className={outputFormat === 'png' ? 'active' : ''}
              onClick={() => setOutputFormat('png')}
              disabled={isConverting}
            >
              PNG
            </button>
          </div>
        </div>

        <div className="setting-group">
          <label htmlFor="quality">JPG 品質：{Math.round(quality * 100)}%</label>
          <input
            id="quality"
            type="range"
            min="0.5"
            max="1"
            step="0.01"
            value={quality}
            disabled={outputFormat !== 'jpeg' || isConverting}
            onChange={(event) => setQuality(Number(event.target.value))}
          />
        </div>

        <div className="setting-group">
          <label htmlFor="pdfScale">PDF 解析度</label>
          <select
            id="pdfScale"
            value={pdfScale}
            disabled={isConverting}
            onChange={(event) => setPdfScale(Number(event.target.value))}
          >
            <option value={1}>1×（較小）</option>
            <option value={1.5}>1.5×</option>
            <option value={2}>2×（建議）</option>
            <option value={3}>3×（較清晰）</option>
          </select>
        </div>
      </section>

      <section className="panel files-panel">
        <div className="section-heading">
          <div>
            <h2>轉換清單</h2>
            <p>{jobs.length ? `${jobs.length} 個來源檔案` : '尚未加入檔案'}</p>
          </div>
          {jobs.length > 0 && (
            <button className="text-button" onClick={clearAll} disabled={isConverting}>
              清除全部
            </button>
          )}
        </div>

        {jobs.length === 0 ? (
          <div className="empty-state">加入檔案後會顯示在這裡。</div>
        ) : (
          <div className="file-list">
            {jobs.map((job) => (
              <article className="file-row" key={job.id}>
                <div className="file-main">
                  <div className="file-name" title={job.file.name}>{job.file.name}</div>
                  <div className="file-meta">
                    {fileSize(job.file.size)} · {job.status === 'queued' && '等待中'}
                    {job.status === 'processing' && `轉換中 ${job.progress}%`}
                    {job.status === 'done' && `完成 · ${job.outputs.length} 個輸出`}
                    {job.status === 'error' && '失敗'}
                  </div>
                  {job.status === 'processing' && (
                    <div className="progress-track">
                      <div className="progress-bar" style={{ width: `${job.progress}%` }} />
                    </div>
                  )}
                  {job.error && <div className="error-text">{job.error}</div>}
                </div>

                <div className="file-actions">
                  {job.status === 'done' && job.outputs.length === 1 && (
                    <a className="small-button" href={job.outputs[0].url} download={job.outputs[0].name}>
                      下載
                    </a>
                  )}
                  {job.status === 'done' && job.outputs.length > 1 && (
                    <span className="page-count">PDF 已拆成 {job.outputs.length} 頁</span>
                  )}
                  <button
                    className="remove-button"
                    onClick={() => removeJob(job.id)}
                    disabled={isConverting}
                    aria-label={`移除 ${job.file.name}`}
                  >
                    ×
                  </button>
                </div>

                {job.status === 'done' && job.outputs.length > 1 && (
                  <div className="output-list">
                    {job.outputs.map((output) => (
                      <a key={output.name} href={output.url} download={output.name}>
                        {output.name}
                      </a>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="action-bar">
        <button className="primary-button" onClick={convertAll} disabled={!jobs.length || isConverting}>
          {isConverting ? '轉換中…' : `開始轉換為 ${outputExtension(outputFormat).toUpperCase()}`}
        </button>
        <button className="secondary-button" onClick={downloadAllZip} disabled={!doneOutputs.length || isConverting}>
          全部下載 ZIP{doneOutputs.length ? ` (${doneOutputs.length})` : ''}
        </button>
        {jobs.length > 0 && <span className="summary">完成 {doneCount} / {jobs.length}</span>}
      </section>

      <footer>
        <span>所有轉換都在本機瀏覽器完成。</span>
        <span>第一版 MVP</span>
      </footer>
    </main>
  )
}
