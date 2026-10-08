import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Separate config from vite.config.ts on purpose: this builds ONLY the
// ParkFlow attendant app (mobile.html -> src/main-mobile.tsx), not the
// full admin dashboard, so the Capacitor-wrapped app stays small and
// attendants never ship admin-only code to their phones.
export default defineConfig(() => {
  const buildTimestamp = new Date().toISOString();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_TIMESTAMP__: JSON.stringify(buildTimestamp),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist-mobile',
      rollupOptions: {
        input: path.resolve(__dirname, 'mobile.html'),
      },
    },
  };
});
