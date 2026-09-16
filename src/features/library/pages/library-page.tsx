import type { LucideIcon } from 'lucide-react'
import { useFilteredGames } from '../hooks/use-filtered-games'
import type { LibraryScope } from '../hooks/use-filtered-games'
import { LibraryView } from '../components/library-view'

interface LibraryPageProps {
  scope: LibraryScope
  title: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDescription: string
  /** Only the main "Library" view offers Add Game / Scan shortcuts from
   *  its empty state — an empty Favorites/Hidden view isn't "you have no
   *  games", it's "none of your games match this filter yet". */
  showEmptyActions?: boolean
}

export function LibraryPage({
  scope,
  title,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  showEmptyActions,
}: LibraryPageProps) {
  const { games, isPending } = useFilteredGames(scope)

  return (
    <LibraryView
      games={games}
      isPending={isPending}
      title={title}
      emptyIcon={emptyIcon}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      showEmptyActions={showEmptyActions}
    />
  )
}
