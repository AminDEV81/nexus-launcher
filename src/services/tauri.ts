import { invoke } from '@tauri-apps/api/core'

/**
 * Thin, typed wrapper around `@tauri-apps/api`'s `invoke`.
 *
 * Every feature's service file (e.g. `features/library/services.ts`) should
 * go through this instead of calling `invoke` directly, so:
 *  - command names live in one place and are easy to grep for,
 *  - error shapes are normalized before they reach TanStack Query,
 *  - it's easy to add cross-cutting concerns later (logging, retries).
 */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    // Rust's `AppError` is serialized as a plain string (see
    // src-tauri/src/error.rs), so `error` here is typically a string.
    const message =
      typeof error === 'string' ? error : 'Unexpected error communicating with the backend.'
    throw new Error(message)
  }
}

export interface HealthStatus {
  database_connected: boolean
  applied_migrations: number
}

export function healthCheck() {
  return call<HealthStatus>('health_check')
}
