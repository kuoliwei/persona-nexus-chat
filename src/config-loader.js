let config = null;

// 開發模式默認配置
const fallbackConfig = {
  services: {
    gateway: 'http://localhost:8000',
  },
  frontends: {
    web: 'http://localhost:5173',
    character: 'http://localhost:5174',
    lobby: 'http://localhost:5175',
  }
};

export async function loadConfig() {
  if (config) return config;

  try {
    const response = await fetch('http://localhost:8000/api/config');
    config = await response.json();
    console.log('✅ [config-loader] 從 gateway 載入配置成功:', config);
    return config;
  } catch (error) {
    console.warn('⚠️ [config-loader] 無法從 gateway 載入配置，使用 fallback:', error.message);
    config = fallbackConfig;
    return config;
  }
}

export function getConfig() {
  if (!config) {
    console.warn('⚠️ [config-loader] Config 未載入，使用 fallback 配置');
    return fallbackConfig;
  }
  return config;
}
