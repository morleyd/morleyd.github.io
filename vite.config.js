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
    rollupOptions: {
      output: {
        // Split the big framework deps out of the eager entry chunk: they change
        // rarely (better long-term caching) and it keeps each chunk under Vite's
        // 500 kB warning threshold. Route views are already lazy-loaded.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('vuetify')) return 'vuetify'
          if (id.includes('/vue/') || id.includes('vue-router') || id.includes('/@vue/') || id.includes('pinia')) return 'vue'
        },
      },
    },
  },
  publicDir: 'public',
})
