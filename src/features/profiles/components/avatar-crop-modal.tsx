import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, Check, Move, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { ModalCloseButton } from '@/components/ui/modal'

import { downloadAvatarDataUrl } from '@/services/profiles'

interface AvatarCropModalProps {
  isOpen: boolean
  imageSrc: string | null
  onClose: () => void
  onCropComplete: (croppedDataUrl: string) => void
}

const VIEWPORT_SIZE = 240 // 240px circular viewport

export function AvatarCropModal({
  isOpen,
  imageSrc,
  onClose,
  onCropComplete,
}: AvatarCropModalProps) {
  const [zoom, setZoom] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [naturalDimensions, setNaturalDimensions] = useState({ width: 0, height: 0 })
  const [localSrc, setLocalSrc] = useState<string | null>(null)
  const [isLoadingSrc, setIsLoadingSrc] = useState(false)

  const imageRef = useRef<HTMLImageElement>(null)

  // Reset state on image load or open; download remote URLs as data URI to guarantee 0 canvas taint
  useEffect(() => {
    if (!isOpen || !imageSrc) {
      setLocalSrc(null)
      return
    }

    setZoom(1)
    setPosition({ x: 0, y: 0 })

    let active = true

    const prepareImage = async () => {
      let finalSrc = imageSrc
      if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
        setIsLoadingSrc(true)
        try {
          finalSrc = await downloadAvatarDataUrl(imageSrc)
        } catch (err) {
          console.warn('Direct backend download failed, using raw URL:', err)
          finalSrc = imageSrc
        } finally {
          if (active) setIsLoadingSrc(false)
        }
      }

      if (!active) return
      setLocalSrc(finalSrc)

      const img = new Image()
      img.onload = () => {
        if (active) {
          setNaturalDimensions({ width: img.naturalWidth, height: img.naturalHeight })
        }
      }
      img.src = finalSrc
    }

    void prepareImage()

    return () => {
      active = false
    }
  }, [isOpen, imageSrc])

  // ESC handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, onClose])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.0015
    setZoom((prev) => Math.min(3.5, Math.max(1, prev + delta)))
  }, [])

  // Pointer drag events
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    setIsDragging(true)
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    })
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false)
      try {
        ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {
        // Ignore
      }
    }
  }

  const handleReset = () => {
    setZoom(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleApply = () => {
    if (!imageSrc || !imageRef.current || naturalDimensions.width === 0) return

    try {
      const canvas = document.createElement('canvas')
      const targetSize = 256
      canvas.width = targetSize
      canvas.height = targetSize
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        toast.error('Canvas rendering is not supported.')
        return
      }

      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      // Calculate displayed image size within the viewport
      const img = imageRef.current
      const displayedWidth = img.width * zoom
      const displayedHeight = img.height * zoom

      // Viewport center coordinates relative to image top-left
      const centerOffsetX = displayedWidth / 2 - position.x
      const centerOffsetY = displayedHeight / 2 - position.y

      // Conversion from displayed pixels to natural image pixels
      const scaleToNaturalX = naturalDimensions.width / displayedWidth
      const scaleToNaturalY = naturalDimensions.height / displayedHeight

      // Radius in natural pixels
      const naturalRadius = (VIEWPORT_SIZE / 2) * scaleToNaturalX

      // Natural crop center
      const naturalCenterX = centerOffsetX * scaleToNaturalX
      const naturalCenterY = centerOffsetY * scaleToNaturalY

      const cropX = naturalCenterX - naturalRadius
      const cropY = naturalCenterY - naturalRadius
      const cropSize = naturalRadius * 2

      // Draw onto 256x256 circular canvas
      ctx.beginPath()
      ctx.arc(targetSize / 2, targetSize / 2, targetSize / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()

      ctx.drawImage(img, cropX, cropY, cropSize, cropSize, 0, 0, targetSize, targetSize)

      // Export as WebP or PNG
      const dataUrl = canvas.toDataURL('image/webp', 0.92)
      onCropComplete(dataUrl)
      toast.success('Avatar adjusted and applied!')
      onClose()
    } catch (err) {
      console.error('Failed to crop avatar:', err)
      toast.error('Failed to crop image.')
    }
  }

  if (!isOpen || !imageSrc) return null

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 select-none animate-in fade-in duration-200"
    >
      <div className="relative flex flex-col items-center w-full max-w-md rounded-3xl border border-white/15 bg-surface-raised/95 shadow-2xl p-6 backdrop-blur-xl">
        {/* Header */}
        <div className="flex w-full items-center justify-between pb-4 border-b border-border/70">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-xl bg-accent/20 text-accent">
              <Move className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text">Adjust Profile Photo</h3>
              <p className="text-[11px] text-subtle">Drag to position, scroll or slide to zoom</p>
            </div>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        {/* Viewport with Circular Mask (Telegram / WhatsApp Style) */}
        <div
          className="relative my-6 flex items-center justify-center overflow-hidden rounded-2xl bg-black/60 shadow-inner"
          style={{ width: VIEWPORT_SIZE + 40, height: VIEWPORT_SIZE + 40 }}
          onWheel={handleWheel}
        >
          {/* Draggable Image Layer */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={cn(
              'absolute touch-none select-none transition-transform duration-75',
              isDragging ? 'cursor-grabbing' : 'cursor-grab',
            )}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {isLoadingSrc ? (
              <div className="flex size-48 items-center justify-center">
                <Loader2 className="size-8 text-accent animate-spin" />
              </div>
            ) : (
              <img
                ref={imageRef}
                src={localSrc || imageSrc}
                alt="Crop target"
                draggable={false}
                className="max-w-[320px] max-h-[320px] object-contain pointer-events-none"
              />
            )}
          </div>

          {/* Circular Mask Viewport with Dimmed Backdrop */}
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.68)] ring-1 ring-accent/40"
            style={{
              width: VIEWPORT_SIZE,
              height: VIEWPORT_SIZE,
            }}
          />

          {/* Subtle Viewport Grid Lines */}
          <div
            className="pointer-events-none absolute rounded-full opacity-20 border border-dashed border-white/50"
            style={{
              width: VIEWPORT_SIZE,
              height: VIEWPORT_SIZE,
            }}
          />
        </div>

        {/* Controls: Zoom Slider, Reset */}
        <div className="flex flex-col gap-4 w-full px-2">
          {/* Zoom Slider Row */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(1, prev - 0.2))}
              className="p-1.5 rounded-lg border border-border bg-surface text-muted hover:text-text transition-colors cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>

            <input
              type="range"
              min="1"
              max="3.5"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-accent h-1.5 rounded-lg bg-surface cursor-pointer"
            />

            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(3.5, prev + 0.2))}
              className="p-1.5 rounded-lg border border-border bg-surface text-muted hover:text-text transition-colors cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>

            <span className="text-xs font-mono font-bold text-muted w-10 text-right">
              {zoom.toFixed(1)}x
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-3 border-t border-border/70">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-surface text-xs font-semibold text-muted hover:text-text transition-colors cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
              <span>Center</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl border border-border bg-surface text-xs font-semibold text-muted hover:text-text transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-1.5 px-5 py-1.5 rounded-xl bg-accent text-xs font-bold text-white shadow-md hover:bg-accent-hover transition-colors cursor-pointer"
              >
                <Check className="size-4" />
                <span>Save Avatar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
