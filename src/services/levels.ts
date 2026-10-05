import { supabase } from './supabase'

/** What `claim_level_question` reports: coins this claim paid (0 for a repeat)
 * and the resulting balance, so the counter updates without a refetch. */
export interface ClaimQuestionResponse {
  status: 'ok' | 'already_solved'
  coinsPaid: number
  coins: number
}

/** What `claim_level_prize` reports. `itemId` is the item actually granted —
 * null when the prize paid coins (a chest, or an item already owned). */
export interface ClaimPrizeResponse {
  status: 'ok' | 'already_claimed'
  itemId: string | null
  coinsPaid: number
  coins: number
}

/** The account's level progress, as `list_level_progress` returns it. */
export interface LevelProgressResponse {
  solved: Record<string, number>
  prizes: number[]
}

/** The level operations the level store depends on. An interface so the
 * store's tests can inject a fake (same seam as `CustomizationApi`). Every
 * method resolves null for every failure: refusal, transport error, malformed
 * reply. */
export interface LevelsApi {
  claimQuestion(questionId: string, wrongTries: number): Promise<ClaimQuestionResponse | null>
  claimPrize(level: number): Promise<ClaimPrizeResponse | null>
  listProgress(): Promise<LevelProgressResponse | null>
  /** Records offline progress without paying for it, then returns the
   * account's full progress. */
  importProgress(solved: Record<string, number>, prizes: number[]): Promise<LevelProgressResponse | null>
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0
const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

export function parseProgress(data: unknown): LevelProgressResponse | null {
  if (!isObject(data) || !isObject(data.solved) || !Array.isArray(data.prizes)) return null
  const solved: Record<string, number> = {}
  for (const [id, tries] of Object.entries(data.solved)) if (isCount(tries)) solved[id] = tries
  const prizes = data.prizes.filter((n): n is number => isCount(n) && n >= 1)
  return { solved, prizes }
}

export function parseClaimPrize(data: unknown): ClaimPrizeResponse | null {
  if (!isObject(data) || typeof data.coins !== 'number') return null
  if (data.status === 'already_claimed') {
    return { status: 'already_claimed', itemId: null, coinsPaid: 0, coins: data.coins }
  }
  if (data.status !== 'ok' || !isCount(data.coins_paid)) return null
  return {
    status: 'ok',
    itemId: typeof data.item_id === 'string' ? data.item_id : null,
    coinsPaid: data.coins_paid,
    coins: data.coins,
  }
}

interface ClaimRow {
  status?: string
  coins_paid?: number
  coins?: number
}

async function claimQuestion(questionId: string, wrongTries: number): Promise<ClaimQuestionResponse | null> {
  const { data, error } = await supabase.rpc('claim_level_question', {
    p_question_id: questionId,
    p_wrong_tries: wrongTries,
  })
  if (error) {
    console.error('[levels] claim_level_question failed', { questionId, error })
    return null
  }
  const row = data as ClaimRow | null
  if (!row || (row.status !== 'ok' && row.status !== 'already_solved') || typeof row.coins !== 'number') {
    return null
  }
  return { status: row.status, coinsPaid: row.coins_paid ?? 0, coins: row.coins }
}

async function claimPrize(level: number): Promise<ClaimPrizeResponse | null> {
  const { data, error } = await supabase.rpc('claim_level_prize', { p_level: level })
  if (error) {
    console.error('[levels] claim_level_prize failed', { level, error })
    return null
  }
  return parseClaimPrize(data)
}

async function listProgress(): Promise<LevelProgressResponse | null> {
  const { data, error } = await supabase.rpc('list_level_progress')
  if (error) {
    console.error('[levels] list_level_progress failed', error)
    return null
  }
  return parseProgress(data)
}

async function importProgress(
  solved: Record<string, number>,
  prizes: number[],
): Promise<LevelProgressResponse | null> {
  const { data, error } = await supabase.rpc('import_level_progress', { p_solved: solved, p_prizes: prizes })
  if (error) {
    console.error('[levels] import_level_progress failed', error)
    return null
  }
  return parseProgress(data)
}

export const levelsApi: LevelsApi = { claimQuestion, claimPrize, listProgress, importProgress }
