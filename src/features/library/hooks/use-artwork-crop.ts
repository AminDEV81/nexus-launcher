import { useState } from 'react'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { toast } from 'sonner'
import { blobUrlForLocalFile } from '@/lib/asset-url'
import { useCropAndSaveImage } from './use-cover-options'
import type { ArtworkKind, CropRect } from '@/services/metadata'

const FILE_FILTERS = [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]

/**
 * Drives "Browse for a file, then crop it" for any of the four artwork
 * kinds. Shared by the cover/banner pickers' "Crop…" option and the
 * logo/background editor, which both need identical
 * pick-file → preview-as-blob-URL → show `CropModal` → apply behavior.
 *
 * `pending.previewSrc` is a blob URL (see `blobUrlForLocalFile`), not
 * an asset:// URL — a freshly Browse-picked file lives outside the
 * `$APPDATA/artwork/**` asset-protocol scope, so it can't be served
 * that way. It's revoked on cancel/success to avoid leaking memory
 * across repeated Browse picks.
 */
export function useArtworkCrop(gameId: string | null) {
  const [pending, setPending] = useState<{
    kind: ArtworkKind
    filePath: string
    previewSrc: string
  } | null>(null)
  const cropAndSave = useCropAndSaveImage()

  async function pickAndCrop(kind: ArtworkKind) {
    try {
      const picked = await openFileDialog({ multiple: false, filters: FILE_FILTERS })
      if (typeof picked !== 'string') return
      const previewSrc = await blobUrlForLocalFile(picked)
      setPending((current) => {
        // A previous pick's preview may still be open if Browse was
        // clicked twice — revoke it so blob URLs never pile up.
        if (current) URL.revokeObjectURL(current.previewSrc)
        return { kind, filePath: picked, previewSrc }
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load that image.')
    }
  }

  function cancel() {
    if (pending) URL.revokeObjectURL(pending.previewSrc)
    setPending(null)
  }

  function save(rect: CropRect) {
    if (!gameId || !pending) return
    cropAndSave.mutate(
      { gameId, sourcePath: pending.filePath, rect, targetKind: pending.kind },
      { onSuccess: cancel },
    )
  }

  return {
    pending,
    isSaving: cropAndSave.isPending,
    pickAndCrop,
    cancel,
    save,
  }
}
