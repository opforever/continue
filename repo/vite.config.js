import { defineConfig } from 'vite';

// The dev/preview servers bind to every interface so the game can be opened from
// another device on the LAN or through a proxied sandbox preview host.
const hostAllow = true;

export default defineConfig({
  server: { host: '0.0.0.0', port: 5173, strictPort: false, allowedHosts: hostAllow },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: hostAllow },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Keep the engine in its own long-lived cache entry, separate from game code.
        manualChunks: { three: ['three'] },
      },
    },
  },
});
