import { describe, expect, it } from 'vitest'
import { createQueue, dequeue, enqueue } from '../matchmaking'

const player = (id: string, name = id) => ({ id, name })

describe('enqueue', () => {
  it('holds a lone player waiting with no pair yet', () => {
    const { queue, pair } = enqueue(createQueue(), player('p1'))
    expect(pair).toBeNull()
    expect(queue.waiting).toEqual([player('p1')])
  })

  it('pairs the first two players in FIFO order and empties the queue', () => {
    const afterFirst = enqueue(createQueue(), player('p1'))
    const { queue, pair } = enqueue(afterFirst.queue, player('p2'))
    expect(pair).toEqual([player('p1'), player('p2')])
    expect(queue.waiting).toEqual([])
  })

  it('leaves a third player waiting after a pair forms', () => {
    let result = enqueue(createQueue(), player('p1'))
    result = enqueue(result.queue, player('p2'))
    result = enqueue(result.queue, player('p3'))
    expect(result.pair).toBeNull()
    expect(result.queue.waiting).toEqual([player('p3')])
  })
})

describe('dequeue', () => {
  it('removes a specific waiting player', () => {
    const { queue } = enqueue(createQueue(), player('p1'))
    expect(dequeue(queue, 'p1').waiting).toEqual([])
  })

  it('is a no-op for an id that is not queued', () => {
    const { queue } = enqueue(createQueue(), player('p1'))
    expect(dequeue(queue, 'missing').waiting).toEqual([player('p1')])
  })
})
