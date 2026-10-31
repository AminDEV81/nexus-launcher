import React, { useEffect, useState } from 'react'
import { Palette, Check, Monitor, Volume2, Gamepad2, Sparkles } from 'lucide-react'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES, CONSOLE_THEME_ORDER, type ConsoleThemeId } from '../theme/tokens'
import { consoleListMonitors, type ConsoleMonitorDto } from '@/services/console'
import { FocusScope, useFocusable } from '../nav/FocusScope'

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
      className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all outline-none cursor-pointer ${
        isFocused
          ? 'scale-[1.04] border-cyan-400 ring-4 ring-cyan-400/40 shadow-xl'
          : selected
            ? isLightMode
              ? 'border-indigo-600 bg-white shadow-md'
              : 'border-cyan-400/70 bg-white/10'
            : isLightMode
              ? 'border-slate-300 bg-white/80 hover:bg-white'
              : 'border-white/15 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {tokens.previewSwatches.map((hex, i) => (
            <span
              key={i}
              className="size-5 rounded-full border border-white/25 shadow-sm"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
        {selected && (
          <span className="flex size-6 items-center justify-center rounded-full bg-cyan-400 text-slate-950">
            <Check className="size-3.5 stroke-[3]" />
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className={`text-sm font-extrabold ${isLightMode ? 'text-slate-900' : 'text-white'}`}>
          {tokens.name}
        </p>
        <p className={`text-[0.72rem] line-clamp-1 ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
          {tokens.subtitle}
        </p>
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
        <p className="text-[1.1rem] font-extrabold">{title}</p>
        <p
          className={`mt-0.5 text-[0.82rem] ${
            isFocused ? 'text-slate-800' : isLightMode ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {subtitle}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-xl px-3.5 py-1.5 text-[0.85rem] font-extrabold uppercase ${
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

  return (
    <FocusScope id="console_settings_scope" orientation="vertical" className="space-y-8 pb-16">
      <div>
        <h1
          className={`text-[2.4rem] font-black tracking-tight ${
            isLightMode ? 'text-slate-900' : 'text-white'
          }`}
        >
          Console Settings & Themes
        </h1>
        <p className={`text-sm ${isLightMode ? 'text-slate-600' : 'text-slate-300/80'}`}>
          Customize your living-room theme, controller glyphs, audio synthesizer, and display scale.
        </p>
      </div>

      {/* Visual Theme Gallery (7 Themes including fixed Alabaster Daylight Light Theme!) */}
      <div
        className={`rounded-3xl border p-6 ${
          isLightMode
            ? 'border-slate-300 bg-white/75 shadow-sm'
            : 'border-white/15 bg-white/[0.04]'
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Palette className={`size-5 ${isLightMode ? 'text-indigo-600' : 'text-cyan-400'}`} />
            <h2
              className={`text-lg font-extrabold ${
                isLightMode ? 'text-slate-900' : 'text-white'
              }`}
            >
              Console Color Theme
            </h2>
          </div>
          <span
            className={`text-xs font-bold uppercase tracking-wider ${
              isLightMode ? 'text-indigo-600' : 'text-cyan-300'
            }`}
          >
            Active: {CONSOLE_THEMES[st.theme]?.name}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {CONSOLE_THEME_ORDER.map((tId) => (
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

      {/* Controller, Audio & Display Settings (Persian language removed per #12) */}
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
          title="10-Foot TV Interface Scale"
          subtitle="Adjust text and card scaling from 90% to 140%"
          valueLabel={`${st.uiScale}%`}
          isLightMode={isLightMode}
          onCycle={() => {
            const presets = [90, 100, 110, 125, 140]
            const next = presets[(presets.indexOf(st.uiScale) + 1) % presets.length] ?? 100
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
            const presets = [0, 2, 4, 6, 8]
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
            void st.updateConsoleSetting('monitorIndex', (st.monitorIndex + 1) % count)
          }}
        />
      </div>

      <div
        className={`flex flex-wrap items-center gap-6 pt-2 text-xs font-semibold ${
          isLightMode ? 'text-slate-500' : 'text-slate-400'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <Monitor className="size-4 text-cyan-400" />
          60fps Spatial Navigation
        </span>
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="size-4 text-emerald-400" />
          DualSense + ViGEm Deduplication
        </span>
        <span className="flex items-center gap-1.5">
          <Volume2 className="size-4 text-violet-400" />
          Auto-Mute During Active Gameplay
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="size-4 text-amber-400" />
          1080p HD Dynamic Backdrops
        </span>
      </div>
    </FocusScope>
  )
}
