import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TwitterLink } from '../TwitterLink'

describe('TwitterLink', () => {
  it('points at the developer X profile', () => {
    render(<TwitterLink />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://x.com/RedZX97')
  })

  it('opens outside the app so the game is never navigated away from', () => {
    render(<TwitterLink />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('is labelled for screen readers', () => {
    render(<TwitterLink />)
    expect(screen.getByLabelText('Follow the developer on Twitter').tagName).toBe('A')
  })
})
