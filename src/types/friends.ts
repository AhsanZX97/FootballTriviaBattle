/** An accepted friend (from `list_friends`). */
export interface Friend {
  id: string
  username: string
  coins: number
}

/** Which way a pending request points relative to the current user. */
export type RequestDirection = 'incoming' | 'outgoing'

/** A pending friend request (from `list_friend_requests`). `otherId`/`username`
 * are the requester for incoming, the addressee for outgoing. */
export interface FriendRequest {
  otherId: string
  username: string
  direction: RequestDirection
  createdAt: string
}

/** The caller's relationship with a searched user (drives the Add/Requested/
 * Friends button state). */
export type Relationship = 'friends' | 'outgoing' | 'incoming' | 'none'

/** A username-search hit (from `search_users`). */
export interface UserSearchResult {
  id: string
  username: string
  relationship: Relationship
}

/** Result code from `send_friend_request`. */
export type SendRequestResult =
  | 'sent'
  | 'accepted'
  | 'already_pending'
  | 'already_friends'
  | 'not_found'
  | 'self'
