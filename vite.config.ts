/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Dev-only animation sandbox. `false` in the Play release build lets Vite drop
  // the menu entry and the whole test-mode chunk; scripts/assertNoTestMode.mjs
  // fails the release if any of it survives.
  define: {
    __TEST_MODE__: JSON.stringify(mode !== 'release'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
}))
