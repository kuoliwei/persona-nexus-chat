import { defineConfig } from 'vite';

export default defineConfig({
  // 同源部署：Caddy 把 /chat* 原樣轉發給這台 dev server（不 strip prefix），
  // base 必須跟 Caddy 的路徑對齊，否則資產（JS/CSS）會用絕對路徑 /src/... 請求，
  // 掉進 Caddy 的預設 catch-all（lobby），載入到錯的前端資產。
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
