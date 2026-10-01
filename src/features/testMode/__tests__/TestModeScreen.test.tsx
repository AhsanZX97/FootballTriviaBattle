import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Question } from '../../../types/trivia'
import type { PitchCallbacks, PitchState } from '../../match/engine/contracts'

const engine = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), destroy: vi.fn() }))
vi.mock('../../match/engine/loadPitchGame', () => ({
  loadPitchGame: async () => ({ createPitchGame: engine.create }),
}))
vi.mock('../../../services/sound', () => ({
  play: vi.fn(), playGoalCelebration: vi.fn(), fadeOutCrowd: vi.fn(),
}))
const question: Question = {
  id: 'q1', prompt: 'Who won 2014?', correctAnswer: 'Germany',
  answers: ['Germany', 'Brazil', 'Spain', 'Italy'], difficulty: 'easy', category: 'World Cup',
}
vi.mock('../../../services/trivia/sampler', () => ({ sampleQuestions: () => [question] }))

import { TestModeScreen } from '../TestModeScreen'
import { QUESTION_TIME_SECONDS } from '../../match/store'
import { play } from '../../../services/sound'

let pitch: PitchState
let callbacks: PitchCallbacks

async function mount(onExit = vi.fn()) {
  render(<TestModeScreen onExit={onExit} />)
  await act(async () => {})
  return onExit
}

const button = (name: RegExp) => screen.getByRole('button', { name })
const complete = () => act(() => callbacks.onEvent('complete', pitch.feedback!))

beforeEach(() => {
  vi.clearAllMocks()
  engine.create.mockImplementation((_parent: HTMLElement, state: PitchState, events: PitchCallbacks) => {
    pitch = state
    callbacks = events
    return { update: engine.update, destroy: engine.destroy }
  })
  engine.update.mockImplementation((state: PitchState) => { pitch = state })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TestModeScreen', () => {
  it('opens on an idle pitch with the ball and keeper waiting', async () => {
    await mount()
    expect(engine.create).toHaveBeenCalledOnce()
    expect(pitch.feedback).toBeNull()
    expect(pitch.dimmed).toBe(false)
  })

  it('dives the keeper right for a goal, then returns to idle on completion', async () => {
    await mount()
    fireEvent.click(button(/dive right/i))
    expect(pitch).toMatchObject({ stage: 'shoot', feedback: 'goal', reaction: 'wrong-way' })
    complete()
    expect(pitch.feedback).toBeNull()
  })

  it('dives the keeper left for a save with my keeper in goal', async () => {
    await mount()
    fireEvent.click(button(/dive left · save/i))
    expect(pitch).toMatchObject({ stage: 'keep', feedback: 'save' })
  })

  it('locks the controls while a shot plays so the animation is never cut short', async () => {
    await mount()
    fireEvent.click(button(/miss/i))
    expect((button(/dive right/i) as HTMLButtonElement).disabled).toBe(true)
    complete()
    expect((button(/dive right/i) as HTMLButtonElement).disabled).toBe(false)
  })

  it('replays the same animation twice in a row', async () => {
    await mount()
    fireEvent.click(button(/keeper stays/i))
    complete()
    fireEvent.click(button(/keeper stays/i))
    expect(pitch).toMatchObject({ feedback: 'goal', reaction: 'frozen' })
  })

  it('plays the match sounds on the engine cues', async () => {
    await mount()
    fireEvent.click(button(/dive right/i))
    act(() => callbacks.onEvent('kick', 'goal'))
    expect(play).toHaveBeenCalledWith('kick')
  })

  it('pops up trivia over a dimmed pitch; a right answer scores', async () => {
    await mount()
    fireEvent.click(button(/trivia/i))
    expect(screen.getByText('Who won 2014?')).toBeDefined()
    expect(pitch.dimmed).toBe(true)
    fireEvent.click(button(/^germany$/i))
    expect(pitch).toMatchObject({ feedback: 'goal', dimmed: false })
    expect(screen.queryByText('Who won 2014?')).toBeNull()
  })

  it('shows the Ronaldo picture question; the right name scores', async () => {
    await mount()
    fireEvent.click(button(/picture/i))
    expect(screen.getByRole('img', { name: /who is this player/i })).toBeDefined()
    expect(pitch.dimmed).toBe(true)
    fireEvent.click(button(/^cristiano ronaldo$/i))
    expect(pitch).toMatchObject({ feedback: 'goal', dimmed: false })
  })

  it('turns a wrong picture answer into a miss', async () => {
    await mount()
    fireEvent.click(button(/picture/i))
    fireEvent.click(button(/^lionel messi$/i))
    expect(pitch.feedback).toBe('miss')
  })

  it('turns a wrong trivia answer into a miss', async () => {
    await mount()
    fireEvent.click(button(/trivia/i))
    fireEvent.click(button(/^brazil$/i))
    expect(pitch.feedback).toBe('miss')
  })

  it('answers trivia as the keeper once the stage is switched', async () => {
    await mount()
    fireEvent.click(button(/stage: shoot/i))
    fireEvent.click(button(/trivia/i))
    fireEvent.click(button(/^brazil$/i))
    expect(pitch).toMatchObject({ stage: 'keep', feedback: 'concede' })
  })

  it('treats a trivia timeout as a miss, like a real match', async () => {
    await mount()
    fireEvent.click(button(/trivia/i))
    for (let i = 0; i < QUESTION_TIME_SECONDS; i++) act(() => vi.advanceTimersByTime(1000))
    expect(pitch.feedback).toBe('miss')
  })

  it('exits back to the menu', async () => {
    const onExit = await mount()
    fireEvent.click(button(/exit/i))
    expect(onExit).toHaveBeenCalledOnce()
  })
})
