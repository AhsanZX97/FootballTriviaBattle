import { useEffect, useRef, useState } from 'react'
import { IntroScreen } from './features/menu/IntroScreen'
import { TopBar } from './features/menu/components/TopBar'
import { MatchScreen } from './features/match/MatchScreen'
import { matchStore } from './features/match/store'
import { LobbyScreen } from './features/lobby/LobbyScreen'
import { lobbyStore } from './features/lobby/store'
import { AuthScreen } from './features/auth/AuthScreen'
import { authStore } from './features/auth/store'
import { presenceStore } from './features/friends/presenceStore'
import { friendsStore } from './features/friends/store'
import { ChallengeOverlay } from './features/friends/components/ChallengeOverlay'
import { FriendsPopup } from './features/friends/components/FriendsPopup'
import { playTheme, stopTheme } from './services/sound'
import { isNative } from './services/platform'

type Screen = 'intro' | 'lobby' | 'match' | 'auth'

function App() {
  const [screen, setScreen] = useState<Screen>('intro')
  // Where the current match exits to. Captured at launch so it can't be
  // disturbed by the store reset the exit buttons trigger before onExit runs.
  const [matchExit, setMatchExit] = useState<'intro' | 'lobby'>('intro')
  // Friends picker opened from the lobby's FRIENDLY MATCH button. App owns it so
  // the lobby screen stays free of the friends/presence module graph.
  const [friendsPickerOpen, setFriendsPickerOpen] = useState(false)

  // theme plays over the menus, stops for the match, resumes on the way back
  useEffect(() => {
    if (screen === 'match') stopTheme()
    else playTheme()
  }, [screen])

  // A friend challenge (from either side) resolves to a live match here: adopt
  // the presence socket as the match socket and jump straight into the match.
  useEffect(() => {
    return presenceStore.onMatchReady((session) => {
      matchStore.start1v1(session)
      setMatchExit('intro')
      setScreen('match')
    })
  }, [])

  // Wire the two friends stores together without either importing the other:
  // outgoing friend actions ping the other user via presence; an incoming ping
  // refreshes our friends list live (so the request badge appears at once).
  useEffect(() => {
    friendsStore.setNotifier((ids) => void presenceStore.notifyFriends(ids))
    return presenceStore.onFriendsChanged(() => void friendsStore.refresh())
  }, [])

  // The presence socket hands itself to the match on a challenge, so it needs
  // re-opening whenever we're back on a menu screen and still signed in (the
  // initial connect is driven by the auth store; this covers post-match).
  useEffect(() => {
    if (screen !== 'match' && authStore.getState().status === 'signedIn') {
      void presenceStore.connect()
    }
    // the lobby-only friends picker shouldn't survive a screen change
    if (screen !== 'lobby') setFriendsPickerOpen(false)
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
        else if (s === 'lobby' || s === 'auth') setScreen('intro')
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
        onFriendlyMatch={() => setFriendsPickerOpen(true)}
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
  } else if (screen === 'auth') {
    content = <AuthScreen onBack={() => setScreen('intro')} onAuthenticated={() => setScreen('intro')} />
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
        onSignIn={() => setScreen('auth')}
      />
    )
  }

  return (
    <>
      <TopBar screen={screen} />
      {screen !== 'match' && <ChallengeOverlay />}
      {content}
      {friendsPickerOpen && screen === 'lobby' && (
        <FriendsPopup
          onClose={() => setFriendsPickerOpen(false)}
          onChallenge={(friendId, username) => {
            void presenceStore.challenge(friendId, username)
            setFriendsPickerOpen(false)
          }}
        />
      )}
    </>
  )
}

export default App
