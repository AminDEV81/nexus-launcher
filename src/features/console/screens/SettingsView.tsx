import React, { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Gamepad2,
  Maximize2,
  Minus,
  Monitor,
  Moon,
  Palette,
  Plus,
  Sparkles,
  Sun,
  Volume2,
  Wand2,
} from 'lucide-react'
import { toast } from 'sonner'
import { computeRecommendedMonitorScale, useConsoleStore } from '../store/console-store'
import {
  CONSOLE_DARK_THEME_ORDER,
  CONSOLE_LIGHT_THEME_ORDER,
  CONSOLE_THEMES,
  type ConsoleThemeId,
} from '../theme/tokens'
import { consoleListMonitors, type ConsoleMonitorDto } from '@/services/console'
import { FocusScope, useFocusable } from '../nav/FocusScope'

const SCALE_PRESETS: Array<{
  id: string
  scale: number
  label: string
  sublabel: string
}> = [
  {
    id: 'compact_90',
    scale: 90,
    label: 'Compact (90%)',
    sublabel: '22"–24" High Density · More Covers',
  },
  {
    id: 'standard_100',
    scale: 100,
    label: 'Standard (100%)',
    sublabel: '24"–25" 1080p Balanced Fit',
  },
  {
    id: 'large_115',
    scale: 115,
    label: 'Large (115%)',
    sublabel: '27"–32" QHD · Bigger Covers & Text',
  },
  {
    id: 'xlarge_130',
    scale: 130,
    label: 'Extra Large (130%)',
    sublabel: '32"+ 4K / TV · Living-Room Scale',
  },
  {
    id: 'max_145',
    scale: 145,
    label: 'Maximum (145%)',
    sublabel: 'Big Screen · Ultra-Large Covers & UI',
  },
]

