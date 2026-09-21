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

export const STORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  steam: { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30' },
  epic: { bg: 'bg-zinc-500/15', text: 'text-zinc-300', border: 'border-zinc-500/30' },
  gog: { bg: 'bg-purple-500/15', text: 'text-purple-400', border: 'border-purple-500/30' },
  ea: { bg: 'bg-orange-500/15', text: 'text-orange-400', border: 'border-orange-500/30' },
  ubisoft: { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/30' },
  battlenet: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  xbox: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  amazon: { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' },
  manual: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
  other: { bg: 'bg-slate-500/15', text: 'text-slate-400', border: 'border-slate-500/30' },
}

export function storeColors(source: string) {
  return STORE_COLORS[source.toLowerCase()] ?? STORE_COLORS.other
}
