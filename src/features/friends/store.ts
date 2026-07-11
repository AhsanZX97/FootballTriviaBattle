import type { Friend, FriendRequest, SendRequestResult, UserSearchResult } from '../../types/friends'
import { friendsApi, type FriendsApi } from '../../services/friends'
import { authStore } from '../auth/store'

export interface FriendsState {
  status: 'idle' | 'loading' | 'loaded'
  friends: Friend[]
  /** Requests sent TO you — actionable (accept/decline). Its length is the badge count. */
  incoming: FriendRequest[]
  /** Requests you sent — shown as "sent", awaiting the other side. */
  outgoing: FriendRequest[]
  searchQuery: string
  searchResults: UserSearchResult[]
  searching: boolean
  /** Surfaced after a search/send that resolves to a benign outcome (e.g. no such
   * user). Cleared on the next search or send. */
  actionError: string | null
}

/** Minimal slice of the auth store this store watches — refresh on sign-in,
 * clear on sign-out. Injected so tests can drive it. */
export interface AuthSeam {
  getState(): { status: string }
  subscribe(listener: () => void): () => void
}

type Listener = () => void

const emptyState = (): FriendsState => ({
  status: 'idle',
  friends: [],
  incoming: [],
  outgoing: [],
  searchQuery: '',
  searchResults: [],
  searching: false,
  actionError: null,
})

const SEND_MESSAGES: Partial<Record<SendRequestResult, string>> = {
  not_found: 'No player with that username.',
  already_friends: 'You are already friends.',
  already_pending: 'Request already pending.',
  self: "You can't add yourself.",
}

/** Exported for tests, which inject a fake api and auth seam; the app uses the
 * `friendsStore` singleton. */
export function createFriendsStore(
  deps: { api?: FriendsApi; auth?: AuthSeam } = {},
) {
  const api = deps.api ?? friendsApi
  const auth = deps.auth ?? (authStore as unknown as AuthSeam)

  let state: FriendsState = emptyState()
  const listeners = new Set<Listener>()
  // Bumped on every search so a slow earlier query can't overwrite newer results.
  let searchToken = 0
  // Late-bound (App wires it to presenceStore.notifyFriends) so this store never
  // imports the presence layer — keeps it decoupled and unit-testable. When a
  // mutation changes a friendship, we ping the other user to refresh live.
  let notify: ((userIds: string[]) => void) | null = null

  function setNotifier(fn: (userIds: string[]) => void): void {
    notify = fn
  }

  const getState = () => state
  const subscribe = (l: Listener): (() => void) => {
    listeners.add(l)
    return () => void listeners.delete(l)
  }
  const set = (patch: Partial<FriendsState>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l())
  }

  async function refresh(): Promise<void> {
    if (auth.getState().status !== 'signedIn') {
      set(emptyState())
      return
    }
    set({ status: state.status === 'loaded' ? 'loaded' : 'loading' })
    try {
      const [friends, requests] = await Promise.all([api.listFriends(), api.listFriendRequests()])
      set({
        status: 'loaded',
        friends,
        incoming: requests.filter((r) => r.direction === 'incoming'),
        outgoing: requests.filter((r) => r.direction === 'outgoing'),
      })
    } catch (err) {
      // A transient network failure must not crash (refresh is fire-and-forget
      // on sign-in). Leave any existing lists in place and mark loaded.
      console.error('[friends] refresh failed', err)
      set({ status: 'loaded' })
    }
  }

  async function sendRequest(username: string, targetId?: string): Promise<SendRequestResult> {
    set({ actionError: null })
    const result = await api.sendFriendRequest(username)
    if (result === 'sent' || result === 'accepted') {
      await refresh()
      // reflect the new relationship in any open search results
      if (state.searchQuery) await search(state.searchQuery)
      // nudge the recipient so their request badge appears without a reopen
      if (targetId) notify?.([targetId])
    } else {
      set({ actionError: SEND_MESSAGES[result] ?? 'Could not send request.' })
    }
    return result
  }

  async function accept(requesterId: string): Promise<void> {
    await api.respondToRequest(requesterId, true)
    await refresh()
    notify?.([requesterId]) // they're now your friend — update their list too
  }

  async function decline(requesterId: string): Promise<void> {
    await api.respondToRequest(requesterId, false)
    await refresh()
    notify?.([requesterId])
  }

  async function remove(userId: string): Promise<void> {
    await api.removeFriend(userId)
    await refresh()
    notify?.([userId])
  }

  async function search(query: string): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed) {
      searchToken++
      set({ searchQuery: '', searchResults: [], searching: false, actionError: null })
      return
    }
    const token = ++searchToken
    set({ searchQuery: query, searching: true, actionError: null })
    const results = await api.searchUsers(trimmed)
    if (token !== searchToken) return // a newer search superseded this one
    set({ searchResults: results, searching: false })
  }

  function clearSearch(): void {
    searchToken++
    set({ searchQuery: '', searchResults: [], searching: false, actionError: null })
  }

  // Refresh when signed in, clear when signed out. supabase-js fires the auth
  // store once on boot, so this covers hydration and every later transition.
  let lastStatus: string | null = null
  const syncToAuth = () => {
    const status = auth.getState().status
    if (status === lastStatus) return
    lastStatus = status
    if (status === 'signedIn') void refresh()
    else if (status === 'signedOut') set(emptyState())
  }
  auth.subscribe(syncToAuth)
  // Initial connect only, deferred so constructing the singleton does no
  // import-time auth read (that would fire before a test's auth mock is set up).
  queueMicrotask(() => {
    lastStatus = auth.getState().status
    if (lastStatus === 'signedIn') void refresh()
  })

  return {
    getState,
    subscribe,
    setNotifier,
    refresh,
    sendRequest,
    accept,
    decline,
    remove,
    search,
    clearSearch,
  }
}

export type FriendsStore = ReturnType<typeof createFriendsStore>

export const friendsStore = createFriendsStore()