const ScalePresetButton: React.FC<{
  id: string
  label: string
  sublabel: string
  active: boolean
  isLightMode: boolean
  onSelect: () => void
}> = ({ id, label, sublabel, active, isLightMode, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `cfg_scale_preset_${id}`,
    scopeId: 'console_settings_scope',
    onConfirm: onSelect,
  })

  return (
    <button
      type="button"
      {...focusProps}
      className={`relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all outline-none cursor-pointer ${
        isFocused
          ? 'scale-[1.03] border-cyan-300 bg-cyan-400 text-slate-950 shadow-xl ring-2 ring-white'
          : active
            ? isLightMode
              ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
              : 'border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_20px_rgba(0,229,255,0.2)]'
            : isLightMode
              ? 'border-slate-300 bg-white/85 text-slate-800 hover:bg-white'
              : 'border-white/12 bg-white/[0.05] text-slate-200 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider">{label}</span>
        {active && (
          <span
            className={`flex size-5 items-center justify-center rounded-full ${
              isFocused
                ? 'bg-slate-950 text-cyan-300'
                : isLightMode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-cyan-400 text-slate-950'
            }`}
          >
            <Check className="size-3 stroke-[3]" />
          </span>
        )}
      </div>
      <p
        className={`mt-1.5 text-[0.72rem] leading-snug ${
          isFocused
            ? 'text-slate-800 font-semibold'
            : isLightMode
              ? 'text-slate-500'
              : 'text-slate-400'
        }`}
      >
        {sublabel}
      </p>
    </button>
  )
}

const ThemeSwatchCard: React.FC<{
  themeId: ConsoleThemeId
  selected: boolean
  isLightMode: boolean
  onSelect: () => void
}> = ({ themeId, selected, isLightMode, onSelect }) => {
  const tokens = CONSOLE_THEMES[themeId]
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id: `cfg_theme_card_${themeId}`,
    scopeId: 'console_settings_scope',
    onConfirm: onSelect,
  })

  return (
    <button
      type="button"
      {...focusProps}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-4 text-left transition-all outline-none cursor-pointer ${
        isFocused
          ? 'scale-[1.03] border-cyan-400 ring-4 ring-cyan-400/40 shadow-xl'
          : selected
            ? isLightMode
              ? 'border-indigo-600 bg-white ring-2 ring-indigo-500/35 shadow-md'
              : 'border-cyan-400/80 bg-white/10 ring-2 ring-cyan-400/30 shadow-lg'
            : isLightMode
              ? 'border-slate-300 bg-white/85 hover:bg-white hover:border-slate-400'
              : 'border-white/15 bg-white/5 hover:bg-white/10'
      }`}
    >
      {/* Top Color Bar Preview */}
      <div
        className="mb-3 flex h-8 w-full items-center justify-between rounded-xl border px-2.5 shadow-inner"
        style={{
          backgroundColor: tokens.bgPrimary,
          borderColor: tokens.isLight ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.14)',
        }}
      >
        <div className="flex items-center gap-1.5">
          {tokens.previewSwatches.map((hex, i) => (
            <span
              key={i}
              className="size-4 rounded-full border border-black/15 shadow-xs"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        <span
          className="rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider"
          style={{
            backgroundColor: tokens.defaultAccent,
            color: '#ffffff',
          }}
        >
          {tokens.isLight ? 'Daylight' : 'Dark'}
        </span>
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className={`text-sm font-extrabold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}
          >
            {tokens.name}
          </p>
          <p
            className={`text-[0.72rem] line-clamp-1 mt-0.5 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}
          >
            {tokens.subtitle}
          </p>
        </div>
        {selected && (
          <span
            className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
              isLightMode ? 'bg-indigo-600 text-white' : 'bg-cyan-400 text-slate-950'
            }`}
          >
            <Check className="size-3.5 stroke-[3]" />
          </span>
        )}
      </div>
    </button>
  )
}

const SettingRowButton: React.FC<{
  id: string
  title: string
  subtitle: string
  valueLabel: string
  isLightMode: boolean
  onCycle: () => void
}> = ({ id, title, subtitle, valueLabel, isLightMode, onCycle }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_settings_scope',
    onConfirm: onCycle,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex w-full items-center justify-between gap-8 rounded-2xl border px-6 py-4 text-left outline-none transition-all duration-150 cursor-pointer ${
        isFocused
          ? 'scale-[1.015] border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
          : isLightMode
            ? 'border-slate-300/90 bg-white/90 text-slate-900 hover:bg-white shadow-xs'
            : 'border-white/12 bg-white/[0.06] text-white hover:bg-white/10'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[1.05rem] font-extrabold">{title}</p>
        <p
          className={`mt-0.5 text-[0.8rem] ${
            isFocused ? 'text-slate-800' : isLightMode ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {subtitle}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-xl px-3.5 py-1.5 text-[0.82rem] font-extrabold uppercase ${
          isFocused
            ? 'bg-slate-950 text-cyan-300'
            : isLightMode
              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
        }`}
      >
        {valueLabel}
      </span>
    </button>
  )
}

export const SettingsView: React.FC = () => {
  const st = useConsoleStore()
  const [monitors, setMonitors] = useState<ConsoleMonitorDto[]>([])
  const isLightMode = Boolean(CONSOLE_THEMES[st.theme]?.isLight)

  useEffect(() => {
    consoleListMonitors()
      .then(setMonitors)
      .catch(() => {})
  }, [])

  const activeMonitor = monitors[st.monitorIndex] ?? monitors[0] ?? null
  const recommended = useMemo(
    () => computeRecommendedMonitorScale(activeMonitor?.width, activeMonitor?.height),
    [activeMonitor?.width, activeMonitor?.height],
  )

  const scaleDownFocus = useFocusable<HTMLButtonElement>({
    id: 'cfg_scale_step_down',
    scopeId: 'console_settings_scope',
    onConfirm: () => {
      const next = Math.max(80, st.uiScale - 5)
      void st.updateConsoleSetting('uiScale', next)
    },
  })

  const scaleUpFocus = useFocusable<HTMLButtonElement>({
    id: 'cfg_scale_step_up',
    scopeId: 'console_settings_scope',
    onConfirm: () => {
      const next = Math.min(150, st.uiScale + 5)
      void st.updateConsoleSetting('uiScale', next)
    },
  })

  const autoCalibrateFocus = useFocusable<HTMLButtonElement>({
    id: 'cfg_scale_auto_calibrate',
    scopeId: 'console_settings_scope',
    onConfirm: () => {
      void st.updateConsoleSetting('uiScale', recommended.scale)
      toast.success(
        `Calibrated cover & text size to ${recommended.scale}% for ${
          activeMonitor
            ? `${activeMonitor.name} (${activeMonitor.width}×${activeMonitor.height})`
            : recommended.profileLabel
        }`,
      )
    },
  })

  const toggleDaylightFocus = useFocusable<HTMLButtonElement>({
    id: 'cfg_toggle_daylight_mode',
    scopeId: 'console_settings_scope',
    onConfirm: () => {
      const nextTheme: ConsoleThemeId = isLightMode ? 'cyberpunk' : 'light'
      void st.updateConsoleSetting('theme', nextTheme)
      toast.success(`Switched to ${CONSOLE_THEMES[nextTheme].name}`)
    },
  })

  return (
    <FocusScope id="console_settings_scope" orientation="vertical" className="space-y-6 pb-16">
      <div>
        <h1
          className={`text-[2.2rem] font-black tracking-tight ${
            isLightMode ? 'text-slate-900' : 'text-white'
          }`}
        >
          Console Settings, Display Scale &amp; Themes
        </h1>
        <p className={`text-sm ${isLightMode ? 'text-slate-600' : 'text-slate-300/80'}`}>
          Customize game cover sizes, text scaling for your monitor or TV, Dark &amp; Light color
          palettes, and controller options.
        </p>
      </div>

      {/* Dedicated Display, Cover & Text Scaling Card */}
      <div
        className={`rounded-3xl border p-6 space-y-5 ${
          isLightMode
            ? 'border-slate-300 bg-white/90 shadow-sm'
            : 'border-cyan-400/25 bg-gradient-to-br from-[#0e172f]/90 via-[#0a1124]/90 to-[#080d1a]/90 shadow-xl'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-11 items-center justify-center rounded-2xl border ${
                isLightMode
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600'
                  : 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
              }`}
            >
              <Maximize2 className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className={`text-lg font-black ${isLightMode ? 'text-slate-900' : 'text-white'}`}
                >
                  Covers, Text &amp; Interface Size (Display Scale)
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums ${
                    isLightMode ? 'bg-indigo-600 text-white' : 'bg-cyan-400 text-slate-950'
                  }`}
                >
                  {st.uiScale}%
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>
                {activeMonitor
                  ? `Detected Display: ${activeMonitor.name} (${activeMonitor.width}×${activeMonitor.height}) · Recommended: ${recommended.profileLabel}`
                  : `Recommended for your screen: ${recommended.profileLabel}`}
              </p>
            </div>
          </div>

          {/* Fine-Grained -5% / +5% Stepper + Auto-Calibrate to Monitor Button */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              {...scaleDownFocus.focusProps}
              title="Decrease Cover & Text Size (-5%)"
              className={`flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-black transition-all cursor-pointer outline-none ${
                scaleDownFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLightMode
                    ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                    : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Minus className="size-3.5" />
              <span>Smaller (-5%)</span>
            </button>

            <input
              type="range"
              min={80}
              max={150}
              step={5}
              value={st.uiScale}
              onChange={(e) => {
                void st.updateConsoleSetting('uiScale', Number(e.target.value))
              }}
              className="w-28 accent-cyan-400 cursor-pointer"
              title={`Scale: ${st.uiScale}%`}
            />

            <button
              type="button"
              {...scaleUpFocus.focusProps}
              title="Increase Cover & Text Size (+5%)"
              className={`flex items-center gap-1 rounded-xl border px-3.5 py-2 text-xs font-black transition-all cursor-pointer outline-none ${
                scaleUpFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLightMode
                    ? 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
                    : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
              }`}
            >
              <Plus className="size-3.5" />
              <span>Larger (+5%)</span>
            </button>

            <button
              type="button"
              {...autoCalibrateFocus.focusProps}
              className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-black transition-all cursor-pointer outline-none ${
                autoCalibrateFocus.isFocused
                  ? 'scale-105 border-emerald-300 bg-emerald-400 text-slate-950 shadow-lg'
                  : isLightMode
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              }`}
            >
              <Wand2 className="size-3.5" />
              <span>Auto-Fit Monitor ({recommended.scale}%)</span>
            </button>
          </div>
        </div>

        {/* One-Click Monitor Size Presets */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {SCALE_PRESETS.map((preset) => (
            <ScalePresetButton
              key={preset.id}
              id={preset.id}
              label={preset.label}
              sublabel={preset.sublabel}
              active={Math.abs(st.uiScale - preset.scale) <= 2}
              isLightMode={isLightMode}
              onSelect={() => {
                void st.updateConsoleSetting('uiScale', preset.scale)
                toast.success(`Display & Cover Scale set to ${preset.label}`)
              }}
            />
          ))}
        </div>
      </div>

      {/* Visual Theme Gallery: 6 Dark Palettes + 6 Light Palettes */}
      <div
        className={`rounded-3xl border p-6 space-y-6 ${
          isLightMode ? 'border-slate-300 bg-white/90 shadow-sm' : 'border-white/15 bg-white/[0.04]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Palette className={`size-5 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} />
            <div>
              <h2
                className={`text-lg font-extrabold ${
                  isLightMode ? 'text-slate-900' : 'text-white'
                }`}
              >
                Console Color Palettes — Dark &amp; Daylight Themes
              </h2>
              <p className={`text-xs ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                Choose from 6 atmospheric Dark palettes or 6 high-contrast Daylight palettes
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${
                isLightMode
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-cyan-400/35 bg-cyan-500/15 text-cyan-300'
              }`}
            >
              Active: {CONSOLE_THEMES[st.theme]?.name}
            </span>

            <button
              type="button"
              {...toggleDaylightFocus.focusProps}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-black transition-all cursor-pointer outline-none ${
                toggleDaylightFocus.isFocused
                  ? 'scale-105 border-cyan-300 bg-cyan-400 text-slate-950 shadow-lg'
                  : isLightMode
                    ? 'border-slate-300 bg-slate-900 text-white hover:bg-slate-800'
                    : 'border-amber-300/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
              }`}
            >
              {isLightMode ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              <span>{isLightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}</span>
            </button>
          </div>
        </div>

        {/* Dark Mode Palettes (6) */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Moon className={`size-4 ${isLightMode ? 'text-slate-700' : 'text-cyan-400'}`} />
            <h3
              className={`text-xs font-black uppercase tracking-widest ${
                isLightMode ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              Dark Mode Palettes (6)
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CONSOLE_DARK_THEME_ORDER.map((tId) => (
              <ThemeSwatchCard
                key={tId}
                themeId={tId}
                selected={st.theme === tId}
                isLightMode={isLightMode}
                onSelect={() => {
                  void st.updateConsoleSetting('theme', tId)
                }}
              />
            ))}
          </div>
        </div>

        {/* Light Mode Palettes (6) */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center gap-2">
            <Sun className={`size-4 ${isLightMode ? 'text-amber-500' : 'text-amber-300'}`} />
            <h3
              className={`text-xs font-black uppercase tracking-widest ${
                isLightMode ? 'text-slate-700' : 'text-slate-300'
              }`}
            >
              Daylight / Light Mode Palettes (6)
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CONSOLE_LIGHT_THEME_ORDER.map((tId) => (
              <ThemeSwatchCard
                key={tId}
                themeId={tId}
                selected={st.theme === tId}
                isLightMode={isLightMode}
                onSelect={() => {
                  void st.updateConsoleSetting('theme', tId)
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Controller, Audio & Display Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <SettingRowButton
          id="cfg_glyph"
          title="Controller Button Icons"
          subtitle="Auto-detect PlayStation DualSense, Xbox, Switch, or Keyboard"
          valueLabel={st.glyphOverride}
          isLightMode={isLightMode}
          onCycle={() => {
            const order = ['auto', 'playstation', 'xbox', 'switch', 'keyboard'] as const
            const next = order[(order.indexOf(st.glyphOverride) + 1) % order.length]
            void st.updateConsoleSetting('glyphOverride', next)
          }}
        />

        <SettingRowButton
          id="cfg_confirm_swap"
          title="Confirm & Back Button Layout"
          subtitle="Swap Cross/A and Circle/B across all menus"
          valueLabel={st.confirmSwap ? 'Swapped (O/B = Confirm)' : 'Standard (X/A = Confirm)'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('confirmSwap', !st.confirmSwap)
          }}
        />

        <SettingRowButton
          id="cfg_ui_scale"
          title="Cover & Text Scale (Quick Cycle)"
          subtitle="Cycle between 90%, 100%, 115%, 130%, and 145%"
          valueLabel={`${st.uiScale}%`}
          isLightMode={isLightMode}
          onCycle={() => {
            const presets = [90, 100, 115, 130, 145]
            const currentIdx = presets.findIndex((p) => Math.abs(p - st.uiScale) <= 3)
            const next = presets[(currentIdx + 1) % presets.length] ?? 100
            void st.updateConsoleSetting('uiScale', next)
          }}
        />

        <SettingRowButton
          id="cfg_safe_margin"
          title="TV Overscan Safe Margin"
          subtitle="Keep interface inset from television screen edges"
          valueLabel={`${st.safeMargin}%`}
          isLightMode={isLightMode}
          onCycle={() => {
            const presets = [0, 1, 2, 4, 6]
            const next = presets[(presets.indexOf(st.safeMargin) + 1) % presets.length] ?? 2
            void st.updateConsoleSetting('safeMargin', next)
          }}
        />

        <SettingRowButton
          id="cfg_sounds"
          title="Console UI Synthesizer Sounds"
          subtitle="Tactile WebAudio feedback (automatically muted while in-game)"
          valueLabel={st.soundsEnabled ? `Enabled (${st.soundVolume}%)` : 'Muted'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('soundsEnabled', !st.soundsEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_guide_enabled"
          title="In-Game Guide / PS Button Quick Menu"
          subtitle="Open the overlay Quick Menu with Guide/PS or Back+Start (1s)"
          valueLabel={st.guideEnabled ? 'Enabled' : 'Disabled'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('guideEnabled', !st.guideEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_start_in_console"
          title="Boot Directly into Console Mode"
          subtitle="Start Nexus in fullscreen Big Picture mode on launch"
          valueLabel={st.startInConsole ? 'Enabled' : 'Disabled'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('startInConsole', !st.startInConsole)
          }}
        />

        <SettingRowButton
          id="cfg_minimal_home"
          title="Home Dashboard Layout"
          subtitle="Toggle between Full Smart Shelves or Minimal Hero view"
          valueLabel={st.minimalHome ? 'Minimal' : 'Full Smart Rows'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('minimalHome', !st.minimalHome)
          }}
        />

        <SettingRowButton
          id="cfg_screensaver"
          title="Aurora Standby Screensaver"
          subtitle="Dim screen after idle timeout while keeping display awake"
          valueLabel={st.screensaverEnabled ? `After ${st.idleMinutes} min` : 'Off'}
          isLightMode={isLightMode}
          onCycle={() => {
            void st.updateConsoleSetting('screensaverEnabled', !st.screensaverEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_monitor"
          title="Target Display Monitor"
          subtitle="Select which display Console Mode opens on"
          valueLabel={
            monitors[st.monitorIndex]
              ? `${monitors[st.monitorIndex].name} (${monitors[st.monitorIndex].width}x${monitors[st.monitorIndex].height})`
              : `Monitor #${st.monitorIndex + 1}`
          }
          isLightMode={isLightMode}
          onCycle={() => {
            const count = Math.max(1, monitors.length)
            const nextIdx = (st.monitorIndex + 1) % count
            void st.updateConsoleSetting('monitorIndex', nextIdx)
            const nextMon = monitors[nextIdx]
            if (nextMon) {
              const rec = computeRecommendedMonitorScale(nextMon.width, nextMon.height)
              void st.updateConsoleSetting('uiScale', rec.scale)
              toast.success(
                `Switched to ${nextMon.name} and auto-calibrated scale to ${rec.scale}%`,
              )
            }
          }}
        />
      </div>

      <div
        className={`flex flex-wrap items-center gap-6 pt-2 text-xs font-semibold ${
          isLightMode ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Monitor className="size-4 text-cyan-500" />
          Auto-Calibrated Monitor Scaling
        </span>
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="size-4 text-emerald-500" />
          DualSense + ViGEm Deduplication
        </span>
        <span className="flex items-center gap-1.5">
          <Volume2 className="size-4 text-violet-500" />
          Auto-Mute During Active Gameplay
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-amber-500" />
          1080p / 4K HD Dynamic Backdrops
        </span>
      </div>
    </FocusScope>
  )
}
