import { defineConfig } from 'vite';

export default defineConfig({
  base: '/chat/',
  server: {
    port: 5176,
    strictPort: true,
    // 綁定所有介面：反向代理（Caddy）跑在容器裡，只綁 localhost 的話
    // 容器透過 host.docker.internal 連進來會被拒絕，導致整站 502。
    host: true,
    // Caddy 會原樣轉發 Host 標頭（localhost:8080），需明確放行。
    allowedHosts: true,
  },
});
