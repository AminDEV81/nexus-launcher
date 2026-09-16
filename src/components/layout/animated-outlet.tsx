import { AnimatePresence, motion } from 'framer-motion'
import { useLocation, useOutlet } from 'react-router-dom'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

/**
 * Wraps whatever route is currently active in a fade + slight vertical
 * shift, keyed by pathname, so switching between sidebar sections feels
 * like a soft crossfade instead of an instant swap.
 *
 * `react-router-dom`'s `<Outlet />` alone can't do this: it renders the
 * new element in place immediately, giving `AnimatePresence` nothing to
 * transition *from*. Reading the current element via `useOutlet()` and
 * keying a `motion.div` on the pathname is what gives each route its own
 * enter/exit animation.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const element = useOutlet()
  const speed = useAnimationSpeed()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.2 * speed, ease: [0.16, 1, 0.3, 1] }}
        className="h-full min-h-0 flex flex-col"
      >
        {element}
      </motion.div>
    </AnimatePresence>
  )
}
