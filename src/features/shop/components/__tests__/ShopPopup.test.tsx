import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShopPopup } from '../ShopPopup'

describe('ShopPopup', () => {
  it('renders a tab for each customization slot', () => {
    render(<ShopPopup onClose={() => {}} />)
    expect(screen.getByRole('tab', { name: 'SKIN' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'BALL' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'SOUNDS' })).toBeDefined()
  })

  it('opens on the Skin tab', () => {
    render(<ShopPopup onClose={() => {}} />)
    expect(screen.getByRole('tab', { name: 'SKIN' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText(/no keeper skins yet/i)).toBeDefined()
  })

  it('switches the empty state when another tab is picked', () => {
    render(<ShopPopup onClose={() => {}} />)

    fireEvent.click(screen.getByRole('tab', { name: 'BALL' }))
    expect(screen.getByText(/no ball skins yet/i)).toBeDefined()
    expect(screen.queryByText(/no keeper skins yet/i)).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: 'SOUNDS' }))
    expect(screen.getByText(/no goal sounds yet/i)).toBeDefined()
  })

  it('calls onClose from the close button', () => {
    const onClose = vi.fn()
    render(<ShopPopup onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ShopPopup onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the popup open when the panel itself is clicked', () => {
    const onClose = vi.fn()
    render(<ShopPopup onClose={onClose} />)
    fireEvent.click(screen.getByRole('tab', { name: 'SKIN' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})
