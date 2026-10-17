import { motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'

/**
 * Wraps the active route in a lightweight, non-blocking entrance transition
 * keyed by `location.pathname`. Avoiding `AnimatePresence mode="wait"` around
 * React Router's outlet guarantees that route navigation (Library -> Hub ->
 * Downloads -> Stats, etc.) can never deadlock on an interrupted exit animation.
 */
export function AnimatedOutlet() {
  const location = useLocation()
  const speed = useAnimationSpeed()

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0.92, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: Math.min(0.16, 0.16 * speed), ease: [0.16, 1, 0.3, 1] }}
      className="h-full min-h-0 flex flex-col"
    >
      <Outlet />
    </motion.div>
  )
}
