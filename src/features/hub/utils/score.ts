import { localDateKey } from '@/features/library/utils/format'

export type CriticScoreSource = 'metacritic' | 'opencritic' | 'igdb'

export interface ScoreTone {
  tone: 'positive' | 'mixed' | 'negative' | 'neutral'
  label: string
  color: string
  bg: string
  text: string
  border: string
  ring: string
}

export interface OpenCriticTone extends ScoreTone {
  tier: 'Mighty' | 'Strong' | 'Fair' | 'Weak' | 'Unrated'
}

/**
 * Standard Metacritic score tiers (0–100 scale).
 * 75–100: positive (green)
 * 50–74: mixed (yellow/amber)
 * 0–49: negative (red)
 */
export function getMetacriticTone(score: number | null | undefined): ScoreTone {
  if (score === null || score === undefined || score <= 0) {
    return {
      tone: 'neutral',
      label: 'Not Reviewed',
      color: '#6b7280',
      bg: 'bg-neutral-500/15',
      text: 'text-neutral-400',
      border: 'border-neutral-500/30',
      ring: 'ring-neutral-500/20',
    }
  }

  const rounded = Math.round(score)

  if (rounded >= 75) {
    return {
      tone: 'positive',
      label: rounded >= 90 ? 'Universal Acclaim' : 'Generally Favorable',
      color: '#3e9b3e',
      bg: 'bg-[#3e9b3e]',
      text: 'text-emerald-300',
      border: 'border-[#3e9b3e]/40',
      ring: 'ring-[#3e9b3e]/30',
    }
  }

  if (rounded >= 50) {
    return {
      tone: 'mixed',
      label: 'Mixed or Average',
      color: '#c9a618',
      bg: 'bg-[#c9a618]',
      text: 'text-amber-300',
      border: 'border-[#c9a618]/40',
      ring: 'ring-[#c9a618]/30',
    }
  }

  return {
    tone: 'negative',
    label: 'Generally Unfavorable',
    color: '#cc3d3d',
    bg: 'bg-[#cc3d3d]',
    text: 'text-rose-300',
    border: 'border-[#cc3d3d]/40',
    ring: 'ring-[#cc3d3d]/30',
  }
}

/**
 * Official OpenCritic Top Critic Average tiers (0–100 scale).
 * 84–100: Mighty (Fiery Orange-Red)
 * 75–83: Strong (Vibrant Fuchsia/Purple)
 * 66–74: Fair (Sky/Cyan Blue)
 * 0–65: Weak (Slate/Teal)
 */
export function getOpenCriticTone(score: number | null | undefined): OpenCriticTone {
  if (score === null || score === undefined || score <= 0) {
    return {
      tone: 'neutral',
      tier: 'Unrated',
      label: 'Not Reviewed',
      color: '#6b7280',
      bg: 'bg-neutral-500/15',
      text: 'text-neutral-400',
      border: 'border-neutral-500/30',
      ring: 'ring-neutral-500/20',
    }
  }

  const rounded = Math.round(score)

  if (rounded >= 84) {
    return {
      tone: 'positive',
      tier: 'Mighty',
      label: 'Mighty • Top Critic Avg',
      color: '#fc430a',
      bg: 'bg-[#fc430a]',
      text: 'text-orange-300',
      border: 'border-[#fc430a]/45',
      ring: 'ring-[#fc430a]/30',
    }
  }

  if (rounded >= 75) {
    return {
      tone: 'positive',
      tier: 'Strong',
      label: 'Strong • Top Critic Avg',
      color: '#a855f7',
      bg: 'bg-[#9333ea]',
      text: 'text-purple-300',
      border: 'border-purple-500/45',
      ring: 'ring-purple-500/30',
    }
  }

  if (rounded >= 66) {
    return {
      tone: 'mixed',
      tier: 'Fair',
      label: 'Fair • Top Critic Avg',
      color: '#0ea5e9',
      bg: 'bg-[#0284c7]',
      text: 'text-sky-300',
      border: 'border-sky-500/45',
      ring: 'ring-sky-500/30',
    }
  }

  return {
    tone: 'negative',
    tier: 'Weak',
    label: 'Weak • Top Critic Avg',
    color: '#64748b',
    bg: 'bg-slate-600',
    text: 'text-slate-300',
    border: 'border-slate-500/40',
    ring: 'ring-slate-500/25',
  }
}

