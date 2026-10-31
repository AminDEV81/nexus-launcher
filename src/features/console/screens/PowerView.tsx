import React, { useState } from 'react'
import { Moon, RotateCcw, Power, Lock, Monitor, Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { consolePowerAction, type ConsolePowerAction } from '@/services/console'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_THEMES } from '../theme/tokens'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { FocusScope, useFocusable } from '../nav/FocusScope'

export interface PowerViewProps {
  onExitToDesktop: () => void
  onSwitchProfile: () => void
}

const PowerOptionCard: React.FC<{
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  danger?: boolean
  isLight: boolean
  onSelect: () => void
}> = ({ id, title, subtitle, icon, danger, isLight, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_power_scope',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`flex w-full items-center gap-5 rounded-3xl border p-6 text-left outline-none transition-all duration-150 cursor-pointer ${
        isFocused
          ? danger
            ? 'scale-[1.02] border-rose-300 bg-rose-500 text-white shadow-2xl'
            : 'scale-[1.02] border-cyan-300 bg-cyan-400 text-slate-950 shadow-2xl'
          : danger
            ? isLight
              ? 'border-rose-300 bg-rose-50 text-rose-700'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            : isLight
              ? 'border-slate-300 bg-white/90 text-slate-900 shadow-xs'
              : 'border-white/12 bg-white/[0.05] text-white'
      }`}
    >
      <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-black/15">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-xl font-black">{title}</h3>
        <p className="mt-0.5 text-xs opacity-80">{subtitle}</p>
      </div>
    </button>
  )
}

export const PowerView: React.FC<PowerViewProps> = ({ onExitToDesktop, onSwitchProfile }) => {
  const themeId = useConsoleStore((s) => s.theme)
  const isLight = Boolean(CONSOLE_THEMES[themeId]?.isLight)
  const t = CONSOLE_STRINGS.en
  const [pendingAction, setPendingAction] = useState<ConsolePowerAction | null>(null)

  const executePower = async (action: ConsolePowerAction) => {
    try {
      await consolePowerAction(action)
      toast.success(`Executed power action: ${action}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Power action failed')
    } finally {
      setPendingAction(null)
    }
  }

  const confirmYes = useFocusable<HTMLButtonElement>({
    id: 'power_confirm_yes',
    scopeId: 'console_power_confirm',
    onConfirm: () => {
      if (pendingAction) void executePower(pendingAction)
    },
  })

  const confirmNo = useFocusable<HTMLButtonElement>({
    id: 'power_confirm_no',
    scopeId: 'console_power_confirm',
    onConfirm: () => setPendingAction(null),
  })

  return (
    <div className="space-y-6 pb-20">
      <h1 className={`text-[2.4rem] font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
        Power & Session
      </h1>
      <FocusScope
        id="console_power_scope"
        orientation="grid"
        className="grid grid-cols-1 md:grid-cols-2 gap-5"
      >
        <PowerOptionCard
          id="pwr_exit_desktop"
          title={t.power.exitToDesktop}
          subtitle="Restore desktop window geometry and leave Console Mode"
          icon={<Monitor className="size-7" />}
          isLight={isLight}
          onSelect={onExitToDesktop}
        />

        <PowerOptionCard
          id="pwr_switch_profile"
          title={t.power.switchProfile}
          subtitle="Open the Who's Playing Save Guardian profile switcher"
          icon={<Users className="size-7" />}
          isLight={isLight}
          onSelect={onSwitchProfile}
        />

        <PowerOptionCard
          id="pwr_sleep"
          title={t.power.sleep}
          subtitle="Put the PC into low-power sleep mode"
          icon={<Moon className="size-7" />}
          isLight={isLight}
          onSelect={() => {
            void executePower('sleep')
          }}
        />

        <PowerOptionCard
          id="pwr_lock"
          title={t.power.lock}
          subtitle="Lock this Windows workstation session"
          icon={<Lock className="size-7" />}
          isLight={isLight}
          onSelect={() => {
            void executePower('lock')
          }}
        />

        <PowerOptionCard
          id="pwr_restart"
          title={t.power.restart}
          subtitle="Close applications and reboot Windows"
          icon={<RotateCcw className="size-7" />}
          danger
          isLight={isLight}
          onSelect={() => setPendingAction('restart')}
        />

        <PowerOptionCard
          id="pwr_shutdown"
          title={t.power.shutdown}
          subtitle="Safely power off your PC"
          icon={<Power className="size-7" />}
          danger
          isLight={isLight}
          onSelect={() => setPendingAction('shutdown')}
        />
      </FocusScope>

      {pendingAction && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <FocusScope
            id="console_power_confirm"
            trapFocus
            orientation="horizontal"
            className="w-full max-w-lg space-y-6 rounded-3xl border border-rose-500/40 bg-slate-950 p-8 text-center shadow-2xl"
          >
            <AlertTriangle className="mx-auto size-12 text-rose-400" />
            <div>
              <h2 className="text-2xl font-black text-white">{t.power.confirmTitle}</h2>
              <p className="text-sm text-slate-400 mt-2">{t.power.confirmDesc}</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                {...confirmYes.focusProps}
                className={`rounded-2xl px-7 py-3 text-sm font-extrabold outline-none transition-all cursor-pointer ${
                  confirmYes.isFocused
                    ? 'bg-rose-500 text-white scale-105'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {t.actions.confirm} ({pendingAction.toUpperCase()})
              </button>
              <button
                type="button"
                {...confirmNo.focusProps}
                className={`rounded-2xl px-7 py-3 text-sm font-bold outline-none transition-all cursor-pointer ${
                  confirmNo.isFocused
                    ? 'bg-cyan-400 text-slate-950 scale-105'
                    : 'bg-white/10 text-white/80'
                }`}
              >
                {t.actions.cancel}
              </button>
            </div>
          </FocusScope>
        </div>
      )}
    </div>
  )
}
