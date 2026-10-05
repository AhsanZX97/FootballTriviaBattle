import { supabase } from './supabase'

/** What `claim_level_question` reports: coins this claim paid (0 for a repeat)
 * and the resulting balance, so the counter updates without a refetch. */
export interface ClaimQuestionResponse {
  status: 'ok' | 'already_solved'
  coinsPaid: number
  coins: number
}

/** The level operations the level store depends on. An interface so the
 * store's tests can inject a fake (same seam as `CustomizationApi`). */
export interface LevelsApi {
  /** Null for every failure: unknown id, transport error, malformed reply. */
  claimQuestion(questionId: string, wrongTries: number): Promise<ClaimQuestionResponse | null>
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

export const levelsApi: LevelsApi = { claimQuestion }
