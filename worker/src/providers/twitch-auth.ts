import type { Env, TwitchToken } from '../types'

let cachedToken: TwitchToken | null = null

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

export async function getTwitchToken(env: Env): Promise<string> {
  const now = Date.now()

  // 60-second safety window before actual expiration
  if (cachedToken && cachedToken.expires_at > now + 60_000) {
    return cachedToken.access_token
  }

  // Check KV cache if configured
  if (env.NEXUS_CACHE) {
    try {
      const kvToken = await env.NEXUS_CACHE.get<TwitchToken>('twitch_token', 'json')
      if (kvToken && kvToken.expires_at > now + 60_000) {
        cachedToken = kvToken
        return kvToken.access_token
      }
    } catch {
      // fallback to direct request
    }
  }

  const clientId = env.IGDB_CLIENT_ID
  const clientSecret = env.IGDB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('IGDB_CREDENTIALS_MISSING: Worker secrets are not configured on Cloudflare.')
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TWITCH_AUTH_FAILED: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number }
  const expiresAt = now + data.expires_in * 1000

  cachedToken = {
    access_token: data.access_token,
    expires_at: expiresAt,
  }

  if (env.NEXUS_CACHE) {
    try {
      await env.NEXUS_CACHE.put('twitch_token', JSON.stringify(cachedToken), {
        expirationTtl: Math.max(60, data.expires_in - 120),
      })
    } catch {
      // ignore
    }
  }

  return cachedToken.access_token
}
