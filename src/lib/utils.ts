import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind class lists safely (later classes win over earlier
 * conflicting ones) while still allowing conditional classes via clsx.
 * Used by every component in `components/ui` instead of raw template
 * strings, so conflicting utility classes never silently double up.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
