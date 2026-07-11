import { useEffect, useRef, useState } from 'react'
import { getMasterVolume, setMasterVolume } from '../../../services/sound'
import { isNative } from '../../../services/platform'
import volumeIcon from '../../../assets/volume-icon.png'
import volumeMuteIcon from '../../../assets/volume-mute-icon.png'
import './SoundControl.css'

type Props = {
  /** Any screen change retracts the slider. */
  screen: string
}

/** Master-volume control. Lives in the TopBar's right slot; its expanded slider
 * and native mute button sit in an absolutely-positioned panel so opening them
 * never grows the top bar's row height (which would knock the other icons off
 * their shared centre line). Previously inlined in App.tsx. */
export function SoundControl({ screen }: Props) {
  const [open, setOpen] = useState(false)
  const [volume, setVolume] = useState(getMasterVolume)
  const rootRef = useRef<HTMLDivElement>(null)
  // last non-zero volume, restored when double-click unmutes
  const preMuteVolumeRef = useRef(volume > 0 ? volume : 1)

  // slider retracts when the app moves to another screen
  useEffect(() => setOpen(false), [screen])

  // shared by web's double-click-to-mute and native's explicit MUTE button
  const toggleMute = () => {
    if (volume > 0) {
      preMuteVolumeRef.current = volume
      setVolume(0)
      setMasterVolume(0)
    } else {
      const restored = preMuteVolumeRef.current || 1
      setVolume(restored)
      setMasterVolume(restored)
    }
  }

  // ...and on any press outside the control
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className="sound" ref={rootRef}>
      <button
        type="button"
        className="sound__toggle"
        aria-label={open ? 'hide volume slider' : 'show volume slider'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          toggleMute()
        }}
      >
        <img
          className="sound__toggle-img"
          src={volume === 0 ? volumeMuteIcon : volumeIcon}
          alt=""
        />
      </button>
      {open && (
        <div className="sound__panel">
          <input
            type="range"
            className="sound__slider"
            aria-label="master volume"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              setVolume(v)
              setMasterVolume(v)
            }}
          />
          {/* touch devices can't double-click to mute, so native gets an explicit
              button; web keeps the double-click and never renders this */}
          {isNative && (
            <button type="button" className="sound__mute" onClick={toggleMute}>
              {volume === 0 ? 'UNMUTE' : 'MUTE'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
