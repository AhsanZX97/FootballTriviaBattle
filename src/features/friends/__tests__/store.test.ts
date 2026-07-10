import { describe, expect, it, vi } from 'vitest'
import type { Friend, FriendRequest, SendRequestResult, UserSearchResult } from '../../../types/friends'
import type { FriendsApi } from '../../../services/friends'
import { createFriendsStore, type AuthSeam } from '../store'

/** Controllable auth seam: starts signed out unless told otherwise. */
function createFakeAuth(initial: string = 'signedOut') {
  let status = initial
  const listeners = new Set<() => void>()
  return {
    seam: {
      getState: () => ({ status }),
      subscribe: (l: () => void) => {
        listeners.add(l)
        return () => void listeners.delete(l)
      },
    } as AuthSeam,
    setStatus(next: string) {
      status = next
      listeners.forEach((l) => l())
    },
  }
}

function createFakeApi(overrides: Partial<FriendsApi> = {}): FriendsApi {
  return {
    sendFriendRequest: vi.fn(async (): Promise<SendRequestResult> => 'sent'),
    respondToRequest: vi.fn(async () => true),
    removeFriend: vi.fn(async () => true),
    listFriends: vi.fn(async (): Promise<Friend[]> => []),
    listFriendRequests: vi.fn(async (): Promise<FriendRequest[]> => []),
    searchUsers: vi.fn(async (): Promise<UserSearchResult[]> => []),
    ...overrides,
  }
}

const friend = (id: string, username: string): Friend => ({ id, username, coins: 0 })
const request = (
  otherId: string,
  username: string,
  direction: 'incoming' | 'outgoing',
): FriendRequest => ({ otherId, username, direction, createdAt: '2026-01-01T00:00:00Z' })

describe('friends store', () => {
  it('starts empty and idle when signed out', () => {
    const { seam } = createFakeAuth('signedOut')
    const store = createFriendsStore({ api: createFakeApi(), auth: seam })
    expect(store.getState()).toMatchObject({ status: 'idle', friends: [], incoming: [], outgoing: [] })
  })

  it('refresh splits requests into incoming and outgoing', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi({
      listFriends: vi.fn(async () => [friend('f1', 'alice')]),
      listFriendRequests: vi.fn(async () => [
        request('r1', 'bob', 'incoming'),
        request('r2', 'carol', 'outgoing'),
      ]),
    })
    const store = createFriendsStore({ api, auth: seam })
    await store.refresh()
    const s = store.getState()
    expect(s.status).toBe('loaded')
    expect(s.friends).toHaveLength(1)
    expect(s.incoming.map((r) => r.username)).toEqual(['bob'])
    expect(s.outgoing.map((r) => r.username)).toEqual(['carol'])
  })

  it('refreshes automatically when auth transitions to signed in', async () => {
    const { seam, setStatus } = createFakeAuth('signedOut')
    const api = createFakeApi({ listFriends: vi.fn(async () => [friend('f1', 'alice')]) })
    const store = createFriendsStore({ api, auth: seam })
    expect(api.listFriends).not.toHaveBeenCalled()
    setStatus('signedIn')
    await vi.waitFor(() => expect(store.getState().friends).toHaveLength(1))
  })

  it('clears state when auth transitions to signed out', async () => {
    const { seam, setStatus } = createFakeAuth('signedIn')
    const api = createFakeApi({ listFriends: vi.fn(async () => [friend('f1', 'alice')]) })
    const store = createFriendsStore({ api, auth: seam })
    await store.refresh()
    expect(store.getState().friends).toHaveLength(1)
    setStatus('signedOut')
    expect(store.getState().friends).toEqual([])
  })

  it('refresh is a no-op that clears when signed out', async () => {
    const { seam } = createFakeAuth('signedOut')
    const api = createFakeApi()
    const store = createFriendsStore({ api, auth: seam })
    await store.refresh()
    expect(api.listFriends).not.toHaveBeenCalled()
    expect(store.getState().friends).toEqual([])
  })

  it('sendRequest returns the result code and refreshes on success', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi({ sendFriendRequest: vi.fn(async () => 'sent' as SendRequestResult) })
    const store = createFriendsStore({ api, auth: seam })
    const result = await store.sendRequest('bob')
    expect(result).toBe('sent')
    expect(api.sendFriendRequest).toHaveBeenCalledWith('bob')
    expect(api.listFriendRequests).toHaveBeenCalled()
  })

  it('sendRequest surfaces a message on a benign failure', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi({ sendFriendRequest: vi.fn(async () => 'not_found' as SendRequestResult) })
    const store = createFriendsStore({ api, auth: seam })
    await store.sendRequest('ghost')
    expect(store.getState().actionError).toMatch(/no player/i)
  })

  it('accept calls respondToRequest with accept=true then refreshes', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi()
    const store = createFriendsStore({ api, auth: seam })
    await store.accept('r1')
    expect(api.respondToRequest).toHaveBeenCalledWith('r1', true)
    expect(api.listFriends).toHaveBeenCalled()
  })

  it('decline calls respondToRequest with accept=false', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi()
    const store = createFriendsStore({ api, auth: seam })
    await store.decline('r1')
    expect(api.respondToRequest).toHaveBeenCalledWith('r1', false)
  })

  it('search populates results and clearSearch empties them', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi({
      searchUsers: vi.fn(async () => [{ id: 'u1', username: 'dave', relationship: 'none' as const }]),
    })
    const store = createFriendsStore({ api, auth: seam })
    await store.search('dav')
    expect(store.getState().searchResults).toHaveLength(1)
    store.clearSearch()
    expect(store.getState().searchResults).toEqual([])
    expect(store.getState().searchQuery).toBe('')
  })

  it('search ignores a blank query without hitting the api', async () => {
    const { seam } = createFakeAuth('signedIn')
    const api = createFakeApi()
    const store = createFriendsStore({ api, auth: seam })
    await store.search('   ')
    expect(api.searchUsers).not.toHaveBeenCalled()
    expect(store.getState().searchResults).toEqual([])
  })
})