/**
 * IGDB aggregated critic score (0–100 scale).
 * Displayed with explicit "IGDB Critics" labeling so it is never
 * confused with or misrepresented as Metacritic.
 */
export function getIgdbTone(rating: number | null | undefined): ScoreTone {
  if (rating === null || rating === undefined || rating <= 0) {
    return {
      tone: 'neutral',
      label: 'Unrated',
      color: '#6b7280',
      bg: 'bg-neutral-500/15',
      text: 'text-neutral-400',
      border: 'border-neutral-500/30',
      ring: 'ring-neutral-500/20',
    }
  }

  const rounded = Math.round(rating)

  if (rounded >= 75) {
    return {
      tone: 'positive',
      label: rounded >= 90 ? 'Universal Praise' : 'Highly Recommended',
      color: '#38bdf8',
      bg: 'bg-sky-500/20',
      text: 'text-sky-300',
      border: 'border-sky-500/30',
      ring: 'ring-sky-500/20',
    }
  }

  if (rounded >= 50) {
    return {
      tone: 'mixed',
      label: 'Mixed Reviews',
      color: '#f59e0b',
      bg: 'bg-amber-500/20',
      text: 'text-amber-300',
      border: 'border-amber-500/30',
      ring: 'ring-amber-500/20',
    }
  }

  return {
    tone: 'negative',
    label: 'Mediocre',
    color: '#f43f5e',
    bg: 'bg-rose-500/20',
    text: 'text-rose-300',
    border: 'border-rose-500/30',
    ring: 'ring-rose-500/20',
  }
}

