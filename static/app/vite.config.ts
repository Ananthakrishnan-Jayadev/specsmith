import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge Custom UI serves files from the resource directory, so asset URLs must be
// relative (base: './'). The default CSP blocks inline scripts, so no modulepreload polyfill.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'build',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
});
