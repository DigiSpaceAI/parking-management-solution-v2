import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.parkos.parkflow.attendant',
  appName: 'ParkFlow Attendant',
  // Points at the dedicated mobile-only build (vite.mobile.config.ts),
  // never the full admin dashboard bundle.
  webDir: 'dist-mobile',
  server: {
    // During development, point this at your live backend so the app
    // talks to the real API instead of trying to bundle it locally.
    // Replace with your actual Cloud Run URL before building for real
    // devices/release. Comment this whole `server` block out once you
    // switch to a production build that calls a hardcoded API base URL
    // instead of relying on this dev-only override.
    androidScheme: 'https',
  },
};

export default config;