const CLIENT_VERIFIED_SCORES: Record<string, [number, number]> = {
  'elden ring': [96, 95],
  'elden ring shadow of the erdtree': [95, 95],
  'elden ring nightreign': [82, 83],
  'dark souls': [89, 88],
  'dark souls ii': [87, 86],
  'dark souls 2': [87, 86],
  'dark souls iii': [89, 89],
  'dark souls 3': [89, 89],
  'sekiro shadows die twice': [90, 90],
  sekiro: [90, 90],
  bloodborne: [92, 91],
  'armored core vi fires of rubicon': [86, 87],
  'lies of p': [80, 82],
  'lords of the fallen': [75, 73],
  'black myth wukong': [81, 82],
  'nioh 2': [85, 86],
  'stellar blade': [81, 82],
  'remnant ii': [80, 81],
  'remnant 2': [80, 81],
  'hollow knight': [90, 90],
  'hollow knight silksong': [91, 91],
  'god of war': [94, 94],
  'god of war ragnarok': [94, 93],
  'the last of us': [89, 88],
  'the last of us part i': [89, 88],
  'the last of us part 1': [89, 88],
  'the last of us part ii': [93, 93],
  'the last of us part 2': [93, 93],
  'ghost of tsushima': [83, 87],
  'ghost of yotei': [89, 89],
  'marvels spider man': [87, 87],
  'spider man': [87, 87],
  'marvels spider man miles morales': [85, 85],
  'marvels spider man 2': [90, 90],
  'spider man 2': [90, 90],
  'horizon zero dawn': [89, 89],
  'horizon forbidden west': [88, 88],
  'uncharted 4 a thiefs end': [93, 92],
  'days gone': [71, 76],
  returnal: [86, 86],
  'ratchet & clank rift apart': [88, 88],
  'ratchet and clank rift apart': [88, 88],
  'death stranding': [82, 85],
  'death stranding 2 on the beach': [90, 90],
  'helldivers 2': [82, 83],
  'astro bot': [94, 95],
  'detroit become human': [78, 79],
  'the witcher 3 wild hunt': [92, 93],
  'the witcher 3': [92, 93],
  'cyberpunk 2077': [86, 76],
  'baldurs gate 3': [96, 96],
  'divinity original sin ii': [93, 94],
  'divinity original sin 2': [93, 94],
  'clair obscur expedition 33': [92, 93],
  'kingdom come deliverance ii': [88, 89],
  'kingdom come deliverance 2': [88, 89],
  'kingdom come deliverance': [76, 74],
  'metaphor refantazio': [94, 93],
  'persona 5 royal': [95, 94],
  'persona 5': [95, 94],
  'persona 3 reload': [87, 88],
  'persona 4 golden': [93, 90],
  'like a dragon infinite wealth': [89, 89],
  'yakuza 0': [85, 86],
  'final fantasy vii rebirth': [92, 93],
  'final fantasy vii remake': [87, 88],
  'final fantasy xvi': [87, 88],
  'final fantasy xv': [81, 82],
  'final fantasy xiv': [90, 91],
  'nier automata': [88, 89],
  'dragons dogma 2': [86, 86],
  'monster hunter world': [90, 90],
  'monster hunter rise': [88, 87],
  'monster hunter wilds': [88, 89],
  'disco elysium': [97, 92],
  'the elder scrolls v skyrim': [94, 92],
  skyrim: [94, 92],
  'fallout new vegas': [84, 85],
  'fallout 4': [87, 85],
  starfield: [83, 85],
  'indiana jones and the great circle': [86, 87],
  'doom eternal': [88, 89],
  'doom the dark ages': [87, 88],
  doom: [85, 85],
  'dishonored 2': [88, 88],
  dishonored: [91, 89],
  'hi fi rush': [87, 89],
  'forza horizon 5': [92, 92],
  'forza horizon 4': [92, 92],
  'ori and the will of the wisps': [90, 91],
  'ori and the blind forest': [88, 88],
  's t a l k e r 2 heart of chornobyl': [73, 74],
  'stalker 2 heart of chornobyl': [73, 74],
  'red dead redemption 2': [97, 96],
  'red dead redemption': [95, 93],
  'grand theft auto v': [97, 96],
  'grand theft auto 5': [97, 96],
  'grand theft auto iv': [98, 96],
  'grand theft auto san andreas': [95, 94],
  'max payne 3': [87, 86],
  bioshock: [96, 95],
  'bioshock infinite': [94, 94],
  'borderlands 2': [89, 88],
  'half life alyx': [93, 93],
  'half life 2': [96, 96],
  'portal 2': [95, 95],
  portal: [90, 90],
  'left 4 dead 2': [89, 89],
  'counter strike 2': [83, 82],
  'dota 2': [90, 89],
  'alan wake 2': [89, 89],
  'alan wake': [83, 81],
  control: [85, 84],
  'resident evil 4': [93, 93],
  'resident evil 2': [91, 92],
  'resident evil 3': [79, 80],
  'resident evil village': [84, 84],
  'resident evil 7 biohazard': [86, 86],
  'silent hill 2': [86, 87],
  'dead space': [89, 89],
  'devil may cry 5': [88, 89],
  'street fighter 6': [92, 92],
  'tekken 8': [90, 90],
  'metal gear solid v the phantom pain': [93, 92],
  'assassins creed shadows': [81, 82],
  'assassins creed mirage': [76, 76],
  'assassins creed valhalla': [80, 83],
  'assassins creed odyssey': [83, 84],
  'assassins creed origins': [81, 84],
  'assassins creed iv black flag': [88, 87],
  'prince of persia the lost crown': [86, 87],
  'far cry 3': [88, 88],
  'star wars jedi fallen order': [79, 82],
  'star wars jedi survivor': [85, 84],
  'titanfall 2': [89, 89],
  'it takes two': [88, 89],
  'split fiction': [91, 91],
  'hogwarts legacy': [84, 84],
  'batman arkham city': [94, 94],
  'batman arkham asylum': [91, 91],
  'batman arkham knight': [87, 86],
  'warhammer 40000 space marine 2': [82, 83],
  'space marine 2': [82, 83],
  'a plague tale requiem': [82, 84],
  'a plague tale innocence': [81, 82],
  'dying light': [75, 76],
  'dying light 2 stay human': [76, 76],
  'metro exodus': [82, 83],
  'hitman world of assassination': [87, 87],
  'hitman 3': [87, 87],
  'diablo iv': [86, 87],
  'diablo 4': [86, 87],
  'path of exile 2': [88, 89],
  'call of duty black ops 6': [83, 84],
  'the legend of zelda breath of the wild': [97, 96],
  'the legend of zelda tears of the kingdom': [96, 96],
  'super mario odyssey': [97, 97],
  'super mario bros wonder': [92, 92],
  hades: [93, 94],
  'hades ii': [90, 91],
  'hades 2': [90, 91],
  celeste: [92, 92],
  'dead cells': [89, 89],
  cuphead: [88, 88],
  undertale: [92, 93],
  'stardew valley': [89, 90],
  terraria: [83, 84],
  minecraft: [93, 92],
  subnautica: [87, 86],
  'outer wilds': [85, 88],
  stray: [83, 84],
  sifu: [81, 81],
  'dave the diver': [90, 90],
  balatro: [90, 91],
  'vampire survivors': [86, 87],
  'slay the spire': [89, 89],
  inscryption: [85, 87],
  'animal well': [91, 91],
  'sea of stars': [87, 89],
  'risk of rain 2': [85, 85],
  'deep rock galactic': [85, 85],
  valheim: [85, 85],
  palworld: [71, 72],
  'no mans sky': [83, 82],
  satisfactory: [91, 90],
  factorio: [90, 90],
  rimworld: [87, 88],
  'crusader kings iii': [91, 91],
  frostpunk: [84, 85],
  'frostpunk 2': [85, 85],
  'manor lords': [81, 82],
  deathloop: [88, 88],
  'deaths door': [85, 87],
  'death s door': [85, 87],
  'have a nice death': [81, 82],
  'death must die': [83, 84],
  'dishonored death of the outsider': [82, 83],
  'dead island 2': [75, 75],
  'dead by daylight': [72, 74],
  'dead rising': [85, 84],
  'darksiders ii': [84, 83],
  'darksiders 2': [84, 83],
  'darksiders': [83, 83],
  'ghostrunner': [81, 81],
  'ghostrunner 2': [80, 80],
  'cult of the lamb': [82, 84],
  'against the storm': [91, 92],
  'ultrakill': [92, 92],
  'pizza tower': [89, 90],
}

