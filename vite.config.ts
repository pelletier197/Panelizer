import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/Panelizer/',
  build: {
    // The libraries' file is mostly three.js, which the editor needs from the
    // first frame: there is nothing in it to put off.
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Libraries in a file of their own: they change far less often than the
        // app, so a release only makes visitors fetch the app's own code again.
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules/ }],
        },
      },
    },
  },
  test: {
    // The suite covers the pure `lib/` layer, so no DOM is needed; the few
    // browser APIs used there (localStorage) are stubbed per-test.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
