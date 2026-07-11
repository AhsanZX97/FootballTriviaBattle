import { supabase } from './supabase'
import type {
  Friend,
  FriendRequest,
  RequestDirection,
  SendRequestResult,
  UserSearchResult,
} from '../types/friends'

/** The friend operations the store depends on. Defined as an interface so the
 * store's tests can inject a fake instead of the real Supabase-backed one
 * (same seam as the auth store's `AuthSupabaseClient`). */
export interface FriendsApi {
  sendFriendRequest(username: string): Promise<SendRequestResult>
  respondToRequest(requesterId: string, accept: boolean): Promise<boolean>
  removeFriend(userId: string): Promise<boolean>
  listFriends(): Promise<Friend[]>
  listFriendRequests(): Promise<FriendRequest[]>
  searchUsers(query: string): Promise<UserSearchResult[]>
}

interface FriendRow {
  id: string
  username: string
  coins: number
}

interface RequestRow {
  other_id: string
  username: string
  direction: RequestDirection
  created_at: string
}

interface SearchRow {
  id: string
  username: string
  relationship: UserSearchResult['relationship']
}

async function sendFriendRequest(username: string): Promise<SendRequestResult> {
  const { data } = await supabase.rpc('send_friend_request', { p_username: username })
  // On any transport error `data` is null; treat it as "not found" so the UI
  // shows a benign message rather than crashing.
  return (data as SendRequestResult | null) ?? 'not_found'
}

async function respondToRequest(requesterId: string, accept: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('respond_to_friend_request', {
    p_requester: requesterId,
    p_accept: accept,
  })
  if (error) console.error('[friends] respond_to_friend_request failed', { requesterId, accept, error })
  return data === true
}

async function removeFriend(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('remove_friend', { p_user: userId })
  if (error) console.error('[friends] remove_friend failed', { userId, error })
  return data === true
}

async function listFriends(): Promise<Friend[]> {
  const { data } = await supabase.rpc('list_friends')
  return ((data as FriendRow[] | null) ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    coins: r.coins,
  }))
}

async function listFriendRequests(): Promise<FriendRequest[]> {
  const { data } = await supabase.rpc('list_friend_requests')
  return ((data as RequestRow[] | null) ?? []).map((r) => ({
    otherId: r.other_id,
    username: r.username,
    direction: r.direction,
    createdAt: r.created_at,
  }))
}

async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const { data } = await supabase.rpc('search_users', { p_query: query })
  return ((data as SearchRow[] | null) ?? []).map((r) => ({
    id: r.id,
    username: r.username,
    relationship: r.relationship,
  }))
}

export const friendsApi: FriendsApi = {
  sendFriendRequest,
  respondToRequest,
  removeFriend,
  listFriends,
  listFriendRequests,
  searchUsers,
}
