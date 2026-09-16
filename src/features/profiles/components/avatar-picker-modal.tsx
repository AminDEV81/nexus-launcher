import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  Upload,
  Sparkles,
  Gamepad2,
  Crop,
  Check,
  X,
  Loader2,
  FolderOpen,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { AVATAR_ICONS } from './avatar-icons'
import { ProfileAvatarIcon } from './profile-avatar-icon'
import { AvatarCropModal } from './avatar-crop-modal'
import { searchGamingAvatars, type GamingAvatarItem } from '@/services/profiles'
import { cn } from '@/lib/utils'
import { ModalCloseButton } from '@/components/ui/modal'

interface AvatarPickerModalProps {
  isOpen: boolean
  currentAvatar: string
  profileColor: string
  onClose: () => void
  onSelectAvatar: (avatar: string) => void
}

type TabType = 'gaming' | 'upload' | 'icons'

export function AvatarPickerModal({
  isOpen,
  currentAvatar,
  profileColor,
  onClose,
  onSelectAvatar,
}: AvatarPickerModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('gaming')
  const [searchQuery, setSearchQuery] = useState('')
  const [avatars, setAvatars] = useState<GamingAvatarItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  // Cropper state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [isCropperOpen, setIsCropperOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const categoriesRef = useRef<HTMLDivElement>(null)

  const PAGE_SIZE = 24

  // Load initial avatars or search
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setIsLoading(true)
    setOffset(0)
    setHasMore(true)

    const timer = setTimeout(
      () => {
        searchGamingAvatars(searchQuery.trim(), 0, PAGE_SIZE)
          .then((results) => {
            if (!cancelled) {
              setAvatars(results)
              setOffset(0)
              if (results.length < PAGE_SIZE) {
                setHasMore(false)
              }
            }
          })
          .catch((err) => {
            console.error('Failed to search gaming avatars:', err)
          })
          .finally(() => {
            if (!cancelled) {
              setIsLoading(false)
            }
          })
      },
      searchQuery ? 300 : 0,
    )

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, searchQuery])

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore) return
    const nextOffset = offset + PAGE_SIZE
    setIsLoadingMore(true)

    try {
      const more = await searchGamingAvatars(searchQuery.trim(), nextOffset, PAGE_SIZE)
      if (more.length === 0) {
        setHasMore(false)
      } else {
        setAvatars((prev) => {
          const existingIds = new Set(prev.map((a) => a.id))
          const fresh = more.filter((item) => !existingIds.has(item.id))
          if (fresh.length === 0) {
            setHasMore(false)
            return prev
          }
          return [...prev, ...fresh]
        })
        setOffset(nextOffset)
        if (more.length < PAGE_SIZE) {
          setHasMore(false)
        }
      }
    } catch (err) {
      console.error('Failed to load more avatars:', err)
      toast.error('Failed to load more avatars.')
    } finally {
      setIsLoadingMore(false)
    }
  }

  // ESC handler
  useEffect(() => {
    if (!isOpen || isCropperOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen, isCropperOpen, onClose])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file (PNG, JPG, WebP).')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropImageSrc(reader.result)
        setIsCropperOpen(true)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Please drop a valid image file (PNG, JPG, WebP).')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCropImageSrc(reader.result)
        setIsCropperOpen(true)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleOpenCropperForAvatar = (imageUrl: string) => {
    setCropImageSrc(imageUrl)
    setIsCropperOpen(true)
  }

  const handleCropComplete = (croppedDataUrl: string) => {
    onSelectAvatar(croppedDataUrl)
    setIsCropperOpen(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget && !isCropperOpen) onClose()
        }}
        className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
      >
        <div className="flex flex-col w-full max-w-2xl h-[85vh] max-h-[720px] min-h-[500px] rounded-3xl border border-border bg-surface-raised shadow-2xl overflow-hidden">
          {/* Top Header */}
          <div className="flex items-center justify-between border-b border-border/70 px-6 py-4 shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="flex size-9 items-center justify-center rounded-xl text-white shadow-xs"
                style={{ backgroundColor: profileColor }}
              >
                <ProfileAvatarIcon avatar={currentAvatar} className="size-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text">Choose Profile Avatar</h2>
                <p className="text-[11px] text-subtle">
                  Select gaming character, upload custom photo, or pick an icon
                </p>
              </div>
            </div>
            <ModalCloseButton onClick={onClose} />
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-border/70 px-6 py-2 bg-surface/50 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('gaming')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                activeTab === 'gaming'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-muted hover:text-text hover:bg-surface',
              )}
            >
              <Sparkles className="size-3.5" />
              <span>Gaming Characters (IGDB & SteamGrid)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                activeTab === 'upload'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-muted hover:text-text hover:bg-surface',
              )}
            >
              <Upload className="size-3.5" />
              <span>Upload Custom Photo</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('icons')}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer',
                activeTab === 'icons'
                  ? 'bg-accent text-white shadow-xs'
                  : 'text-muted hover:text-text hover:bg-surface',
              )}
            >
              <Gamepad2 className="size-3.5" />
              <span>Classic Icons</span>
            </button>
          </div>

          {/* Tab 1: Gaming Characters */}
          {activeTab === 'gaming' && (
            <div className="flex flex-col flex-1 min-h-0 p-5">
              {/* Pinned Top Controls: Search Bar & Categories Header (Never Shrinks or Overlaps) */}
              <div className="flex flex-col gap-2.5 shrink-0 pb-3 mb-2 border-b border-border/40">
                {/* Search Bar */}
                <div className="relative w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-subtle pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search gaming characters, franchises, or games (e.g. Ghost, Kratos, Geralt, Spider-Man)..."
                    className="w-full rounded-xl border border-border bg-surface pl-10 pr-10 py-2.5 text-xs text-text placeholder:text-subtle focus:border-accent focus:outline-none transition-colors"
                  />
                  {searchQuery && !isLoading && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-subtle hover:text-text cursor-pointer p-0.5 rounded-full hover:bg-surface-raised"
                      title="Clear search"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                  {isLoading && (
                    <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-accent animate-spin pointer-events-none" />
                  )}
                </div>

                {/* Quick Filter Tags (Horizontal Scrolling without Scrollbar intrusion) */}
                <div
                  ref={categoriesRef}
                  onWheel={(e) => {
                    if (categoriesRef.current && e.deltaY !== 0) {
                      e.preventDefault()
                      categoriesRef.current.scrollLeft += e.deltaY
                    }
                  }}
                  className="w-full flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0"
                >
                  {[
                    { label: 'All', val: '' },
                    { label: 'Call of Duty', val: 'call of duty' },
                    { label: 'PlayStation', val: 'playstation' },
                    { label: 'The Witcher', val: 'witcher' },
                    { label: 'Cyberpunk', val: 'cyberpunk' },
                    { label: 'GTA', val: 'gta' },
                    { label: 'Red Dead', val: 'red dead' },
                    { label: 'Xbox', val: 'xbox' },
                    { label: 'Resident Evil', val: 'resident evil' },
                    { label: 'Soulslike', val: 'souls' },
                    { label: 'Final Fantasy', val: 'final fantasy' },
                  ].map((cat) => {
                    const isActive = searchQuery.toLowerCase() === cat.val.toLowerCase()
                    return (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => setSearchQuery(cat.val)}
                        className={cn(
                          'shrink-0 whitespace-nowrap text-[11px] font-bold px-3 py-1 rounded-full border transition-all cursor-pointer shadow-2xs',
                          isActive
                            ? 'bg-accent text-white border-accent shadow-xs'
                            : 'bg-surface/80 border-border text-muted hover:text-text hover:bg-surface-raised',
                        )}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Characters Grid */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {avatars.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {avatars.map((item) => {
                        const isSelected = currentAvatar === item.image_url
                        return (
                          <div
                            key={item.id}
                            className={cn(
                              'group relative flex flex-col items-center justify-between rounded-2xl border p-3 transition-all',
                              'bg-surface/60 hover:bg-surface hover:border-accent/60 shadow-2xs',
                              isSelected && 'border-accent bg-accent/10 ring-1 ring-accent/30',
                            )}
                          >
                            {/* Avatar Circle */}
                            <div className="relative size-16 sm:size-18 my-1 flex items-center justify-center">
                              <img
                                src={item.preview_url || item.image_url}
                                alt={item.name}
                                loading="lazy"
                                onError={(e) => {
                                  // Fallback gracefully on broken images
                                  const target = e.currentTarget
                                  target.style.display = 'none'
                                  const fallback = target.nextElementSibling as HTMLElement
                                  if (fallback) fallback.style.display = 'flex'
                                }}
                                className="size-full rounded-full object-cover border-2 border-border/80 group-hover:border-accent transition-colors shadow-sm"
                              />
                              <div
                                style={{ display: 'none' }}
                                className="size-full rounded-full bg-accent/15 border-2 border-border flex items-center justify-center text-accent text-xs font-black uppercase"
                              >
                                {item.name.slice(0, 2)}
                              </div>
                              {isSelected && (
                                <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-accent text-white shadow-xs">
                                  <Check className="size-3 stroke-[3]" />
                                </span>
                              )}
                            </div>

                            {/* Character Info */}
                            <div className="flex flex-col items-center text-center mt-1 w-full">
                              <span className="text-xs font-bold text-text truncate max-w-full">
                                {item.name}
                              </span>
                              <span className="text-[10px] text-subtle truncate max-w-full">
                                {item.subtitle || item.source.toUpperCase()}
                              </span>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-1.5 w-full mt-2.5 pt-2 border-t border-border/50">
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectAvatar(item.image_url)
                                  onClose()
                                }}
                                className="flex-1 py-1 px-2 rounded-lg bg-accent/15 border border-accent/30 text-[10px] font-bold text-accent hover:bg-accent hover:text-white transition-colors cursor-pointer"
                              >
                                Select
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCropperForAvatar(item.image_url)}
                                title="Crop and adjust framing"
                                className="p-1 rounded-lg border border-border bg-surface text-muted hover:text-text hover:bg-surface-raised transition-colors cursor-pointer"
                              >
                                <Crop className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Load More Button (More / بیشتر) */}
                    {hasMore && (
                      <div className="flex justify-center pt-4 pb-2">
                        <button
                          type="button"
                          onClick={handleLoadMore}
                          disabled={isLoadingMore}
                          className="flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-surface border border-border/80 text-xs font-bold text-text hover:bg-surface-raised hover:border-accent transition-all shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          {isLoadingMore ? (
                            <>
                              <Loader2 className="size-4 animate-spin text-accent" />
                              <span>Loading more avatars...</span>
                            </>
                          ) : (
                            <>
                              <Plus className="size-4 text-accent" />
                              <span>Load More Avatars (نمایش بیشتر)</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Sparkles className="size-8 text-subtle/50 mb-2" />
                    <span className="text-xs font-semibold text-text">No avatars found</span>
                    <p className="text-[11px] text-subtle mt-1">
                      Try searching with another name or upload a custom image
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Custom Upload & Drag-and-Drop */}
          {activeTab === 'upload' && (
            <div className="flex flex-col flex-1 p-6 items-center justify-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center w-full max-w-md h-64 rounded-3xl border-2 border-dashed border-border/80 bg-surface/40 hover:bg-surface/70 hover:border-accent transition-all cursor-pointer p-6 text-center group"
              >
                <div className="flex size-16 items-center justify-center rounded-2xl bg-accent/15 text-accent group-hover:scale-110 group-hover:bg-accent group-hover:text-white transition-all shadow-xs mb-4">
                  <FolderOpen className="size-8" />
                </div>
                <h3 className="text-sm font-bold text-text mb-1">Choose Photo from Windows</h3>
                <p className="text-xs text-subtle mb-4 max-w-xs">
                  Drag and drop any image here or click to browse files
                </p>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-accent/10 border border-accent/25 text-accent">
                  Supports PNG, JPG, WebP • Opens in circular cropper
                </span>
              </div>
            </div>
          )}

          {/* Tab 3: Classic Built-in SVG Icons */}
          {activeTab === 'icons' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-3">
                {Object.keys(AVATAR_ICONS).map((iconKey) => {
                  const isSelected = currentAvatar === iconKey
                  return (
                    <button
                      key={iconKey}
                      type="button"
                      onClick={() => {
                        onSelectAvatar(iconKey)
                        onClose()
                      }}
                      className={cn(
                        'flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all cursor-pointer',
                        isSelected
                          ? 'border-accent bg-accent/20 text-accent scale-105 shadow-sm'
                          : 'border-border bg-surface text-muted hover:text-text hover:bg-surface-raised hover:border-border/90',
                      )}
                    >
                      <ProfileAvatarIcon avatar={iconKey} className="size-6" />
                      <span className="text-[10px] font-semibold capitalize truncate max-w-[70px]">
                        {iconKey}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Telegram/WhatsApp Style Cropper Modal */}
      <AvatarCropModal
        isOpen={isCropperOpen}
        imageSrc={cropImageSrc}
        onClose={() => setIsCropperOpen(false)}
        onCropComplete={handleCropComplete}
      />
    </>
  )
}