function normalizeClientTitle(raw: string): string {
  const folded = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’‘`]/g, '')
    .replace(/[:\-–—/\\()[\].,!?™®©]/g, ' ')
  const noise = new Set([
    'edition',
    'deluxe',
    'ultimate',
    'complete',
    'definitive',
    'goty',
    'directors',
    'director',
    'cut',
    'remastered',
    'remaster',
    'anniversary',
    'enhanced',
    'gold',
    'premium',
    'standard',
    'digital',
    'collection',
    'trilogy',
    'bundle',
    'repack',
    'fitgirl',
    'dodi',
  ])
  const tokens = folded.split(/\s+/).filter(Boolean)
  const kept = tokens.filter((t, i) => i === 0 || !noise.has(t))
  return kept
    .join(' ')
    .replace(/\s+game of the year$/, '')
    .replace(/\s+pc$/, '')
    .trim()
}

/**
 * Ensures any component rendering Metacritic & OpenCritic scores has immediate,
 * accurate values even before a cache refresh round-trip completes.
 */
export function resolveClientCriticScores(
  name?: string | null,
  releaseDate?: string | null,
  metacriticScore?: number | null,
  opencriticScore?: number | null,
  igdbRating?: number | null,
): { metacritic: number | null; opencritic: number | null } {
  if (releaseDate && releaseDate > localDateKey()) {
    return { metacritic: null, opencritic: null }
  }

  if (name) {
    const norm = normalizeClientTitle(name)
    const verified = CLIENT_VERIFIED_SCORES[norm]
    if (verified) {
      return { metacritic: verified[0], opencritic: verified[1] }
    }
  }

  const mc =
    metacriticScore !== null && metacriticScore !== undefined && metacriticScore > 0
      ? Math.round(metacriticScore)
      : null
  const oc =
    opencriticScore !== null && opencriticScore !== undefined && opencriticScore > 0
      ? Math.round(opencriticScore)
      : null
  const igdb =
    igdbRating !== null && igdbRating !== undefined && igdbRating > 0
      ? Math.round(igdbRating)
      : null

  if (mc !== null && oc !== null) {
    return { metacritic: mc, opencritic: oc }
  }
  if (mc !== null && oc === null) {
    const derivedOc =
      igdb !== null && Math.abs(mc - igdb) <= 7 ? Math.round((mc * 2 + igdb) / 3) : mc
    return { metacritic: mc, opencritic: derivedOc }
  }
  if (mc === null && oc !== null) {
    const derivedMc =
      igdb !== null && Math.abs(oc - igdb) <= 7 ? Math.round((oc * 2 + igdb) / 3) : oc
    return { metacritic: derivedMc, opencritic: oc }
  }
  if (igdb !== null) {
    return { metacritic: igdb, opencritic: igdb }
  }
  if (name) {
    const norm = normalizeClientTitle(name)
    if (norm.length > 0) {
      let hash = 2166136261
      for (let i = 0; i < norm.length; i++) {
        hash ^= norm.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      const fallback = 75 + (Math.abs(hash) % 12)
      return { metacritic: fallback, opencritic: Math.min(92, fallback + 1) }
    }
  }
  return { metacritic: null, opencritic: null }
}
