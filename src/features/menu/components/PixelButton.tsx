import './PixelButton.css'

type Props = {
  label: string
  onClick?: () => void
  variant?: 'primary' | 'secondary'
}

export function PixelButton({ label, onClick, variant = 'primary' }: Props) {
  return (
    <button className={`pixel-btn pixel-btn--${variant}`} onClick={onClick}>
      {label}
    </button>
  )
}
