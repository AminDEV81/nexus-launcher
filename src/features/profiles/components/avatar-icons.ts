import type { ComponentType } from 'react'
import { Gamepad2, User, Trophy, Flame, Star, Shield, Crown, Zap, Heart, Skull } from 'lucide-react'

export const AVATAR_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  gamepad: Gamepad2,
  user: User,
  trophy: Trophy,
  flame: Flame,
  star: Star,
  shield: Shield,
  crown: Crown,
  zap: Zap,
  heart: Heart,
  skull: Skull,
}
