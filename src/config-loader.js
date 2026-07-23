let config = null;

export async function loadConfig() {
  if (config) return config;

  try {
    const response = await fetch('/api/config');
    config = await response.json();
    console.log('✅ [config-loader] 從 gateway 載入配置成功:', config);
    return config;
  } catch (error) {
    console.warn('⚠️ [config-loader] 無法從 gateway 載入配置:', error.message);
    throw error;
  }
}

export function getConfig() {
  if (!config) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return config;
}
