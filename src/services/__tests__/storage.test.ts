import { getItem, removeItem, setItem } from '../storage'

describe('storage', () => {
  beforeEach(() => localStorage.clear())

  it('returns null for a key that was never set', () => {
    expect(getItem('missing')).toBeNull()
  })

  it('round-trips a value through set and get', () => {
    setItem('greeting', 'hello')
    expect(getItem('greeting')).toBe('hello')
  })

  it('overwrites an existing value', () => {
    setItem('k', 'first')
    setItem('k', 'second')
    expect(getItem('k')).toBe('second')
  })

  it('removes a stored value', () => {
    setItem('k', 'v')
    removeItem('k')
    expect(getItem('k')).toBeNull()
  })
})
