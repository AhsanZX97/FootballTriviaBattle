import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Sprite } from '../Sprite'

describe('Sprite', () => {
  it('renders a decorative image for the named sprite', () => {
    const { container } = render(<Sprite name="trophy" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('alt')).toBe('')
    expect(img?.getAttribute('aria-hidden')).toBe('true')
    expect(img?.getAttribute('src')).toBeTruthy()
    expect(img?.className).toContain('sprite')
  })

  it('appends a caller-supplied class alongside the base class', () => {
    const { container } = render(<Sprite name="ball" className="pmc__ball" />)
    const img = container.querySelector('img')
    expect(img?.className).toBe('sprite pmc__ball')
  })
})
