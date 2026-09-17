import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAnimationSpeed } from '@/hooks/use-animation-speed'
import { cn } from '@/lib/utils'

interface NexusCyberMascotProps {
  className?: string
}

/**
 * Ultra-detailed, interactive Cyber Mascot ("Nexus Bot NX-01")
 * designed for the close/exit confirmation dialog.
 *
 * Rich Details & Silky Smooth Hover Transitions:
 * - Fluid crossfade & morphing between idle pupil gaze and cheerful holographic smile
 * - Dual counter-rotating holographic orbital gyroscope rings with cardinal tech notches
 * - High-tech mecha chassis with responsive side ear pods & pulsing acoustic grilles
 * - Top aerodynamic mecha crest with glowing dual photon antennas & center crystal beacon
 * - Curved gloss-reflection 3D glass visor with animated scanlines, hex lattice & micro-HUD
 * - Smoothly crossfading 5-band digital speech equalizer mouth into curved glowing smile waveform
 * - Permanently mounted, softly fading holographic blush nodes
 * - Floating mecha collar with dual-ring rotating Quantum Arc Reactor & anti-grav thruster plumes
 * - Dynamic HUD focus brackets that subtly lock on hover
 * - Interactive telemetry status badge that greets the user smoothly
 * - 100% theme-harmonized using var(--nx-accent)
 */
