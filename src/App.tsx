import { useEffect, useRef } from 'react'
import { RouterProvider } from 'react-router-dom'
import { AppProviders } from './app/providers'
import { router } from './app/router'
import { useThemeStore, useActivePalette } from './store/theme-store'
import { useAppearanceSettingsStore } from './store/appearance-settings-store'
import { useWindowActive } from './hooks/use-window-active'
import { setFpsLimitEnabled } from './lib/fps-limiter'
import { InputContextMenu } from './components/ui/input-context-menu'

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

  useEffect(() => {
    const root = document.documentElement

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

  useEffect(() => {
    document.documentElement.style.setProperty('--nx-blur-intensity', `${blurIntensity}px`)
  }, [blurIntensity])

  useEffect(() => {
    document.documentElement.setAttribute('data-compact', String(compactMode))
  }, [compactMode])

  useEffect(() => {
    document.documentElement.setAttribute('data-reduce-motion', String(reduceMotion))
  }, [reduceMotion])

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
    const activeFont = fontFamily || 'sora'
    document.documentElement.setAttribute('data-font', activeFont)

    if (activeFont === 'sora') return
    const loadOptionalFonts = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      if (document.getElementById('nx-optional-google-fonts')) return
      const link = document.createElement('link')
      link.id = 'nx-optional-google-fonts'
      link.rel = 'stylesheet'
      link.href =
        'https://fonts.googleapis.com/css2?family=Audiowide&family=Chakra+Petch:ital,wght@0,300;0,400;0,500;0,600;0,700;1,700&family=JetBrains+Mono:wght@300;400;500;600;700;800&family=Orbitron:wght@400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Rajdhani:wght@300;400;500;600;700&family=Russo+One&family=Teko:wght@300;400;500;600;700&display=swap'
      document.head.appendChild(link)
    }
    loadOptionalFonts()
    window.addEventListener('online', loadOptionalFonts)
    return () => window.removeEventListener('online', loadOptionalFonts)
  }, [fontFamily])

  const fontWeight = useAppearanceSettingsStore((s) => s.fontWeight)
  useEffect(() => {
    document.documentElement.setAttribute('data-font-weight', fontWeight || 'regular')
  }, [fontWeight])

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
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
      <InputContextMenu />
    </AppProviders>
  )
}

export default App
