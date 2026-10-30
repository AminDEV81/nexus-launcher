import React, { useState } from 'react'
import { Moon, RotateCcw, Power, Lock, Monitor, Users, AlertTriangle } from 'lucide-react'
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
      className={`flex w-full items-center gap-6 rounded-2xl px-6 py-[1.1rem] text-left outline-none transition-[background-color,color,transform] duration-200 ${
        isFocused
          ? danger
            ? 'scale-[1.015] bg-rose-500 text-white'
            : 'scale-[1.015] bg-white text-black'
          : danger
            ? 'text-rose-300/90'
            : 'text-white/80'
      }`}
    >
      <span className="flex size-[2.4rem] shrink-0 items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <h3 className="text-[1.25rem] font-medium">{title}</h3>
        {isFocused && <p className="mt-0.5 text-[0.88rem] opacity-70">{subtitle}</p>}
      </div>
    </button>
  )
}

export const PowerView: React.FC<PowerViewProps> = ({ onExitToDesktop, onSwitchProfile }) => {
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
    <div className="flex flex-col gap-4 pb-16">
      <h1 className="px-6 pt-2 text-[2.6rem] font-semibold tracking-tight text-white">Power</h1>
      <FocusScope
        id="console_power_scope"
        orientation="vertical"
        className="flex max-w-[40rem] flex-col gap-1"
      >
        <PowerOptionCard
          id="pwr_exit_desktop"
          title={t.power.exitToDesktop}
          subtitle="Leave Console Mode"
          icon={<Monitor className="size-[1.6rem]" />}
          onSelect={onExitToDesktop}
        />

        <PowerOptionCard
          id="pwr_switch_profile"
          title={t.power.switchProfile}
          subtitle="Choose who is playing"
          icon={<Users className="size-[1.6rem]" />}
          onSelect={onSwitchProfile}
        />

        <PowerOptionCard
          id="pwr_sleep"
          title={t.power.sleep}
          subtitle="Put the PC to sleep"
          icon={<Moon className="size-[1.6rem]" />}
          onSelect={() => {
            void executePower('sleep')
          }}
        />

        <PowerOptionCard
          id="pwr_lock"
          title={t.power.lock}
          subtitle="Lock this Windows session"
          icon={<Lock className="size-[1.6rem]" />}
          onSelect={() => {
            void executePower('lock')
          }}
        />

        <PowerOptionCard
          id="pwr_restart"
          title={t.power.restart}
          subtitle="Close everything and reboot"
          icon={<RotateCcw className="size-[1.6rem]" />}
          danger
          onSelect={() => setPendingAction('restart')}
        />

        <PowerOptionCard
          id="pwr_shutdown"
          title={t.power.shutdown}
          subtitle="Turn off the PC"
          icon={<Power className="size-[1.6rem]" />}
          danger
          onSelect={() => setPendingAction('shutdown')}
        />
      </FocusScope>

      {pendingAction && (
        <div className="fixed inset-0 z-[250] bg-black/75 flex items-center justify-center p-6">
          <FocusScope
            id="console_power_confirm"
            trapFocus
            orientation="horizontal"
            className="w-full max-w-lg space-y-7 rounded-[2rem] bg-[#0c0e15] p-10 text-center shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9)]"
          >
            <AlertTriangle className="mx-auto size-[2.6rem] text-white/70" />
            <div>
              <h2 className="text-2xl font-semibold text-white">{t.power.confirmTitle}</h2>
              <p className="text-sm text-slate-400 mt-2">{t.power.confirmDesc}</p>
            </div>
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                {...confirmYes.focusProps}
                className={`rounded-full px-7 py-3 text-[1.05rem] font-semibold outline-none transition-all ${
                  confirmYes.isFocused
                    ? 'bg-rose-500 text-white scale-105'
                    : 'bg-white/10 text-white/80'
                }`}
              >
                {t.actions.confirm} ({pendingAction.toUpperCase()})
              </button>
              <button
                type="button"
                {...confirmNo.focusProps}
                className={`rounded-full px-7 py-3 text-[1.05rem] font-semibold outline-none transition-all ${
                  confirmNo.isFocused
                    ? 'bg-white text-black scale-105'
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
