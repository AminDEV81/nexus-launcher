import React, { useState } from 'react'
import {
  Moon,
  RotateCcw,
  Power,
  Lock,
  Monitor,
  Users,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { consolePowerAction, type ConsolePowerAction } from '@/services/console'
import { useConsoleStore } from '../store/console-store'
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
  onSelect: () => void
}> = ({ id, title, subtitle, icon, danger, onSelect }) => {
  const { focusProps, isFocused } = useFocusable<HTMLButtonElement>({
    id,
    scopeId: 'console_power_scope',
    onConfirm: onSelect,
  })
  return (
    <button
      type="button"
      {...focusProps}
      className={`p-6 rounded-3xl border text-left transition-all flex items-center gap-5 ${
        isFocused
          ? danger
            ? 'bg-rose-500 text-white border-rose-300 scale-[1.03] shadow-2xl'
            : 'bg-cyan-400 text-slate-950 border-cyan-300 scale-[1.03] shadow-2xl'
          : danger
            ? 'bg-rose-500/10 text-rose-200 border-rose-500/30'
            : 'bg-white/5 text-slate-200 border-white/10'
      }`}
    >
      <div className="p-3.5 rounded-2xl bg-black/25">{icon}</div>
      <div>
        <h3 className="text-xl font-black">{title}</h3>
        <p className="text-xs opacity-80 mt-0.5">{subtitle}</p>
      </div>
    </button>
  )
}

export const PowerView: React.FC<PowerViewProps> = ({
  onExitToDesktop,
  onSwitchProfile,
}) => {
  const lang = useConsoleStore((s) => s.language)
  const t = CONSOLE_STRINGS[lang]
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
    <div className="space-y-6 pb-16">
      <FocusScope
        id="console_power_scope"
        orientation="grid"
        className="grid grid-cols-1 md:grid-cols-2 gap-5"
      >
        <PowerOptionCard
          id="pwr_exit_desktop"
          title={t.power.exitToDesktop}
          subtitle="Restore desktop window geometry and exit borderless fullscreen"
          icon={<Monitor className="w-7 h-7" />}
          onSelect={onExitToDesktop}
        />

        <PowerOptionCard
          id="pwr_switch_profile"
          title={t.power.switchProfile}
          subtitle="Open the Who's Playing Save Guardian profile selector"
          icon={<Users className="w-7 h-7" />}
          onSelect={onSwitchProfile}
        />

        <PowerOptionCard
          id="pwr_sleep"
          title={t.power.sleep}
          subtitle="Put PC into low-power suspend state immediately"
          icon={<Moon className="w-7 h-7" />}
          onSelect={() => {
            void executePower('sleep')
          }}
        />

        <PowerOptionCard
          id="pwr_lock"
          title={t.power.lock}
          subtitle="Lock Windows session and return to lock screen"
          icon={<Lock className="w-7 h-7" />}
          onSelect={() => {
            void executePower('lock')
          }}
        />

        <PowerOptionCard
          id="pwr_restart"
          title={t.power.restart}
          subtitle="Close applications and reboot Windows"
          icon={<RotateCcw className="w-7 h-7" />}
          danger
          onSelect={() => setPendingAction('restart')}
        />

        <PowerOptionCard
          id="pwr_shutdown"
          title={t.power.shutdown}
          subtitle="Safely power off your PC"
          icon={<Power className="w-7 h-7" />}
          danger
          onSelect={() => setPendingAction('shutdown')}
        />
      </FocusScope>

      {pendingAction && (
        <div className="fixed inset-0 z-[250] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <FocusScope
            id="console_power_confirm"
            trapFocus
            orientation="horizontal"
            className="max-w-md w-full p-8 rounded-3xl bg-slate-950 border border-rose-500/40 text-center space-y-6 shadow-2xl"
          >
            <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto" />
            <div>
              <h2 className="text-2xl font-black text-white">{t.power.confirmTitle}</h2>
              <p className="text-sm text-slate-400 mt-2">{t.power.confirmDesc}</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                {...confirmYes.focusProps}
                className={`px-6 py-3 rounded-2xl font-extrabold text-sm ${
                  confirmYes.isFocused
                    ? 'bg-rose-500 text-white scale-105 ring-4 ring-rose-400/50'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {t.actions.confirm} ({pendingAction.toUpperCase()})
              </button>
              <button
                type="button"
                {...confirmNo.focusProps}
                className={`px-6 py-3 rounded-2xl font-bold text-sm ${
                  confirmNo.isFocused
                    ? 'bg-cyan-400 text-slate-950 scale-105'
                    : 'bg-white/10 text-slate-200'
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
