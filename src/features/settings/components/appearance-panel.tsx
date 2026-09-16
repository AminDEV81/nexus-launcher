import { motion } from 'framer-motion'
import {
  Sun,
  Moon,
  Check,
  Volume2,
  VolumeX,
  Sliders,
  Sparkles,
  LayoutGrid,
  Layers,
  Minimize2,
  Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useThemeStore, useActivePalette, PALETTES } from '@/store/theme-store'
import { useSoundStore } from '@/store/sound-store'
import { useAppearanceSettingsStore, AVAILABLE_FONTS } from '@/store/appearance-settings-store'
import type { FontFamilyId } from '@/store/appearance-settings-store'
import type { PaletteId } from '@/store/theme-store'

/** Individual typographic preview metadata for each supported launcher font */
const FONT_PREVIEWS: Record<
  FontFamilyId,
  {
    family: string
    headline: string
    specimen: string
    badge: string
  }
> = {
  sora: {
    family: "'Sora', system-ui, -apple-system, sans-serif",
    headline: 'NEXUS SYSTEM 2026',
    specimen: 'AaBbGg 0123456789 • Crisp Geometric Balanced',
    badge: 'Geometric',
  },
  rajdhani: {
    family: "'Rajdhani', 'Segoe UI', system-ui, sans-serif",
    headline: 'TACTICAL HUD // COMBAT READY',
    specimen: 'AaBbGg 0123456789 • Squared Gamer Cut',
    badge: 'Tactical HUD',
  },
  orbitron: {
    family: "'Orbitron', 'Trebuchet MS', system-ui, sans-serif",
    headline: 'CYBER DRIVE // PROTOCOL 9',
    specimen: 'AaBbGg 0123456789 • Futuristic Sci-Fi Core',
    badge: 'Sci-Fi Display',
  },
  chakra: {
    family: "'Chakra Petch', 'Impact', system-ui, sans-serif",
    headline: 'MECHA WARP // CORE ENGAGED',
    specimen: 'AaBbGg 0123456789 • 45° Angular Esports',
    badge: 'Esports Angular',
  },
  jakarta: {
    family: "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif",
    headline: 'Nexus Premium UI Interface',
    specimen: 'AaBbGg 0123456789 • Ultra Refined Modern',
    badge: 'Clean Minimalist',
  },
  jetbrains: {
    family: "'JetBrains Mono', 'Consolas', monospace",
    headline: 'CORE::EXEC_BOOSTER(fps: 60)',
    specimen: 'AaBbGg 0123456789 • Developer Monospace',
    badge: 'Monospace Terminal',
  },
  outfit: {
    family: "'Outfit', 'Montserrat', system-ui, sans-serif",
    headline: 'BOLD IMPACT GAMING',
    specimen: 'AaBbGg 0123456789 • High-Impact Punchy',
    badge: 'Bold Display',
  },
  russo: {
    family: "'Russo One', 'Impact', sans-serif",
    headline: 'HEAVY TITAN PROTOCOL',
    specimen: 'AaBbGg 0123456789 • Powerful Brutalist Armour',
    badge: 'Heavy Armoured',
  },
  audiowide: {
    family: "'Audiowide', cursive, sans-serif",
    headline: 'NEON SYNTH // OVERDRIVE',
    specimen: 'AaBbGg 0123456789 • Cyber Synth Waveforms',
    badge: 'Cyber Synth',
  },
  teko: {
    family: "'Teko', sans-serif",
    headline: 'CHAMPIONSHIP APEX LEAGUE',
    specimen: 'AaBbGg 0123456789 • High-Rise Esports Condensed',
    badge: 'Esports Tall',
  },
}

/** Swatch colors shown in the picker — mirrors the dark-mode accent values in theme.css */
const SWATCH_COLORS: Record<PaletteId, { hex: string; gradient: string }> = {
  violet: { hex: '#7c5cff', gradient: 'from-[#7c5cff] to-[#9d85ff]' },
  ocean: { hex: '#3b82f6', gradient: 'from-[#3b82f6] to-[#60a5fa]' },
  emerald: { hex: '#10b981', gradient: 'from-[#10b981] to-[#34d399]' },
  crimson: { hex: '#f43f5e', gradient: 'from-[#f43f5e] to-[#fb7185]' },
  amber: { hex: '#f59e0b', gradient: 'from-[#f59e0b] to-[#fbbf24]' },
  cyberpunk: { hex: '#ec4899', gradient: 'from-[#ec4899] to-[#f472b6]' },
  solaris: { hex: '#eab308', gradient: 'from-[#eab308] to-[#facc15]' },
  toxic: { hex: '#84cc16', gradient: 'from-[#84cc16] to-[#a3e635]' },
  aquamarine: { hex: '#06b6d4', gradient: 'from-[#06b6d4] to-[#22d3ee]' },
  amethyst: { hex: '#8b5cf6', gradient: 'from-[#8b5cf6] to-[#a78bfa]' },
  inferno: { hex: '#f97316', gradient: 'from-[#f97316] to-[#fb923c]' },
}

