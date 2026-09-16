/** Credential problems that should show the "set up IGDB first" panel
 *  instead of a raw error: only when personal keys are configured AND missing,
 *  never when offline or in public Nexus Cloud mode. */
export function isMissingIgdbKeys(
  error: { message?: string } | null | undefined,
  providerMode?: string,
): boolean {
  // Nexus Cloud (public mode) requires ZERO personal keys.
  // Any error in public mode is a network or server issue, NEVER missing keys!
  if (providerMode && providerMode !== 'custom') {
    return false
  }

  const message = error?.message ?? ''
  if (!message) return false

  // If the error indicates network disconnection, unreachable host, or offline:
  if (
    /network|internet|offline|disconnect|unreachable|timeout|dns|failed to fetch|socket/i.test(
      message,
    )
  ) {
    return false
  }

  return message.includes('IGDB Client ID') || /IGDB returned 40[13]/.test(message)
}
