import { create } from 'zustand'
import type { NotificationKind, OverlayNotification } from '../types/overlay'

export interface ToastItem {
  /** Stable React key; reused when a notification with the same id replaces another. */
  key: string
  kind: NotificationKind
  title: string
  body: string | null
  duration: number
  /** Changes whenever the toast is (re)shown so its timer restarts. */
  shownAt: number
}

interface NotificationState {
  items: ToastItem[]
  push: (n: OverlayNotification, defaults: { duration: number; max: number }) => void
  dismiss: (key: string) => void
  clear: () => void
}

let counter = 0

export const useNotificationStore = create<NotificationState>((set) => ({
  items: [],

  push: (n, defaults) => {
    const title = n.title?.trim()
    if (!title) return
    const key = n.id ? `id:${n.id}` : `n:${++counter}`
    const item: ToastItem = {
      key,
      kind: n.kind ?? 'info',
      title,
      body: n.body?.trim() || null,
      duration: n.duration_ms ?? defaults.duration,
      shownAt: Date.now() + counter,
    }
    set((state) => {
      const without = state.items.filter((i) => i.key !== key)
      // Same id → replace in place, keeping its slot in the stack.
      const existingIndex = state.items.findIndex((i) => i.key === key)
      const next =
        existingIndex >= 0 ? state.items.map((i) => (i.key === key ? item : i)) : [...without, item]
      return { items: next.slice(-Math.max(1, defaults.max)) }
    })
  },

  dismiss: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key) })),
  clear: () => set({ items: [] }),
}))
