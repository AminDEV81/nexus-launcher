import { useEffect, useRef } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from './app/providers'
import { router } from './app/router'
import { useThemeStore, useActivePalette } from './store/theme-store'
import { useAppearanceSettingsStore } from './store/appearance-settings-store'
import { useWindowActive } from './hooks/use-window-active'
import { setFpsLimitEnabled } from './lib/fps-limiter'

const THEME_TRANSITION_MS = 260

type ThemeTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> }
}

function App() {
  const mode = useThemeStore((s) => s.mode)
  const palette = useActivePalette()
  const isFirstRender = useRef(true)

  const blurIntensity = useAppearanceSettingsStore((s) => s.blurIntensity)
  const compactMode = useAppearanceSettingsStore((s) => s.compactMode)
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const windowActive = useWindowActive()

  // Keeps <html data-theme="..." data-palette="..."> in sync with the
  // store so `theme.css`'s `[data-theme][data-palette]` selectors apply
  // globally, including to things mounted outside the React tree (e.g.
  // native context menus added in later epics).
  useEffect(() => {
    const root = document.documentElement

    // Skip the transition on the very first render (restoring the
    // persisted theme on startup) — there's nothing to crossfade *from*
    // yet, so animating it would just be a pointless flash timed with
    // the rest of the startup sequence.
    if (isFirstRender.current) {
      isFirstRender.current = false
      root.setAttribute('data-theme', mode)
      root.setAttribute('data-palette', palette)
      return
    }

    const updateTheme = () => {
      root.setAttribute('data-theme', mode)
      root.setAttribute('data-palette', palette)
    }
    const documentWithViewTransition = document as ThemeTransitionDocument

    // View Transitions cross-fade compositor snapshots instead of asking
    // every descendant to animate background, shadow, SVG, and text
    // properties independently. Keep the CSS fallback for WebViews that
    // do not expose the API.
    if (documentWithViewTransition.startViewTransition && !reduceMotion) {
      const transition = documentWithViewTransition.startViewTransition(updateTheme)
      return () => {
        void transition.finished.catch(() => undefined)
      }
    }

    root.classList.add('theme-transitioning')
    updateTheme()
    const timer = setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, THEME_TRANSITION_MS)

    return () => {
      clearTimeout(timer)
      root.classList.remove('theme-transitioning')
    }
  }, [mode, palette, reduceMotion])

  // `--nx-blur-intensity` drives `.glass-panel`'s backdrop-filter (see
  // `styles/effects.css`); `data-compact` drives the root font-size
  // shrink in `theme.css`. Both are plain CSS custom
  // property/attribute reads, so — like `data-theme` above — they reach
  // anything on the page, not just React-rendered elements.
  useEffect(() => {
    document.documentElement.style.setProperty('--nx-blur-intensity', `${blurIntensity}px`)
  }, [blurIntensity])

  useEffect(() => {
    document.documentElement.setAttribute('data-compact', String(compactMode))
  }, [compactMode])

  // `MotionConfig reducedMotion` (in `app/providers.tsx`) handles every
  // Framer Motion component, but the ambient background blobs, the
  // glow-pulse breathing effect, and the theme-switch crossfade itself
  // are plain CSS `animation`/`transition`, outside Framer Motion's
  // reach — this attribute is what `effects.css`/`ambient.css` key off
  // of to stop those too.
  useEffect(() => {
    document.documentElement.setAttribute('data-reduce-motion', String(reduceMotion))
  }, [reduceMotion])

  // WebView2 keeps an unfocused Tauri window visible, which means CSS
  // animations are not automatically throttled like a hidden browser tab.
  // This attribute lets the stylesheet remove the expensive compositor work
  // immediately, while Live Covers use the same signal to release decoders.
  useEffect(() => {
    document.documentElement.setAttribute('data-window-active', String(windowActive))
  }, [windowActive])

  const ambientBackground = useAppearanceSettingsStore((s) => s.ambientBackground)
  useEffect(() => {
    document.documentElement.setAttribute('data-ambient-enabled', String(ambientBackground))
  }, [ambientBackground])

  const gpuEcoMode = useAppearanceSettingsStore((s) => s.gpuEcoMode)
  useEffect(() => {
    document.documentElement.setAttribute('data-gpu-eco', String(gpuEcoMode))
  }, [gpuEcoMode])

  const fpsLimit60 = useAppearanceSettingsStore((s) => s.fpsLimit60)
  useEffect(() => {
    setFpsLimitEnabled(fpsLimit60)
  }, [fpsLimit60])

  const fontFamily = useAppearanceSettingsStore((s) => s.fontFamily)
  useEffect(() => {
    document.documentElement.setAttribute('data-font', fontFamily || 'sora')
  }, [fontFamily])

  // Strip the last "this is a web page" tells so the app behaves like a
  // native Windows program: no browser context menu (except in text
  // fields, where cut/copy/paste is genuinely useful — the app's own
  // context menus are separate React components and unaffected), and
  // none of the browser accelerators (reload/devtools/print) that make
  // no sense in an installed desktop app.
  useEffect(() => {
    const isEditable = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      target.closest('input, textarea, [contenteditable="true"]') !== null

    const onContextMenu = (event: MouseEvent) => {
      if (!isEditable(event.target)) event.preventDefault()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const browserShortcut =
        key === 'f5' ||
        key === 'f12' ||
        (event.ctrlKey && (key === 'r' || key === 'p')) ||
        (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key))
      if (browserShortcut) event.preventDefault()
    }

    window.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [])

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

export default App