export function AppearancePanel() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const activePalette = useActivePalette()
  const setPalette = useThemeStore((s) => s.setPalette)
  const soundsEnabled = useSoundStore((s) => s.enabled)
  const setSoundsEnabled = useSoundStore((s) => s.setEnabled)

  const blurIntensity = useAppearanceSettingsStore((s) => s.blurIntensity)
  const setBlurIntensity = useAppearanceSettingsStore((s) => s.setBlurIntensity)
  const animationSpeed = useAppearanceSettingsStore((s) => s.animationSpeed)
  const setAnimationSpeed = useAppearanceSettingsStore((s) => s.setAnimationSpeed)
  const cardMinWidth = useAppearanceSettingsStore((s) => s.cardMinWidth)
  const setCardMinWidth = useAppearanceSettingsStore((s) => s.setCardMinWidth)
  const compactMode = useAppearanceSettingsStore((s) => s.compactMode)
  const setCompactMode = useAppearanceSettingsStore((s) => s.setCompactMode)
  const reduceMotion = useAppearanceSettingsStore((s) => s.reduceMotion)
  const fontFamily = useAppearanceSettingsStore((s) => s.fontFamily)
  const setFontFamily = useAppearanceSettingsStore((s) => s.setFontFamily)

  return (
    <div className="flex flex-col gap-6">
      {/* Theme Mode Selector Cards */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Sun className="size-4 text-accent" />
          <span className="text-sm font-bold tracking-tight text-text">Theme Mode</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Dark Mode Card */}
          <button
            type="button"
            onClick={() => setMode('dark')}
            className={cn(
              'group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200 shadow-sm',
              mode === 'dark'
                ? 'border-accent bg-accent/10 shadow-[0_4px_24px_color-mix(in_srgb,var(--color-accent)_15%,transparent)]'
                : 'border-border/80 bg-surface/70 hover:border-border hover:bg-surface-raised',
            )}
          >
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl shadow-xs transition-colors',
                    mode === 'dark' ? 'bg-accent text-white' : 'bg-surface-raised text-subtle',
                  )}
                >
                  <Moon className="size-4.5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-text">Dark Mode</div>
                  <div className="text-xs text-subtle">Deep obsidian & cyber glow</div>
                </div>
              </div>
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border transition-all',
                  mode === 'dark'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface',
                )}
              >
                {mode === 'dark' && <Check className="size-3" strokeWidth={3} />}
              </span>
            </div>

            {/* Miniature Dark UI Mockup */}
            <div className="mt-3.5 flex h-14 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0c0d12] p-2 shadow-inner">
              <div className="w-1/4 rounded-lg bg-white/5 p-1">
                <div className="h-1.5 w-full rounded-sm bg-accent/60" />
                <div className="mt-1 h-1 w-3/4 rounded-sm bg-white/20" />
              </div>
              <div className="flex-1 pl-2">
                <div className="flex gap-1.5">
                  <div className="h-8 flex-1 rounded-lg bg-white/10" />
                  <div className="h-8 flex-1 rounded-lg bg-white/10" />
                </div>
              </div>
            </div>
          </button>

          {/* Light Mode Card */}
          <button
            type="button"
            onClick={() => setMode('light')}
            className={cn(
              'group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200 shadow-sm',
              mode === 'light'
                ? 'border-accent bg-accent/10 shadow-[0_4px_24px_color-mix(in_srgb,var(--color-accent)_15%,transparent)]'
                : 'border-border/80 bg-surface/70 hover:border-border hover:bg-surface-raised',
            )}
          >
            <div className="flex w-full items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-9 items-center justify-center rounded-xl shadow-xs transition-colors',
                    mode === 'light' ? 'bg-accent text-white' : 'bg-surface-raised text-subtle',
                  )}
                >
                  <Sun className="size-4.5" />
                </span>
                <div>
                  <div className="text-sm font-bold text-text">Light Mode</div>
                  <div className="text-xs text-subtle">Clean daylight & high contrast</div>
                </div>
              </div>
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border transition-all',
                  mode === 'light'
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface',
                )}
              >
                {mode === 'light' && <Check className="size-3" strokeWidth={3} />}
              </span>
            </div>

            {/* Miniature Light UI Mockup */}
            <div className="mt-3.5 flex h-14 w-full overflow-hidden rounded-xl border border-black/10 bg-[#f4f5f9] p-2 shadow-inner">
              <div className="w-1/4 rounded-lg bg-black/5 p-1">
                <div className="h-1.5 w-full rounded-sm bg-accent" />
                <div className="mt-1 h-1 w-3/4 rounded-sm bg-black/20" />
              </div>
              <div className="flex-1 pl-2">
                <div className="flex gap-1.5">
                  <div className="h-8 flex-1 rounded-lg bg-white border border-black/5 shadow-xs" />
                  <div className="h-8 flex-1 rounded-lg bg-white border border-black/5 shadow-xs" />
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Accent Color Palettes */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/60 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <span className="text-sm font-bold text-text">
              Accent Palette ({mode === 'dark' ? 'Dark' : 'Light'})
            </span>
          </div>
          <span className="text-xs font-semibold text-accent capitalize">{activePalette}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {PALETTES.map((palette) => (
            <PaletteSwatch
              key={palette.id}
              id={palette.id}
              label={palette.label}
              active={activePalette === palette.id}
              onClick={() => setPalette(palette.id)}
            />
          ))}
        </div>
      </div>

      {/* Typography & Font Family */}
      <div className="flex flex-col gap-3.5 rounded-2xl border border-border/80 bg-surface/60 p-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/40 pb-3">
          <div className="flex items-center gap-2">
            <Type className="size-4 text-accent" />
            <span className="text-sm font-bold text-text">Typography &amp; UI Font</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">Active:</span>
            <span
              className="rounded-lg border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs font-bold text-accent"
              style={{ fontFamily: FONT_PREVIEWS[fontFamily || 'sora']?.family }}
            >
              {AVAILABLE_FONTS.find((f) => f.id === fontFamily)?.name ?? 'Sora'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-1">
          {AVAILABLE_FONTS.map((font) => {
            const isSelected = (fontFamily || 'sora') === font.id
            const preview = FONT_PREVIEWS[font.id]
            return (
              <button
                key={font.id}
                type="button"
                onClick={() => setFontFamily(font.id)}
                className={cn(
                  'group relative flex flex-col items-start rounded-xl border p-3.5 text-left transition-all duration-150 cursor-pointer',
                  isSelected
                    ? 'border-accent bg-accent/10 ring-1 ring-accent shadow-xs'
                    : 'border-border/70 bg-surface/60 hover:border-border hover:bg-surface-raised',
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-sm font-bold text-text group-hover:text-accent transition-colors truncate"
                      style={{ fontFamily: preview.family }}
                    >
                      {font.name}
                    </span>
                    <span className="shrink-0 rounded-md border border-border/60 bg-surface px-1.5 py-0.5 text-[9px] font-medium text-subtle">
                      {font.category}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="shrink-0 flex size-4.5 items-center justify-center rounded-full bg-accent text-white shadow-xs">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  )}
                </div>

                {/* Dedicated font preview specimen card */}
                <div
                  className="mt-2.5 flex w-full flex-col gap-1 rounded-lg border border-border/60 bg-surface/80 p-2.5 shadow-inner transition-colors group-hover:border-border group-hover:bg-surface"
                  data-font={font.id}
                  style={{ fontFamily: preview.family }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-black tracking-wide text-text">
                      {preview.headline}
                    </span>
                    <span className="text-[9px] font-bold text-accent/80 uppercase tracking-wider">
                      {preview.badge}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-text/80 line-clamp-1">
                    {preview.specimen}
                  </div>
                </div>

                <div className="mt-2 text-[11px] text-muted leading-tight">{font.description}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Visual & Motion Tuning Sliders */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-surface/60 p-5 shadow-sm">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Sliders className="size-4 text-accent" />
          <span className="text-sm font-bold text-text">Visual & Motion Tuning</span>
        </div>

        <SettingsSlider
          icon={Layers}
          label="Glass Blur Intensity"
          value={blurIntensity}
          min={0}
          max={40}
          step={2}
          onChange={setBlurIntensity}
          formatValue={(value) => `${value}px`}
          description="Controls Gaussian blur intensity across modal overlays, title bar, and frosted panes."
        />

        <div className="border-t border-border/40" />

        <SettingsSlider
          icon={Sparkles}
          label="Animation Speed Multiplier"
          value={animationSpeed}
          min={0.5}
          max={2}
          step={0.1}
          onChange={setAnimationSpeed}
          formatValue={(value) => `${value.toFixed(1)}x`}
          description="Adjusts UI spring and transition speeds. Lower values feel lightning snappy."
          disabled={reduceMotion}
          disabledHint="Disabled while Reduce Motion is enabled in Performance settings."
        />

        <div className="border-t border-border/40" />

        <SettingsSlider
          icon={LayoutGrid}
          label="Library Grid Card Density"
          value={cardMinWidth}
          min={160}
          max={300}
          step={10}
          onChange={setCardMinWidth}
          formatValue={() => ''}
          formatEnds={['Compact (More Covers)', 'Spacious (Hero Detail)']}
          description="Minimum cover poster width before library tiles wrap to the next row."
        />
      </div>

      {/* Interface Toggles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Compact Mode Card */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm transition-all hover:bg-surface-raised">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-surface-raised text-subtle shadow-xs">
              <Minimize2 className="size-4.5" />
            </span>
            <div>
              <div className="text-sm font-bold text-text">Compact Density</div>
              <div className="text-xs text-subtle">Smaller paddings and tighter typography</div>
            </div>
          </div>
          <Switch checked={compactMode} onChange={setCompactMode} ariaLabel="Compact Mode" />
        </div>

        {/* UI Sounds Card */}
        <div className="flex items-center justify-between rounded-2xl border border-border/80 bg-surface/70 p-4 shadow-sm transition-all hover:bg-surface-raised">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-xl shadow-xs transition-colors',
                soundsEnabled ? 'bg-accent/15 text-accent' : 'bg-surface-raised text-subtle',
              )}
            >
              {soundsEnabled ? <Volume2 className="size-4.5" /> : <VolumeX className="size-4.5" />}
            </span>
            <div>
              <div className="text-sm font-bold text-text">Cybernetic Audio</div>
              <div className="text-xs text-subtle">Startup chime, clicks, and booster cues</div>
            </div>
          </div>
          <Switch
            checked={soundsEnabled}
            onChange={setSoundsEnabled}
            ariaLabel="UI Sounds"
            iconOn={Volume2}
            iconOff={VolumeX}
          />
        </div>
      </div>
    </div>
  )
}

function SettingsSlider({
  icon: Icon,
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  formatEnds,
  description,
  disabled,
  disabledHint,
}: {
  icon?: typeof Layers
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  formatValue: (value: number) => string
  formatEnds?: [string, string]
  description: string
  disabled?: boolean
  disabledHint?: string
}) {
  const percent = ((value - min) / (max - min)) * 100
  const readout = formatEnds ? (percent < 50 ? formatEnds[0] : formatEnds[1]) : formatValue(value)

  return (
    <div className={cn('flex flex-col gap-2', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="size-4 text-accent" />}
          <span className="text-xs font-bold text-text">{label}</span>
        </div>
        <span className="rounded-lg border border-accent/30 bg-accent/10 px-2 py-0.5 font-mono text-xs font-bold text-accent">
          {readout}
        </span>
      </div>

      <div className="relative flex items-center py-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-accent disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${percent}%, var(--color-surface-raised) ${percent}%)`,
          }}
        />
      </div>

      <p className="text-xs text-muted">{disabled && disabledHint ? disabledHint : description}</p>
    </div>
  )
}

function Switch({
  checked,
  onChange,
  ariaLabel,
  iconOn: IconOn,
  iconOff: IconOff,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  ariaLabel: string
  iconOn?: typeof Volume2
  iconOff?: typeof Volume2
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 overflow-hidden rounded-full border transition-colors duration-200 shadow-xs',
        checked ? 'border-accent bg-accent' : 'border-border/80 bg-surface-raised',
      )}
      style={
        checked
          ? { boxShadow: '0 0 10px color-mix(in srgb, var(--color-accent) 35%, transparent)' }
          : undefined
      }
    >
      <motion.span
        className="absolute top-1 flex size-5 items-center justify-center rounded-full bg-white shadow-sm"
        animate={{ left: checked ? 24 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      >
        {IconOn && IconOff ? (
          checked ? (
            <IconOn className="size-3 text-accent" strokeWidth={2.5} />
          ) : (
            <IconOff className="size-3 text-subtle" strokeWidth={2.5} />
          )
        ) : null}
      </motion.span>
    </button>
  )
}

function PaletteSwatch({
  id,
  label,
  active,
  onClick,
}: {
  id: PaletteId
  label: string
  active: boolean
  onClick: () => void
}) {
  const swatch = SWATCH_COLORS[id]

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex items-center gap-2.5 rounded-xl border px-3 py-2 transition-all duration-200 shadow-xs',
        active
          ? 'border-accent bg-accent/15 shadow-sm'
          : 'border-border/80 bg-surface hover:border-border hover:bg-surface-raised',
      )}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full shadow-xs transition-transform',
          active && 'scale-110 ring-2 ring-white ring-offset-1 ring-offset-bg',
        )}
        style={{ backgroundColor: swatch.hex }}
      >
        {active && <Check className="size-3 text-white" strokeWidth={3} />}
      </span>
      <span className={cn('text-xs font-bold capitalize', active ? 'text-accent' : 'text-text')}>
        {label}
      </span>
    </button>
  )
}

export { Switch, SettingsSlider }
