import React, { useMemo } from 'react'
import { FolderSearch } from 'lucide-react'
import type { Game, HubGame, Collection } from '@/types/models'
import type { DownloadInfo } from '@/services/download'
import { useConsoleStore } from '../store/console-store'
import { CONSOLE_STRINGS } from '../i18n/strings'
import { buildSmartRows } from '../utils/smart-rows'
import { ConsoleHero } from '../ui/Hero'
import { ConsoleRow } from '../ui/Row'
import { useFocusable } from '../nav/FocusScope'

export interface HomeViewProps {
  games: Game[]
  runningGameIds: Set<string>
  downloads: DownloadInfo[]
  comingSoonHub: HubGame[]
  dealsHub: HubGame[]
  collections: Collection[]
  onPlayOrResume: (game: Game) => void
  onOpenGameHub: (game: Game) => void
  onSelectHubGame: (hubGame: HubGame) => void
  onFocusGame: (game: Game) => void
  onToggleFavorite: (game: Game) => void
  onGoToDesktopScan: () => void
}

export const HomeView: React.FC<HomeViewProps> = ({
  games,
  runningGameIds,
  downloads,
  comingSoonHub,
  dealsHub,
  collections,
  onPlayOrResume,
  onOpenGameHub,
  onSelectHubGame,
  onFocusGame,
  onToggleFavorite,
  onGoToDesktopScan,
}) => {
  const lang = useConsoleStore((s) => s.language)
  const minimalHome = useConsoleStore((s) => s.minimalHome)
  const focusedGameId = useConsoleStore((s) => s.focusedGameId)
  const t = CONSOLE_STRINGS[lang]

  const visibleGames = useMemo(
    () => games.filter((g) => !g.is_hidden && !g.is_memory && !g.is_wishlist),
    [games],
  )

  const featuredGame = useMemo(() => {
    if (focusedGameId) {
      const found = visibleGames.find((g) => g.id === focusedGameId)
      if (found) return found
    }
    const running = visibleGames.find((g) => runningGameIds.has(g.id))
    if (running) return running
    const sorted = [...visibleGames].sort(
      (a, b) => b.total_playtime_seconds - a.total_playtime_seconds,
    )
    return sorted[0] ?? null
  }, [focusedGameId, runningGameIds, visibleGames])

  const smartRows = useMemo(
    () =>
      buildSmartRows({
        games,
        runningGameIds,
        downloads,
        comingSoonHub,
        dealsHub,
        collections,
        minimalHome,
      }),
    [games, runningGameIds, downloads, comingSoonHub, dealsHub, collections, minimalHome],
  )

  const emptyScanFocus = useFocusable<HTMLButtonElement>({
    id: 'home_empty_scan_btn',
    scopeId: 'console_home_empty',
    onConfirm: onGoToDesktopScan,
  })

  if (visibleGames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center text-cyan-400 mb-6">
          <FolderSearch className="w-10 h-10" />
        </div>
        <h2 className="text-3xl font-black text-white mb-2">{t.home.emptyLibraryTitle}</h2>
        <p className="text-base text-slate-400 max-w-lg mb-8">{t.home.emptyLibraryDesc}</p>
        <button
          type="button"
          {...emptyScanFocus.focusProps}
          className={`px-8 py-4 rounded-2xl font-extrabold text-base transition-all ${
            emptyScanFocus.isFocused
              ? 'bg-cyan-400 text-slate-950 scale-105 ring-4 ring-cyan-300/50 shadow-xl'
              : 'bg-cyan-500/80 text-slate-950'
          }`}
        >
          {t.home.scanGamesNow}
        </button>
      </div>
    )
  }

  const getRowTitle = (titleKey: string, customTitle?: string) => {
    const map: Record<string, string> = {
      recentlyPlayed: t.home.recentlyPlayed,
      downloadingNow: t.home.downloadingNow,
      favorites: t.home.favorites,
      becauseYouPlayed: `${t.home.becauseYouPlayed} ${customTitle || ''}`.trim(),
      quickPlay: t.home.quickPlay,
      backInTheDay: t.home.backInTheDay,
      newInLibrary: t.home.newInLibrary,
      wishlistDeals: t.home.wishlistDeals,
      comingSoon: t.home.comingSoon,
    }
    return map[titleKey] || customTitle || titleKey
  }

  return (
    <div className="space-y-1 pb-20">
      <ConsoleHero
        game={featuredGame}
        isRunning={featuredGame ? runningGameIds.has(featuredGame.id) : false}
        playLabel={t.actions.play}
        resumeLabel={t.actions.resume}
        detailsLabel={t.actions.select}
        onPlayOrResume={onPlayOrResume}
        onOpenHub={onOpenGameHub}
        onToggleFavorite={onToggleFavorite}
      />

      <div className="space-y-4">
        {smartRows.map((row) => (
          <ConsoleRow
            key={row.id}
            rowId={row.id}
            title={getRowTitle(row.titleKey, row.customTitle)}
            items={row.items}
            variant={row.id === 'downloading_now' ? 'landscape' : 'poster'}
            onSelectGame={onOpenGameHub}
            onSelectHubGame={onSelectHubGame}
            onFocusGame={onFocusGame}
            onOptionsGame={onToggleFavorite}
          />
        ))}
      </div>
    </div>
  )
}
