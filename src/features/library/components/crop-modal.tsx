import { useState, useCallback } from 'react'
import Cropper from 'react-easy-crop'
import type { Area } from 'react-easy-crop'
import { Loader2, ZoomIn } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import type { ArtworkKind } from '@/services/metadata'

/**
 * Aspect ratio the crop box is locked to per artwork kind — matches
 * what each slot actually renders as elsewhere in the app (portrait
 * cover, 16:9 hero banner/background, roughly-square-ish logo left
 * loose since logos vary wildly in shape).
 */
const ASPECT: Record<ArtworkKind, number> = {
  cover: 3 / 4,
  banner: 16 / 9,
  background: 16 / 9,
  logo: 3 / 1,
}

interface CropModalProps {
  open: boolean
  imageSrc: string | null
  targetKind: ArtworkKind
  isSaving: boolean
  onCancel: () => void
  onSave: (rect: { x: number; y: number; width: number; height: number }) => void
}

/**
 * Wraps `react-easy-crop` in the app's `Modal` shell. The crop box is
 * fixed to a kind-specific aspect ratio (dragging pans, scrolling/the
 * slider zooms) — free-form aspect isn't offered since every artwork
 * slot elsewhere in the app renders at a fixed ratio, so an odd-shaped
 * crop would just get letterboxed or cropped again on render anyway.
 * `onCropComplete` already reports the crop rect in the *original*
 * image's pixel space, so `onSave` can hand those numbers straight to
 * `crop_and_save_image` with no extra scaling math.
 */
export function CropModal({
  open,
  imageSrc,
  targetKind,
  isSaving,
  onCancel,
  onSave,
}: CropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function handleClose() {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    onCancel()
  }

  function handleSave() {
    if (!croppedAreaPixels) return
    onSave(croppedAreaPixels)
  }

  return (
    <Modal open={open} onClose={handleClose} widthClassName="max-w-xl">
      <div className="flex flex-col gap-4 p-5">
        <div>
          <h2 className="text-base font-semibold text-text">Crop {ARTWORK_TITLE[targetKind]}</h2>
          <p className="mt-0.5 text-xs text-muted">
            Drag to reposition, scroll or use the slider to zoom.
          </p>
        </div>

        <div className="relative h-80 w-full overflow-hidden rounded-lg bg-black">
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={ASPECT[targetKind]}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ZoomIn className="size-3.5 shrink-0 text-subtle" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-accent"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="rounded-xl border border-border/80 bg-surface/70 px-4 py-1.5 text-xs font-bold text-text shadow-xs transition-all duration-200 hover:bg-surface-raised hover:border-border hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !croppedAreaPixels}
            className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-1.5 text-xs font-bold text-white shadow-md shadow-accent/20 transition-all duration-200 hover:bg-accent-hover hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isSaving && <Loader2 className="size-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

const ARTWORK_TITLE: Record<ArtworkKind, string> = {
  cover: 'Cover',
  banner: 'Banner',
  logo: 'Logo',
  background: 'Background',
}
