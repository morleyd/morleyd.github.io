import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const projectRoot = fileURLToPath(new URL('./', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  // Served at the root of morleyd.github.io (user site), so base is '/'
  base: '/',
  plugins: [
    vue(),
    vuetify({
      autoImport: true,
    }),
  ],
  server: {
    host: true,
    port: 3000,
    fs: {
      allow: [projectRoot],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
  },
  publicDir: 'public',
})
