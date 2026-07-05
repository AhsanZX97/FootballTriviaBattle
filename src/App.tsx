import { useEffect, useRef, useState } from 'react'
import { IntroScreen } from './features/menu/IntroScreen'
import { MatchScreen } from './features/match/MatchScreen'
import { matchStore } from './features/match/store'
import { LobbyScreen } from './features/lobby/LobbyScreen'
import { lobbyStore } from './features/lobby/store'
import { getMasterVolume, playTheme, setMasterVolume, stopTheme } from './services/sound'
import { isNative } from './services/platform'
import volumeIcon from './assets/volume-icon.png'
import volumeMuteIcon from './assets/volume-mute-icon.png'

type Screen = 'intro' | 'lobby' | 'match'

// ponytail: lives in App.tsx like MatchScreen's sub-components; graduate to
// its own file if it grows settings beyond one slider.
function SoundControl({ screen }: { screen: Screen }) {
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
      )}
      {/* touch devices can't double-click to mute, so native gets an explicit
          button; web keeps the double-click and never renders this */}
      {open && isNative && (
        <button type="button" className="sound__mute" onClick={toggleMute}>
          {volume === 0 ? 'UNMUTE' : 'MUTE'}
        </button>
      )}
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<Screen>('intro')
  // Where the current match exits to. Captured at launch so it can't be
  // disturbed by the store reset the exit buttons trigger before onExit runs.
  const [matchExit, setMatchExit] = useState<'intro' | 'lobby'>('intro')

  // theme plays over the menus, stops for the match, resumes on the way back
  useEffect(() => {
    if (screen === 'match') stopTheme()
    else playTheme()
  }, [screen])

  // Android hardware back button (native only). Registered once; a ref feeds it
  // the live screen so it doesn't need re-subscribing on every navigation.
  const screenRef = useRef(screen)
  useEffect(() => {
    screenRef.current = screen
  }, [screen])
  useEffect(() => {
    if (!isNative) return
    let handle: { remove: () => void } | undefined
    let cancelled = false
    void import('@capacitor/app').then(({ App: CapApp }) => {
      void CapApp.addListener('backButton', () => {
        const s = screenRef.current
        if (s === 'intro') void CapApp.exitApp()
        else if (s === 'lobby') setScreen('intro')
        // in a match the on-screen buttons own every exit
      }).then((h) => {
        if (cancelled) h.remove()
        else handle = h
      })
    })
    return () => {
      cancelled = true
      handle?.remove()
    }
  }, [])

  // Keep the screen awake during a match (native only) — the opponent's kick
  // can leave the player watching without touching the screen.
  useEffect(() => {
    if (!isNative) return
    void import('@capacitor-community/keep-awake').then(({ KeepAwake }) => {
      if (screen === 'match') void KeepAwake.keepAwake()
      else void KeepAwake.allowSleep()
    })
  }, [screen])

  let content
  if (screen === 'match') {
    content = (
      <MatchScreen onExit={() => setScreen(matchExit)} onMainMenu={() => setScreen('intro')} />
    )
  } else if (screen === 'lobby') {
    content = (
      <LobbyScreen
        onBack={() => setScreen('intro')}
        onMatchReady={(session) => {
          matchStore.start1v1(session)
          // Lobby's job is done — clear it so returning here shows the name
          // form, not a replay of this match's found/countdown sequence.
          lobbyStore.reset()
          setMatchExit('lobby')
          setScreen('match')
        }}
      />
    )
  } else {
    content = (
      <IntroScreen
        onPlay={() => {
          void matchStore.start()
          setMatchExit('intro')
          setScreen('match')
        }}
        onOneVOne={() => {
          // fresh identity each visit — the lobby never reuses last session's name
          lobbyStore.rerollName()
          setScreen('lobby')
        }}
      />
    )
  }

  return (
    <>
      <SoundControl screen={screen} />
      {content}
    </>
  )
}

export default App
