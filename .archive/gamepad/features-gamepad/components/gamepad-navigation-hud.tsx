import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGamepad } from '../hooks/use-gamepad'
import { gamepadNavigator } from '../core/gamepad-navigator'
import { resolveNavigationContext } from '../core/gamepad-navigation-context'
import { ControllerGlyph } from './controller-glyph'

export function GamepadNavigationHud() {
  const { settings, controllers, activeGlyphType } = useGamepad()
  const [visible, setVisible] = useState(false)
  const [context, setContext] = useState(resolveNavigationContext())

  useEffect(() => {
    if (!settings.navigationEnabled || !settings.showNavigationHud || controllers.length === 0) {
      setVisible(false)
      return
    }

    let hideTimer: ReturnType<typeof setTimeout> | null = null

    const checkModality = () => {
      const modality = gamepadNavigator.getModality()
      if (modality === 'gamepad') {
        setVisible(true)
        setContext(resolveNavigationContext())

        if (hideTimer) clearTimeout(hideTimer)
        hideTimer = setTimeout(() => {
          setVisible(false)
        }, 5000)
      } else {
        setVisible(false)
      }
    }

    const interval = setInterval(checkModality, 500)
    return () => {
      clearInterval(interval)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [settings.navigationEnabled, settings.showNavigationHud, controllers.length])

  if (!settings.navigationEnabled || !settings.showNavigationHud || controllers.length === 0) {
    return null
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
          className="pointer-events-none fixed bottom-4 right-6 z-50 flex items-center gap-4 rounded-full border border-border/80 bg-surface/90 px-4 py-2 text-xs font-medium text-text shadow-2xl backdrop-blur-md"
        >
          {context === 'modal' ? (
            <>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="south" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Confirm</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="east" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Close</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="south" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Select / Play</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="east" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Back</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="west" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Action</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ControllerGlyph button="north" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Search</span>
              </div>
              <div className="hidden items-center gap-1.5 sm:flex">
                <ControllerGlyph button="l1" controllerType={activeGlyphType} size="sm" />
                <ControllerGlyph button="r1" controllerType={activeGlyphType} size="sm" />
                <span className="text-subtle">Switch Tabs</span>
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
