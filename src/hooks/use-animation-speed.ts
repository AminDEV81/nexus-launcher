import { useAppearanceSettingsStore } from '@/store/appearance-settings-store'

/**
 * Reads the Settings > Appearance animation-speed multiplier. Applied
 * at each call site as `duration: BASE * speed` rather than through
 * some central Framer Motion config, because Framer Motion has no
 * built-in way to scale an explicitly-passed `transition.duration` —
 * `MotionConfig`'s `transition` prop only supplies *defaults* for
 * components that don't specify one, it doesn't multiply ones that do.
 *
 * Deliberately only wired into steady-state interaction animations
 * (modals, the sidebar, the details panel, page transitions, card
 * hover states) — the ones a person actually feels dozens of times a
 * session, where "make my UI snappier/more relaxed" has real everyday
 * value. The startup splash's assembly sequence is intentionally left
 * alone: its `duration`s and `delay`s are hand-chained to a specific
 * story that plays once per launch, and scaling `duration` without
 * proportionally scaling every `delay` alongside it would desync that
 * choreography for a preference nobody would notice on a once-per-launch
 * animation anyway.
 *
 * The hard "disable all animations" toggle is handled separately, via
 * `MotionConfig reducedMotion` in `app/providers.tsx` — that one *does*
 * apply everywhere, splash included, since "off" has no choreography to
 * preserve.
 */
export function useAnimationSpeed(): number {
  return useAppearanceSettingsStore((s) => s.animationSpeed)
}
