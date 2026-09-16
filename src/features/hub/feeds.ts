/** Feed ids understood by the backend's `get_hub_feed` command, with
 *  the shelf titles the hub page shows for each. */
export const HUB_FEEDS = {
  'new-releases': {
    title: 'New & notable',
    subtitle: 'Fresh drops and standout releases from recent months',
  },
  'coming-soon': { title: 'Coming soon', subtitle: 'Upcoming releases with real anticipation' },
  'top-rated': {
    title: 'Critically acclaimed',
    subtitle: 'The most-voted and well-received games of recent years',
  },
  recommended: { title: 'Picked for you', subtitle: 'Based on the genres you play most' },
} as const

export type HubFeedId = keyof typeof HUB_FEEDS

export function isHubFeedId(value: string): value is HubFeedId {
  return value in HUB_FEEDS
}
