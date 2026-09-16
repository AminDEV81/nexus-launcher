import { Upload, RotateCcw, ImageOff } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { assetUrl } from '@/lib/asset-url'
import { useResetArtwork } from '../hooks/use-cover-options'
import { useArtworkCrop } from '../hooks/use-artwork-crop'
import { CropModal } from './crop-modal'
import type { ArtworkKind } from '@/services/metadata'

interface ArtworkEditorModalProps {
  gameId: string | null
  kind: Extract<ArtworkKind, 'logo' | 'background'>
  currentPath: string | null
  open: boolean
  onClose: () => void
}

const TITLE: Record<'logo' | 'background', string> = {
  logo: 'Edit Logo',
  background: 'Edit Background',
}

/**
 * Logo and background have no SteamGridDB picker grid the way
 * cover/banner do — SGDB only ever surfaces one candidate for each, so
 * there's nothing to choose between. This is just "Browse for a
 * replacement (always cropped to frame it) or reset to what was
 * auto-downloaded."
 */
export function ArtworkEditorModal({
  gameId,
  kind,
  currentPath,
  open,
  onClose,
}: ArtworkEditorModalProps) {
  const resetArtwork = useResetArtwork()
  const crop = useArtworkCrop(gameId)
  const previewSrc = assetUrl(currentPath)

  function handleReset() {
    if (!gameId) return
    resetArtwork.mutate({ gameId, kind }, { onSuccess: onClose })
  }

  return (
    <>
      <Modal open={open} onClose={onClose} widthClassName="max-w-md">
        <div className="flex flex-col gap-4 p-5">
          <h2 className="text-base font-semibold text-text">{TITLE[kind]}</h2>

          <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-raised">
            {previewSrc ? (
              <img src={previewSrc} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <ImageOff className="size-6 text-subtle" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              disabled={resetArtwork.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-xs font-medium text-text transition-colors hover:bg-surface-raised disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
              Reset to Downloaded
            </button>
            <button
              type="button"
              onClick={() => {
                onClose()
                void crop.pickAndCrop(kind)
              }}
              disabled={resetArtwork.isPending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              <Upload className="size-3.5" />
              Browse…
            </button>
          </div>
        </div>
      </Modal>

      <CropModal
        open={crop.pending !== null}
        imageSrc={crop.pending?.previewSrc ?? null}
        targetKind={kind}
        isSaving={crop.isSaving}
        onCancel={crop.cancel}
        onSave={(rect) => crop.save(rect)}
      />
    </>
  )
}
