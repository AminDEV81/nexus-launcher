/** Credential problems that should show the "set up IGDB first" panel
 *  instead of a raw error: the explicit missing-keys message, and IGDB
 *  auth failures (an empty/invalid Client-ID header reaches IGDB as a
 *  401 before any nicer check fires — e.g. a stale cached token). */
export function isMissingIgdbKeys(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? ''
  return message.includes('IGDB Client ID') || /IGDB returned 40[13]/.test(message)
}
