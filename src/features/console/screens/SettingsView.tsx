import React, { useEffect, useState } from 'react'
import { Sliders, Monitor, Volume2, Gamepad2, Sparkles, Globe } from 'lucide-react'
import { useConsoleStore } from '../store/console-store'
import { consoleListMonitors, type ConsoleMonitorDto } from '@/services/console'
import { FocusScope, useFocusable } from '../nav/FocusScope'

const SettingRowButton: React.FC<{
  id: string
  title: string
  subtitle: string
  valueLabel: string
  onCycle: () => void
}> = ({ id, title, subtitle, valueLabel, onCycle }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_settings_scope',
    onConfirm: onCycle,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`w-full p-5 rounded-2xl border flex items-center justify-between text-left transition-all ${
        isFocused
          ? 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.01] shadow-lg'
          : 'bg-white/5 text-slate-200 border-white/10'
      }`}
    >
      <div>
        <p className="text-base font-extrabold">{title}</p>
        <p className={`text-xs mt-0.5 ${isFocused ? 'text-slate-800' : 'text-slate-400'}`}>
          {subtitle}
        </p>
      </div>
      <span
        className={`px-4 py-1.5 rounded-xl font-extrabold text-xs uppercase ${
          isFocused ? 'bg-slate-950 text-cyan-300' : 'bg-cyan-500/20 text-cyan-300'
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

  useEffect(() => {
    consoleListMonitors().then(setMonitors).catch(() => {})
  }, [])

  return (
    <FocusScope id="console_settings_scope" orientation="vertical" className="space-y-4 pb-16">
      <div className="p-6 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-3">
        <Sliders className="w-7 h-7 text-cyan-400" />
        <div>
          <h1 className="text-2xl font-black text-white">Console Mode Settings</h1>
          <p className="text-xs text-slate-400">
            All settings persist immediately to SQLite and apply live without restarting
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SettingRowButton
          id="cfg_theme"
          title="Console Theme"
          subtitle="Switch between Nexus Cyan, OLED Pure Black, and Daylight Living Room"
          valueLabel={st.theme}
          onCycle={() => {
            const order = ['cyberpunk', 'oled', 'light'] as const
            const next = order[(order.indexOf(st.theme) + 1) % order.length]
            void st.updateConsoleSetting('theme', next)
          }}
        />

        <SettingRowButton
          id="cfg_language"
          title="Interface Language (EN / فارسی)"
          subtitle="Bilingual English + Persian with automatic RTL layout mirroring"
          valueLabel={st.language === 'fa' ? 'فارسی (RTL)' : 'English (LTR)'}
          onCycle={() => {
            void st.updateConsoleSetting('language', st.language === 'en' ? 'fa' : 'en')
          }}
        />

        <SettingRowButton
          id="cfg_glyph"
          title="Controller Button Glyphs"
          subtitle="Auto-detects PlayStation DualSense, Xbox, Switch, or Keyboard"
          valueLabel={st.glyphOverride}
          onCycle={() => {
            const order = ['auto', 'playstation', 'xbox', 'switch', 'keyboard'] as const
            const next = order[(order.indexOf(st.glyphOverride) + 1) % order.length]
            void st.updateConsoleSetting('glyphOverride', next)
          }}
        />

        <SettingRowButton
          id="cfg_confirm_swap"
          title="Swap Confirm & Back (Nintendo / JP Layout)"
          subtitle="Swaps Cross/A and Circle/B across all menus and glyph bars"
          valueLabel={st.confirmSwap ? 'Swapped (O/B = Confirm)' : 'Standard (X/A = Confirm)'}
          onCycle={() => {
            void st.updateConsoleSetting('confirmSwap', !st.confirmSwap)
          }}
        />

        <SettingRowButton
          id="cfg_ui_scale"
          title="10-Foot TV UI Scale"
          subtitle="Scale typography and cards from 80% to 150%"
          valueLabel={`${st.uiScale}%`}
          onCycle={() => {
            const presets = [90, 100, 110, 125, 140]
            const next = presets[(presets.indexOf(st.uiScale) + 1) % presets.length] ?? 100
            void st.updateConsoleSetting('uiScale', next)
          }}
        />

        <SettingRowButton
          id="cfg_safe_margin"
          title="TV Overscan Safe Margin"
          subtitle="Inset viewport padding (0% to 8%) for living-room televisions"
          valueLabel={`${st.safeMargin}%`}
          onCycle={() => {
            const presets = [0, 2, 4, 6, 8]
            const next = presets[(presets.indexOf(st.safeMargin) + 1) % presets.length] ?? 2
            void st.updateConsoleSetting('safeMargin', next)
          }}
        />

        <SettingRowButton
          id="cfg_sounds"
          title="Procedural WebAudio UI Sounds"
          subtitle="Synthesized navigation ticks, confirm chimes, and soundtrack ducking"
          valueLabel={st.soundsEnabled ? `Enabled (${st.soundVolume}%)` : 'Muted'}
          onCycle={() => {
            void st.updateConsoleSetting('soundsEnabled', !st.soundsEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_guide_enabled"
          title="In-Game Guide Button Quick Menu"
          subtitle="Poll Guide/PS button and Back+Start (1s hold) to summon Quick Menu"
          valueLabel={st.guideEnabled ? 'Enabled' : 'Disabled'}
          onCycle={() => {
            void st.updateConsoleSetting('guideEnabled', !st.guideEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_start_in_console"
          title="Boot Directly into Console Mode"
          subtitle="Launch Nexus directly into fullscreen Big Picture on startup"
          valueLabel={st.startInConsole ? 'Yes' : 'No'}
          onCycle={() => {
            void st.updateConsoleSetting('startInConsole', !st.startInConsole)
          }}
        />

        <SettingRowButton
          id="cfg_minimal_home"
          title="Minimal Home Layout"
          subtitle="Show only Hero and Recently Played row for a clean dashboard"
          valueLabel={st.minimalHome ? 'Minimal' : 'Full Smart Rows'}
          onCycle={() => {
            void st.updateConsoleSetting('minimalHome', !st.minimalHome)
          }}
        />

        <SettingRowButton
          id="cfg_screensaver"
          title="Aurora Standby Screensaver"
          subtitle="Dim OLED screen after idle timeout while keeping display awake"
          valueLabel={st.screensaverEnabled ? `After ${st.idleMinutes} min` : 'Off'}
          onCycle={() => {
            void st.updateConsoleSetting('screensaverEnabled', !st.screensaverEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_monitor"
          title="Target Display Monitor"
          subtitle="Choose which display Console Mode opens on"
          valueLabel={
            monitors[st.monitorIndex]
              ? `${monitors[st.monitorIndex].name} (${monitors[st.monitorIndex].width}x${monitors[st.monitorIndex].height})`
              : `Monitor #${st.monitorIndex + 1}`
          }
          onCycle={() => {
            const count = Math.max(1, monitors.length)
            void st.updateConsoleSetting('monitorIndex', (st.monitorIndex + 1) % count)
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-6 px-4 pt-2 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <Monitor className="w-4 h-4 text-cyan-400" />
          Zero Desktop Startup Overhead
        </span>
        <span className="flex items-center gap-1.5">
          <Gamepad2 className="w-4 h-4 text-emerald-400" />
          DualSense + ViGEm Deduplication Active
        </span>
        <span className="flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-violet-400" />
          Procedural WebAudio Synthesizer
        </span>
        <span className="flex items-center gap-1.5">
          <Globe className="w-4 h-4 text-amber-400" />
          Bilingual EN / FA Support
        </span>
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          400ms Focus Swallow Window
        </span>
      </div>
    </FocusScope>
  )
}
