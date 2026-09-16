import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/** Shared back button for hub subpages. History back when possible
 *  (returns the user to wherever they came from — search results and
 *  feed pages included); falls back to the hub itself for a deep link
 *  with no history. */
export function HubBackButton() {
  const navigate = useNavigate()

  function goBack() {
    if (window.history.length > 1) navigate(-1)
    else navigate('/hub')
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="flex w-fit items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-medium text-muted shadow-card transition-colors hover:border-accent/40 hover:text-text"
    >
      <ArrowLeft className="size-4" />
      Back
    </button>
  )
}
