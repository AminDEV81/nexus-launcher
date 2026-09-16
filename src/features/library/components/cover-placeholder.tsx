import { Gamepad2, Sparkles } from 'lucide-react'

// Simple string hash to pick consistent vibrant gradient tones
function getHashHue(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash) % 360
}

/**
 * Modern artistic placeholder for games before or without cover artwork.
 * Generates a unique, elegant ambient gradient tone per game name.
 */
export function CoverPlaceholder({ name }: { name: string }) {
  const hue = getHashHue(name)
  const color1 = `hsl(${hue}, 65%, 22%)`
  const color2 = `hsl(${(hue + 45) % 360}, 60%, 12%)`
  const accentTone = `hsl(${hue}, 80%, 65%)`

  return (
    <div
      className="relative flex size-full select-none flex-col items-center justify-between overflow-hidden p-4 text-center"
      style={{
        background: `radial-gradient(circle at 70% 30%, ${color1}, ${color2} 80%)`,
      }}
    >
      {/* Decorative Grid Lines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Top Brand Watermark */}
      <div className="relative flex w-full items-center justify-between opacity-50">
        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white">NEXUS</span>
        <Sparkles className="size-3 text-white" />
      </div>

      {/* Center Emblem with Glow */}
      <div className="relative my-auto flex flex-col items-center gap-2">
        <div
          className="flex size-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-xl backdrop-blur-md transition-transform duration-300 group-hover:scale-110"
          style={{
            boxShadow: `0 0 24px -4px ${accentTone}40`,
          }}
        >
          <Gamepad2 className="size-7 text-white" strokeWidth={1.8} />
        </div>
      </div>

      {/* Bottom Game Title */}
      <div className="relative w-full">
        <span className="line-clamp-2 text-xs font-bold leading-tight text-white/90 drop-shadow-md">
          {name}
        </span>
      </div>
    </div>
  )
}
