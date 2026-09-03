import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Builds a single self-contained HTML file with mock, in-memory data instead
 * of the real API — for opening the console with no backend or database.
 * `npm run build:demo` runs this. Everything else (components, styles,
 * business logic) is shared with the real app; only api/client.ts is
 * swapped for api/mock.ts.
 */
export default defineConfig({
  mode: 'demo',
  plugins: [react(), viteSingleFile()],
  resolve: {
    // Regex aliases are substituted via String.replace(find, replacement), which
    // only swaps the matched span — so `find` must match the whole specifier
    // (anchored) or the leading "../"/"../../" survives and mangles the path.
    alias: [{ find: /^(\.\.\/)+api\/client$/, replacement: path.resolve(import.meta.dirname, 'src/api/mock.ts') }],
  },
  build: {
    outDir: 'dist-demo',
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'demo.html'),
    },
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
  },
})
