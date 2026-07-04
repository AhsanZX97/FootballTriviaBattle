import { useState } from 'react'
import { IntroScreen } from './features/menu/IntroScreen'
import { MatchScreen } from './features/match/MatchScreen'
import { matchStore } from './features/match/store'
import { LobbyScreen } from './features/lobby/LobbyScreen'
import { lobbyStore } from './features/lobby/store'

function App() {
  const [screen, setScreen] = useState<'intro' | 'lobby' | 'match'>('intro')
  // Where the current match exits to. Captured at launch so it can't be
  // disturbed by the store reset the exit buttons trigger before onExit runs.
  const [matchExit, setMatchExit] = useState<'intro' | 'lobby'>('intro')

  if (screen === 'match') {
    return <MatchScreen onExit={() => setScreen(matchExit)} />
  }
  if (screen === 'lobby') {
    return (
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
  }
  return (
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

export default App
