import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    target: 'node20',
    outDir: resolve(__dirname, 'dist/server'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/main/web/server.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js'
    },
    ssr: true,
    rollupOptions: {
      external: [
        'better-sqlite3',
        '@libsql/client',
        'electron',
        'fsevents'
      ]
    }
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
