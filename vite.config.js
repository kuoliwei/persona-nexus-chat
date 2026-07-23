import { defineConfig } from 'vite';

export default defineConfig({
  base: '/chat/',
  server: {
    port: 5176,
    strictPort: true,
  },
});
