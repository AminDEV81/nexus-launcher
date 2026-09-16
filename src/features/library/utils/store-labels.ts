export const STORE_LABELS: Record<string, string> = {
  steam: 'Steam',
  epic: 'Epic Games',
  gog: 'GOG Galaxy',
  ea: 'EA App',
  ubisoft: 'Ubisoft Connect',
  battlenet: 'Battle.net',
  amazon: 'Amazon Games',
  xbox: 'Xbox',
  manual: 'Manually added',
  other: 'Other',
}

export function storeLabel(source: string): string {
  return STORE_LABELS[source] ?? source
}
