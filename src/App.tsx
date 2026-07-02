import { useState } from 'react'
import { IntroScreen } from './features/menu/IntroScreen'
import { MatchScreen } from './features/match/MatchScreen'
import { matchStore } from './features/match/store'

function App() {
  const [screen, setScreen] = useState<'intro' | 'match'>('intro')

  if (screen === 'match') return <MatchScreen />
  return (
    <IntroScreen
      onPlay={() => {
        void matchStore.start()
        setScreen('match')
      }}
    />
  )
}

export default App
