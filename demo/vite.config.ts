import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Served from GitHub Pages at /<repo>/; `npm run build:demo` writes to docs/.
  base: process.env.DEMO_BASE ?? '/',
  build: { outDir: fileURLToPath(new URL('../docs', import.meta.url)), emptyOutDir: true },
  plugins: [react()],
  resolve: {
    // Order matters: the more specific alias must come first.
    alias: [
      { find: 'react-simple-schema-form/styles.css', replacement: src('styles.css') },
      { find: 'react-simple-schema-form', replacement: src('index.ts') },
    ],
  },
});
