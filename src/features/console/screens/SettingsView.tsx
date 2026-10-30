import React, { useEffect, useState } from 'react'
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
      className={`flex w-full items-center justify-between gap-8 rounded-2xl px-6 py-[1.05rem] text-left outline-none transition-[background-color,color,transform] duration-200 ${
        isFocused ? 'scale-[1.015] bg-white text-black' : 'text-white/85'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[1.2rem] font-medium">{title}</p>
        {isFocused && <p className="mt-0.5 text-[0.88rem] text-black/55">{subtitle}</p>}
      </div>
      <span
        className={`shrink-0 text-[1.05rem] font-medium capitalize ${isFocused ? 'text-black' : 'text-white/50'}`}
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
    consoleListMonitors()
      .then(setMonitors)
      .catch(() => {})
  }, [])

  return (
    <FocusScope id="console_settings_scope" orientation="vertical" className="pb-16">
      <h1 className="px-6 pb-4 pt-2 text-[2.6rem] font-semibold tracking-tight text-white">
        Settings
      </h1>

      <div className="flex max-w-[58rem] flex-col gap-1">
        <SettingRowButton
          id="cfg_theme"
          title="Theme"
          subtitle="Nexus Cyan, OLED black or Daylight"
          valueLabel={st.theme}
          onCycle={() => {
            const order = ['cyberpunk', 'oled', 'light'] as const
            const next = order[(order.indexOf(st.theme) + 1) % order.length]
            void st.updateConsoleSetting('theme', next)
          }}
        />

        <SettingRowButton
          id="cfg_language"
          title="Language"
          subtitle="English or Persian (right-to-left)"
          valueLabel={st.language === 'fa' ? 'فارسی (RTL)' : 'English (LTR)'}
          onCycle={() => {
            void st.updateConsoleSetting('language', st.language === 'en' ? 'fa' : 'en')
          }}
        />

        <SettingRowButton
          id="cfg_glyph"
          title="Button icons"
          subtitle="Auto-detect, or force PlayStation, Xbox or Switch"
          valueLabel={st.glyphOverride}
          onCycle={() => {
            const order = ['auto', 'playstation', 'xbox', 'switch', 'keyboard'] as const
            const next = order[(order.indexOf(st.glyphOverride) + 1) % order.length]
            void st.updateConsoleSetting('glyphOverride', next)
          }}
        />

        <SettingRowButton
          id="cfg_confirm_swap"
          title="Confirm button"
          subtitle="Swap the confirm and back buttons"
          valueLabel={st.confirmSwap ? 'Swapped (O/B = Confirm)' : 'Standard (X/A = Confirm)'}
          onCycle={() => {
            void st.updateConsoleSetting('confirmSwap', !st.confirmSwap)
          }}
        />

        <SettingRowButton
          id="cfg_ui_scale"
          title="Interface size"
          subtitle="Make everything smaller or larger"
          valueLabel={`${st.uiScale}%`}
          onCycle={() => {
            const presets = [90, 100, 110, 125, 140]
            const next = presets[(presets.indexOf(st.uiScale) + 1) % presets.length] ?? 100
            void st.updateConsoleSetting('uiScale', next)
          }}
        />

        <SettingRowButton
          id="cfg_safe_margin"
          title="TV safe margin"
          subtitle="Keep the interface away from the screen edges"
          valueLabel={`${st.safeMargin}%`}
          onCycle={() => {
            const presets = [0, 2, 4, 6, 8]
            const next = presets[(presets.indexOf(st.safeMargin) + 1) % presets.length] ?? 2
            void st.updateConsoleSetting('safeMargin', next)
          }}
        />

        <SettingRowButton
          id="cfg_sounds"
          title="Interface sounds"
          subtitle="Navigation and confirmation sounds"
          valueLabel={st.soundsEnabled ? `Enabled (${st.soundVolume}%)` : 'Muted'}
          onCycle={() => {
            void st.updateConsoleSetting('soundsEnabled', !st.soundsEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_guide_enabled"
          title="Quick Menu in games"
          subtitle="Open the menu with the Guide / PS button while playing"
          valueLabel={st.guideEnabled ? 'Enabled' : 'Disabled'}
          onCycle={() => {
            void st.updateConsoleSetting('guideEnabled', !st.guideEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_start_in_console"
          title="Start in Console Mode"
          subtitle="Open Nexus fullscreen when it starts"
          valueLabel={st.startInConsole ? 'Yes' : 'No'}
          onCycle={() => {
            void st.updateConsoleSetting('startInConsole', !st.startInConsole)
          }}
        />

        <SettingRowButton
          id="cfg_minimal_home"
          title="Home layout"
          subtitle="Show only the main row on the home screen"
          valueLabel={st.minimalHome ? 'Minimal' : 'Full Smart Rows'}
          onCycle={() => {
            void st.updateConsoleSetting('minimalHome', !st.minimalHome)
          }}
        />

        <SettingRowButton
          id="cfg_screensaver"
          title="Screensaver"
          subtitle="Dim the screen when idle"
          valueLabel={st.screensaverEnabled ? `After ${st.idleMinutes} min` : 'Off'}
          onCycle={() => {
            void st.updateConsoleSetting('screensaverEnabled', !st.screensaverEnabled)
          }}
        />

        <SettingRowButton
          id="cfg_monitor"
          title="Display"
          subtitle="Choose which screen Console Mode uses"
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
    </FocusScope>
  )
}
