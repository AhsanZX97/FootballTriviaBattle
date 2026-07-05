import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { isNative } from './services/platform'
import './index.css'
import App from './App.tsx'

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

if (isNative) {
  // Native-only styles and behaviour hang off this class; never added on web.
  document.documentElement.classList.add('native')
  // Hydrate durable storage and set up the shell before the first paint, then
  // reveal by hiding the splash. The web path renders synchronously, unchanged.
  void import('./services/native').then(async ({ initNative, hideSplash }) => {
    await initNative()
    render()
    hideSplash()
  })
} else {
  render()
}