export function NexusCyberMascot({ className }: NexusCyberMascotProps) {
  const speed = useAnimationSpeed()
  const [isHovered, setIsHovered] = useState(false)
  const [isWinking, setIsWinking] = useState(false)

  const handleMascotClick = () => {
    setIsWinking(true)
    setTimeout(() => setIsWinking(false), 900)
  }

  // Smooth easing curve for all state transitions
  const smoothTransition = { duration: 0.45 * speed, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <div
      className={cn('relative flex items-center justify-center select-none py-2', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleMascotClick}
    >
      {/* 1. Deep Volumetric Ambient Theme Glow */}
      <motion.div
        className="pointer-events-none absolute size-36 rounded-full blur-xl"
        style={{ backgroundColor: 'var(--nx-accent)' }}
        animate={{
          scale: isHovered ? 1.2 : 1,
          opacity: isHovered ? 0.45 : 0.25,
        }}
        transition={smoothTransition}
      />

      {/* 2. Outer Holographic Gyroscope Ring (Clockwise, CSS Accelerated) */}
      <div className="pointer-events-none absolute size-42 rounded-full border border-dashed border-accent/25 nx-spin-cw">
        {/* Orbital Satellite Node with Glow */}
        <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 size-3 rounded-full bg-accent shadow-[0_0_12px_var(--nx-accent)]" />
        {/* Secondary Orbit Node */}
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 size-2 rounded-full bg-accent/70" />
        {/* Cardinal Hash Marks */}
        <span className="absolute top-1/2 -left-1 -translate-y-1/2 h-2.5 w-0.5 bg-accent/50" />
        <span className="absolute top-1/2 -right-1 -translate-y-1/2 h-2.5 w-0.5 bg-accent/50" />
        {/* Micro Degree Angle Text */}
        <span className="absolute top-1 left-3 text-[6px] font-mono text-accent/40 select-none">
          045°
        </span>
        <span className="absolute bottom-1 right-3 text-[6px] font-mono text-accent/40 select-none">
          225°
        </span>
      </div>

      {/* 3. Middle Segmented Tactical Ring (Counter-Clockwise, CSS Accelerated) */}
      <div className="pointer-events-none absolute size-35 rounded-full border border-accent/20 [border-top-color:var(--nx-accent)] [border-bottom-color:transparent] nx-spin-ccw">
        <span className="absolute top-2 right-4 size-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]" />
        <span className="absolute bottom-2 left-4 size-1 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
      </div>

      {/* 4. Floating Holographic HUD Brackets (Soft Reticle Lock-On on Hover) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-60">
        <motion.div
          className="relative size-44"
          animate={{
            scale: isHovered ? 0.96 : 1,
            opacity: isHovered ? 0.9 : 0.6,
          }}
          transition={smoothTransition}
        >
          {/* Top Left Bracket */}
          <span className="absolute top-1 left-1 size-3.5 border-t-2 border-l-2 border-accent/50 rounded-tl-sm" />
          {/* Top Right Bracket */}
          <span className="absolute top-1 right-1 size-3.5 border-t-2 border-r-2 border-accent/50 rounded-tr-sm" />
          {/* Bottom Left Bracket */}
          <span className="absolute bottom-1 left-1 size-3.5 border-b-2 border-l-2 border-accent/50 rounded-bl-sm" />
          {/* Bottom Right Bracket */}
          <span className="absolute bottom-1 right-1 size-3.5 border-b-2 border-r-2 border-accent/50 rounded-br-sm" />
        </motion.div>
      </div>

      {/* 5. Main Floating Mascot Body Assembly */}
      {/* Outer Spring Lift Container (Provides smooth physics spring on hover) */}
      <motion.div
        className="relative z-10 flex flex-col items-center cursor-pointer"
        animate={{
          y: isHovered ? -5 : 0,
          scale: isHovered ? 1.04 : 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 280,
          damping: 24,
        }}
      >
        {/* Inner Continuous Floating Bob Loop (Hardware accelerated CSS) */}
        <div className="flex flex-col items-center nx-mascot-bob">
          {/* Top Antenna Array & Aerodynamic Mecha Fin */}
          <div className="flex flex-col items-center">
            {/* Dual Satellite Beacon Emitters */}
            <div className="flex items-center gap-3">
              {/* Left Antenna Tip */}
              <span className="size-1.5 rounded-full bg-accent/80 shadow-[0_0_6px_var(--nx-accent)]" />

              {/* Center Main Crystal Core Beacon */}
              <motion.div
                className="size-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--nx-accent)]"
                animate={{
                  scale: isHovered ? 1.25 : 1,
                  opacity: isHovered ? 1 : 0.85,
                }}
                transition={smoothTransition}
              />

              {/* Right Antenna Tip */}
              <span className="size-1.5 rounded-full bg-accent/80 shadow-[0_0_6px_var(--nx-accent)]" />
            </div>

            {/* Center Mast Fin with Metallic Notch */}
            <div className="relative flex flex-col items-center">
              <div className="h-2.5 w-1 bg-gradient-to-b from-accent via-accent/70 to-border" />
              <div className="h-1 w-3 rounded-t-sm bg-border/80 border-t border-accent/40" />
            </div>
          </div>

          {/* Head Chassis with Side Ear Pods Assembly */}
          <div className="relative flex items-center justify-center">
            {/* Left Cyber Ear Pod / Audio Thruster */}
            <motion.div
              className="absolute -left-3.5 z-0 flex flex-col items-center justify-center"
              animate={{ x: isHovered ? -2 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="h-9 w-3.5 rounded-l-xl border-l border-y border-border/80 bg-surface/95 shadow-md flex items-center justify-center overflow-hidden">
                {/* Concentric Glow Grille */}
                <div className="size-2 rounded-full border border-accent/60 bg-accent/30 shadow-xs" />
              </div>
              {/* Mini Winglet Fin */}
              <div className="h-2.5 w-1.5 -ml-1.5 bg-accent/30 rounded-l-xs border-l border-accent/50" />
            </motion.div>

            {/* Right Cyber Ear Pod / Audio Thruster */}
            <motion.div
              className="absolute -right-3.5 z-0 flex flex-col items-center justify-center"
              animate={{ x: isHovered ? 2 : 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="h-9 w-3.5 rounded-r-xl border-r border-y border-border/80 bg-surface/95 shadow-md flex items-center justify-center overflow-hidden">
                {/* Concentric Glow Grille */}
                <div className="size-2 rounded-full border border-accent/60 bg-accent/30 shadow-xs" />
              </div>
              {/* Mini Winglet Fin */}
              <div className="h-2.5 w-1.5 -mr-1.5 bg-accent/30 rounded-r-xs border-r border-accent/50" />
            </motion.div>

            {/* Main Mecha Head Chassis */}
            <div className="relative z-10 flex size-21 items-center justify-center rounded-2xl border border-border/90 bg-surface shadow-elevated overflow-hidden">
              {/* Top Corner Chamfer Plate Accents */}
              <span className="absolute top-1 left-1.5 size-1.5 border-t border-l border-accent/40 rounded-tl-xs" />
              <span className="absolute top-1 right-1.5 size-1.5 border-t border-r border-accent/40 rounded-tr-xs" />
              <span className="absolute bottom-1 left-1.5 size-1.5 border-b border-l border-accent/40 rounded-bl-xs" />
              <span className="absolute bottom-1 right-1.5 size-1.5 border-b border-r border-accent/40 rounded-br-xs" />

              {/* Subtle Metallic Seam Divider */}
              <div className="pointer-events-none absolute inset-x-0 top-1 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />

              {/* Dark Curved Glass Visor Screen */}
              <div className="relative flex h-13 w-17.5 items-center justify-center rounded-xl border border-black/50 bg-black/95 shadow-inner px-2 overflow-hidden">
                {/* Curved Gloss Glass Reflection Arc */}
                <div className="pointer-events-none absolute -top-5 -left-5 size-14 rounded-full bg-gradient-to-br from-white/20 via-white/5 to-transparent blur-[0.5px]" />

                {/* Holographic Scanline Sweep */}
                <motion.div
                  className="pointer-events-none absolute inset-x-0 h-1 bg-gradient-to-b from-transparent via-accent/35 to-transparent"
                  animate={{ y: [-18, 42] }}
                  transition={{
                    duration: 2.2 * speed,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />

                {/* Visor Top Mini HUD Elements */}
                <div className="pointer-events-none absolute top-1 inset-x-2 flex items-center justify-between text-[7px] font-mono text-accent/60 leading-none">
                  {/* Micro Battery Pill */}
                  <div className="flex items-center gap-0.5">
                    <span className="h-1 w-1.5 rounded-xs bg-accent/80" />
                    <span className="h-1 w-1.5 rounded-xs bg-accent/80" />
                    <span className="h-1 w-1.5 rounded-xs bg-accent/40" />
                  </div>
                  {/* Live Sync Status */}
                  <span className="tracking-widest uppercase font-bold text-[6.5px]">
                    SYNC 100%
                  </span>
                </div>

                {/* Center Visor Digital Face Assembly */}
                <div className="relative z-10 flex flex-col items-center justify-center gap-1 mt-1.5 w-full">
                  {/* Eyes Row */}
                  <div className="flex w-full items-center justify-around px-1">
                    {/* Left Eye */}
                    <motion.div
                      className="relative flex h-3.5 w-4 items-center justify-center"
                      animate={
                        isWinking
                          ? { scaleY: 0.1, scaleX: 1.15 }
                          : isHovered
                            ? { scaleY: [1, 1.05, 1] }
                            : {
                                scaleY: [1, 1, 0.08, 1, 1, 1, 0.08, 1],
                                scaleX: [1, 1, 1.12, 1, 1, 1, 1.12, 1],
                              }
                      }
                      transition={
                        isWinking
                          ? { duration: 0.22 * speed }
                          : isHovered
                            ? { duration: 2 * speed, repeat: Infinity, ease: 'easeInOut' }
                            : {
                                duration: 4.8 * speed,
                                repeat: Infinity,
                                times: [0, 0.45, 0.48, 0.52, 0.85, 0.88, 0.92, 1],
                              }
                      }
                    >
                      {/* Idle Eye: Glowing LED Iris & Specular Pupil */}
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{
                          opacity: isHovered ? 0 : 1,
                          scale: isHovered ? 0.6 : 1,
                          y: isHovered ? -1.5 : 0,
                        }}
                        transition={smoothTransition}
                      >
                        <div className="relative flex size-3.5 items-center justify-center rounded-full bg-accent shadow-[0_0_12px_var(--nx-accent)]">
                          {/* Outer Iris Ring */}
                          <div className="size-2 rounded-full bg-black/45 flex items-center justify-center">
                            {/* Inner Bright Core */}
                            <div className="size-1 rounded-full bg-accent" />
                          </div>
                          {/* Specular Highlight */}
                          <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-white opacity-95 shadow-[0_0_3px_#fff]" />
                        </div>
                      </motion.div>

                      {/* Hover Eye: Cheerful Curved Holographic Arc Eye */}
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        animate={{
                          opacity: isHovered ? 1 : 0,
                          scale: isHovered ? 1 : 0.6,
                          y: isHovered ? 0 : 1.5,
                        }}
                        transition={smoothTransition}
                      >
                        <div className="relative h-3 w-4 rounded-t-full border-t-[2.5px] border-x-[1.8px] border-accent shadow-[0_0_12px_var(--nx-accent)]">
                          <span className="absolute -bottom-0.5 -left-0.5 size-1 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
                          <span className="absolute -bottom-0.5 -right-0.5 size-1 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
                        </div>
                      </motion.div>
                    </motion.div>

                    {/* Center Nose Sensor Bridge */}
                    <motion.div
                      className="flex flex-col items-center gap-0.5"
                      animate={{ opacity: [0.4, 0.85, 0.4] }}
                      transition={{ duration: 2 * speed, repeat: Infinity }}
                    >
                      <span className="size-0.5 rounded-full bg-accent" />
                      <span className="size-0.5 rounded-full bg-accent/60" />
                    </motion.div>

                    {/* Right Eye */}
                    <motion.div
                      className="relative flex h-3.5 w-4 items-center justify-center"
                      animate={
                        isHovered
                          ? { scaleY: [1, 1.05, 1] }
                          : {
                              scaleY: [1, 1, 0.08, 1, 1, 1, 0.08, 1],
                              scaleX: [1, 1, 1.12, 1, 1, 1, 1.12, 1],
                            }
                      }
                      transition={
                        isHovered
                          ? { duration: 2 * speed, repeat: Infinity, ease: 'easeInOut' }
                          : {
                              duration: 4.8 * speed,
                              repeat: Infinity,
                              times: [0, 0.45, 0.48, 0.52, 0.85, 0.88, 0.92, 1],
                            }
                      }
                    >
                      {/* Idle Eye: Glowing LED Iris & Specular Pupil */}
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        animate={{
                          opacity: isHovered ? 0 : 1,
                          scale: isHovered ? 0.6 : 1,
                          y: isHovered ? -1.5 : 0,
                        }}
                        transition={smoothTransition}
                      >
                        <div className="relative flex size-3.5 items-center justify-center rounded-full bg-accent shadow-[0_0_12px_var(--nx-accent)]">
                          {/* Outer Iris Ring */}
                          <div className="size-2 rounded-full bg-black/45 flex items-center justify-center">
                            {/* Inner Bright Core */}
                            <div className="size-1 rounded-full bg-accent" />
                          </div>
                          {/* Specular Highlight */}
                          <span className="absolute top-0.5 right-0.5 size-1 rounded-full bg-white opacity-95 shadow-[0_0_3px_#fff]" />
                        </div>
                      </motion.div>

                      {/* Hover Eye: Cheerful Curved Holographic Arc Eye */}
                      <motion.div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        animate={{
                          opacity: isHovered ? 1 : 0,
                          scale: isHovered ? 1 : 0.6,
                          y: isHovered ? 0 : 1.5,
                        }}
                        transition={smoothTransition}
                      >
                        <div className="relative h-3 w-4 rounded-t-full border-t-[2.5px] border-x-[1.8px] border-accent shadow-[0_0_12px_var(--nx-accent)]">
                          <span className="absolute -bottom-0.5 -left-0.5 size-1 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
                          <span className="absolute -bottom-0.5 -right-0.5 size-1 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
                        </div>
                      </motion.div>
                    </motion.div>
                  </div>

                  {/* Animated Mouth Area with Seamless Crossfade */}
                  <div className="relative flex items-center justify-center h-2.5 w-7 mt-0.5">
                    {/* Idle State: 5-band Pulsing Speech Spectrum Equalizer */}
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center gap-0.5"
                      animate={{
                        opacity: isHovered ? 0 : 1,
                        scale: isHovered ? 0.7 : 1,
                        y: isHovered ? 2 : 0,
                      }}
                      transition={smoothTransition}
                    >
                      <span className="w-0.5 h-1 rounded-full bg-accent/70" />
                      <span className="w-0.5 h-1.5 rounded-full bg-accent/90" />
                      <span className="w-0.5 h-2 rounded-full bg-accent" />
                      <span className="w-0.5 h-1.5 rounded-full bg-accent/90" />
                      <span className="w-0.5 h-1 rounded-full bg-accent/70" />
                    </motion.div>

                    {/* Hover State: Curved Digital Smile Waveform */}
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                      animate={{
                        opacity: isHovered ? 1 : 0,
                        scale: isHovered ? 1 : 0.7,
                        y: isHovered ? 0 : -2,
                      }}
                      transition={smoothTransition}
                    >
                      <div className="relative h-2 w-5 rounded-b-full border-b-[2px] border-x-[1.5px] border-accent shadow-[0_0_10px_var(--nx-accent)]">
                        <span className="absolute -top-0.5 -left-0.5 size-1 rounded-full bg-accent shadow-[0_0_3px_var(--nx-accent)]" />
                        <span className="absolute -top-0.5 -right-0.5 size-1 rounded-full bg-accent shadow-[0_0_3px_var(--nx-accent)]" />
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Holographic Cheek Blushes (Silky Smooth Fade in/out) */}
                <motion.div
                  className="pointer-events-none absolute bottom-1.5 inset-x-2.5 flex justify-between"
                  animate={{
                    opacity: isHovered ? 0.85 : 0,
                    scale: isHovered ? 1 : 0.5,
                    y: isHovered ? 0 : 2,
                  }}
                  transition={{ duration: 0.45 * speed, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="size-1.5 rounded-full bg-pink-500/90 blur-[1px] shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
                  <span className="size-1.5 rounded-full bg-pink-500/90 blur-[1px] shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
                </motion.div>
              </div>

              {/* Bottom Microphone Array Dots */}
              <div className="absolute bottom-1.5 flex gap-1">
                <span className="size-0.5 rounded-full bg-muted/60" />
                <span className="size-0.5 rounded-full bg-accent shadow-[0_0_4px_var(--nx-accent)]" />
                <span className="size-0.5 rounded-full bg-muted/60" />
              </div>
            </div>
          </div>

          {/* Floating Mecha Collar & Arc Reactor Core Assembly */}
          <div className="relative mt-1 flex flex-col items-center">
            {/* Anti-Grav Collar Plate */}
            <div className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-border/80 bg-surface shadow-xs">
              {/* Left Micro Thruster */}
              <span className="size-1 rounded-full bg-accent/50" />

              {/* Center Quantum Arc Reactor Core (CSS accelerated) */}
              <div className="relative flex items-center justify-center">
                <div className="size-3.5 rounded-full border border-dashed border-accent nx-spin-fast" />
                <motion.div
                  className="absolute size-2 rounded-full bg-accent shadow-[0_0_8px_var(--nx-accent)]"
                  animate={{
                    scale: isHovered ? 1.25 : 1,
                    opacity: isHovered ? 1 : 0.8,
                  }}
                  transition={smoothTransition}
                />
              </div>

              {/* Right Micro Thruster */}
              <span className="size-1 rounded-full bg-accent/50" />
            </div>

            {/* Anti-Gravity Exhaust Plumes */}
            <div className="flex items-center gap-4 -mt-0.5 opacity-60">
              <span className="h-1.5 w-1 rounded-b-full bg-gradient-to-b from-accent/60 to-transparent blur-[0.5px]" />
              <span className="h-1.5 w-1 rounded-b-full bg-gradient-to-b from-accent/60 to-transparent blur-[0.5px]" />
            </div>
          </div>

          {/* Holographic Status Telemetry Badge with Smooth Label Crossfade */}
          <div className="mt-1 relative flex items-center justify-center rounded-full border border-border/60 bg-surface/70 px-2.5 py-0.5 text-[8.5px] font-mono tracking-wider font-bold shadow-2xs overflow-hidden">
            <span className="size-1 rounded-full bg-accent animate-ping mr-1.5 shrink-0" />
            <div className="relative h-3 w-23 flex items-center justify-center">
              {/* Idle Label */}
              <motion.span
                className="absolute text-muted whitespace-nowrap"
                animate={{
                  opacity: isHovered ? 0 : 1,
                  y: isHovered ? -4 : 0,
                }}
                transition={smoothTransition}
              >
                NX-01 // ACTIVE
              </motion.span>
              {/* Hover Label */}
              <motion.span
                className="absolute text-accent whitespace-nowrap"
                animate={{
                  opacity: isHovered ? 1 : 0,
                  y: isHovered ? 0 : 4,
                }}
                transition={smoothTransition}
              >
                NX-01 // READY ^_^
              </motion.span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
