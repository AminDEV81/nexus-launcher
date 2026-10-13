import type { Env } from './types'
import { handleRequest } from './router'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx)
  },
}
