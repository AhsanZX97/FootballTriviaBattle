import type { CapacitorConfig } from '@capacitor/cli'

// On-device live reload: set CAP_SERVER_URL to this machine's LAN dev URL
// (e.g. http://192.168.1.124:5173) before `npx cap run android`, and the app
// loads straight from the Vite dev server with hot reload. Leave it UNSET for
// any build you install or ship — the app then serves the bundled dist, and no
// cleartext dev URL can leak into a release.
const devServerUrl = process.env.CAP_SERVER_URL

const config: CapacitorConfig = {
  appId: 'com.degreatahsan.footballtriviabattle',
  appName: 'Football Trivia Battle',
  // Capacitor bundles the Vite build; `npm run build` must run before `cap sync`.
  webDir: 'dist',
  android: {
    // the app talks to Render over wss:// only — never allow cleartext mixed content
    allowMixedContent: false,
  },
  // only present during live reload; cleartext lets the http dev server load
  ...(devServerUrl ? { server: { url: devServerUrl, cleartext: true } } : {}),
  plugins: {
    SplashScreen: {
      // we hide it manually from the native bootstrap once React has mounted
      launchAutoHide: false,
      backgroundColor: '#04140b',
    },
  },
}

export default config
