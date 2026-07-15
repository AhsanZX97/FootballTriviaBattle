import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CoinReward } from '../CoinReward'

describe('CoinReward', () => {
  it('shows the spinning coin and "+ N" for a positive gain', () => {
    const { container, getByText } = render(<CoinReward amount={3} />)
    expect(getByText('+ 3')).not.toBeNull()
    expect(container.querySelector('.coin-reward__coin')).not.toBeNull()
  })

  it('announces the gain to assistive tech via a status label', () => {
    const { getByRole } = render(<CoinReward amount={5} />)
    expect(getByRole('status').getAttribute('aria-label')).toBe('You earned 5 coins')
  })

  it('renders nothing when there was no gain', () => {
    expect(render(<CoinReward amount={null} />).container.firstChild).toBeNull()
    expect(render(<CoinReward amount={0} />).container.firstChild).toBeNull()
  })
})
