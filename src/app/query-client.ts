import { QueryClient } from '@tanstack/react-query'

/**
 * Single shared QueryClient for the whole app.
 *
 * `retry: 1` (rather than the default 3) because failures here are almost
 * always "the Rust command errored" (bad path, missing file, parse
 * failure) rather than a flaky network call — retrying a broken local
 * command three times just delays showing the user the real error.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})
