// QA-only harness for the 002 design-system preview (not routed until F1/F2). Builds outside the repo:
//   npx vite build --config tests/qa/002/harness/vite.config.mjs   → $QA_HARNESS_OUT or <tmp>/pf-qa-002-harness
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss()],
  build: { outDir: process.env.QA_HARNESS_OUT || join(tmpdir(), 'pf-qa-002-harness'), emptyOutDir: true },
});
