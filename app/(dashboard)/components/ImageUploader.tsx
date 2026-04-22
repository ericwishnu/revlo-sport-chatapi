'use client'
import { useState, useRef } from 'react'
import { Upload, X, Check, AlertCircle, Loader } from 'lucide-react'

interface ImageUploaderProps {
  value: string
  onChange: (url: string) => void
  onError?: (error: string) => void
  label?: string
  placeholder?: string
  maxSize?: number // in MB
}

export default function ImageUploader({
  value,
  onChange,
  onError,
  label = 'Gambar Produk',
  placeholder = 'Drag & drop atau klik untuk upload',
  maxSize = 5,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string>(value)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadProgress, setUploadProgress] = useState(0)

  async function handleFile(file: File) {
    setError(null)

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const msg = 'File harus berupa gambar (JPG, PNG, WebP, dll)'
      setError(msg)
      onError?.(msg)
      return
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSize) {
      const msg = `Ukuran file terlalu besar (max ${maxSize}MB)`
      setError(msg)
      onError?.(msg)
      return
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload file
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      setUploadProgress(50)

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Upload gagal')
      }

      const data = await res.json()
      setUploadProgress(100)
      
      onChange(data.url)
      setError(null)

      // Reset after success
      setTimeout(() => {
        setUploading(false)
        setUploadProgress(0)
      }, 500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan'
      setError(msg)
      onError?.(msg)
      setUploading(false)
      setUploadProgress(0)
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFile(files[0])
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.currentTarget.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }

  function clearImage() {
    setPreview('')
    onChange('')
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}

      {preview ? (
        <div className="relative">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden h-48 flex items-center justify-center">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-full object-cover"
            />
          </div>
          <button
            type="button"
            onClick={clearImage}
            disabled={uploading}
            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
            <Check className="w-4 h-4" />
            Gambar berhasil diunggah
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
        >
          <div className="space-y-2">
            {uploading ? (
              <>
                <Loader className="w-10 h-10 mx-auto text-blue-500 animate-spin" />
                <p className="text-sm font-medium text-gray-700">Upload sedang berlangsung...</p>
                <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <Upload className="w-10 h-10 mx-auto text-gray-400" />
                <div>
                  <p className="text-sm font-medium text-gray-900">{placeholder}</p>
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG, WebP hingga {maxSize}MB</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-red-900">{error}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
        disabled={uploading}
      />
    </div>
  )
}
