import { useEffect, useState } from 'react'
import type { GamepadInfo, StandardGamepadInput } from '../types/gamepad'
import { gamepadManager } from '../core/gamepad-manager'
import { ControllerGlyph } from './controller-glyph'
import { cn } from '@/lib/utils'

interface ControllerVisualizerProps {
  controller: GamepadInfo
}

export function ControllerVisualizer({ controller }: ControllerVisualizerProps) {
  const [input, setInput] = useState<StandardGamepadInput | null>(() =>
    gamepadManager.getInput(controller.index),
  )

  useEffect(() => {
    let animFrame: number
    const update = () => {
      const current = gamepadManager.getInput(controller.index)
      if (current) {
        setInput({ ...current })
      }
      animFrame = requestAnimationFrame(update)
    }

    animFrame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(animFrame)
  }, [controller.index])

  const buttons = input?.buttons
  const analog = input?.analog ?? { leftX: 0, leftY: 0, rightX: 0, rightY: 0, l2: 0, r2: 0 }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border/80 bg-surface/50 p-5">
      <div className="flex items-center justify-between border-b border-border/40 pb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">
          Live Input Tester ({controller.displayName})
        </span>
        <span className="text-[11px] text-muted">Move sticks & press buttons to test</span>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Left Stick Visualizer */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface-raised/40 p-4">
          <span className="mb-2 text-xs font-medium text-subtle">Left Stick</span>
          <div className="relative flex size-28 items-center justify-center rounded-full border-2 border-border/80 bg-surface shadow-inner">
            {/* Crosshairs */}
            <div className="absolute h-full w-px bg-border/40" />
            <div className="absolute w-full h-px bg-border/40" />

            {/* Moving Nub */}
            <div
              className={cn(
                'absolute size-7 rounded-full border-2 transition-transform duration-75 ease-out shadow-md',
                buttons?.l3
                  ? 'border-accent bg-accent text-white scale-90'
                  : 'border-accent/80 bg-accent/30',
              )}
              style={{
                transform: `translate(${analog.leftX * 38}px, ${analog.leftY * 38}px)`,
              }}
            />
          </div>
          <div className="mt-3 flex gap-3 font-mono text-[11px] text-muted">
            <span>X: {analog.leftX.toFixed(2)}</span>
            <span>Y: {analog.leftY.toFixed(2)}</span>
          </div>
        </div>

        {/* Right Stick Visualizer */}
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-surface-raised/40 p-4">
          <span className="mb-2 text-xs font-medium text-subtle">Right Stick</span>
          <div className="relative flex size-28 items-center justify-center rounded-full border-2 border-border/80 bg-surface shadow-inner">
            {/* Crosshairs */}
            <div className="absolute h-full w-px bg-border/40" />
            <div className="absolute w-full h-px bg-border/40" />

            {/* Moving Nub */}
            <div
              className={cn(
                'absolute size-7 rounded-full border-2 transition-transform duration-75 ease-out shadow-md',
                buttons?.r3
                  ? 'border-accent bg-accent text-white scale-90'
                  : 'border-accent/80 bg-accent/30',
              )}
              style={{
                transform: `translate(${analog.rightX * 38}px, ${analog.rightY * 38}px)`,
              }}
            />
          </div>
          <div className="mt-3 flex gap-3 font-mono text-[11px] text-muted">
            <span>X: {analog.rightX.toFixed(2)}</span>
            <span>Y: {analog.rightY.toFixed(2)}</span>
          </div>
        </div>

        {/* Analog Triggers & Bumpers */}
        <div className="flex flex-col justify-between rounded-xl border border-border/60 bg-surface-raised/40 p-4">
          <span className="text-xs font-medium text-subtle">Triggers & Bumpers</span>

          {/* L1 / L2 */}
          <div className="flex flex-col gap-2 my-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ControllerGlyph button="l2" controllerType={controller.type} size="sm" />
                <span className="text-muted">Left Trigger (LT)</span>
              </div>
              <span className="font-mono text-[11px] text-text">
                {(analog.l2 * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-accent transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, analog.l2 * 100))}%` }}
              />
            </div>
          </div>

          {/* R1 / R2 */}
          <div className="flex flex-col gap-2 my-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ControllerGlyph button="r2" controllerType={controller.type} size="sm" />
                <span className="text-muted">Right Trigger (RT)</span>
              </div>
              <span className="font-mono text-[11px] text-text">
                {(analog.r2 * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-accent transition-all duration-75"
                style={{ width: `${Math.min(100, Math.max(0, analog.r2 * 100))}%` }}
              />
            </div>
          </div>

          {/* Bumpers Indicator */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
                buttons?.l1
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-surface text-subtle',
              )}
            >
              <ControllerGlyph button="l1" controllerType={controller.type} size="sm" /> LB / L1
            </span>
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
                buttons?.r1
                  ? 'border-accent bg-accent text-white'
                  : 'border-border bg-surface text-subtle',
              )}
            >
              <ControllerGlyph button="r1" controllerType={controller.type} size="sm" /> RB / R1
            </span>
          </div>
        </div>
      </div>

      {/* Buttons Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 border-t border-border/40 pt-4">
        {/* Face buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-subtle font-medium">Face Buttons</span>
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.south && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="south" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.east && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="east" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.west && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="west" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.north && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="north" controllerType={controller.type} />
            </span>
          </div>
        </div>

        {/* D-Pad */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-subtle font-medium">D-Pad</span>
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.dpadUp && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="dpadUp" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.dpadDown && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="dpadDown" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.dpadLeft && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="dpadLeft" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.dpadRight && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="dpadRight" controllerType={controller.type} />
            </span>
          </div>
        </div>

        {/* Center / System Buttons */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-subtle font-medium">System</span>
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.select && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="select" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.start && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="start" controllerType={controller.type} />
            </span>
            {buttons?.home !== undefined && (
              <span
                className={cn(
                  'p-0.5 rounded transition-transform',
                  buttons?.home && 'scale-110 ring-2 ring-accent',
                )}
              >
                <ControllerGlyph button="home" controllerType={controller.type} />
              </span>
            )}
            {buttons?.touchpad !== undefined && (
              <span
                className={cn(
                  'p-0.5 rounded transition-transform',
                  buttons?.touchpad && 'scale-110 ring-2 ring-accent',
                )}
              >
                <ControllerGlyph button="touchpad" controllerType={controller.type} />
              </span>
            )}
          </div>
        </div>

        {/* Stick Clicks */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-subtle font-medium">Stick Clicks</span>
          <div className="flex flex-wrap gap-1.5">
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.l3 && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="l3" controllerType={controller.type} />
            </span>
            <span
              className={cn(
                'p-0.5 rounded transition-transform',
                buttons?.r3 && 'scale-110 ring-2 ring-accent',
              )}
            >
              <ControllerGlyph button="r3" controllerType={controller.type} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
