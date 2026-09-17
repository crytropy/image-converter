export type OutputFormat = 'jpeg' | 'png'
export type JobStatus = 'queued' | 'processing' | 'done' | 'error'

export interface OutputFile {
  name: string
  blob: Blob
  url: string
}

export interface ConversionJob {
  id: string
  file: File
  status: JobStatus
  progress: number
  outputs: OutputFile[]
  error?: string
}
