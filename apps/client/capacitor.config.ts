import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Mobil uygulama (Capacitor) ayarı. Web derlemesi (dist/) uygulamanın içine gömülür;
 * sunucu bağlantısı wss://api.kuralokey.com üzerinden (connection.ts).
 *
 * appId mağazaya ilk yüklemeden sonra DEĞİŞTİRİLEMEZ.
 */
const config: CapacitorConfig = {
  appId: 'com.kuralokey.app',
  appName: 'Küt',
  webDir: 'dist',
  // Android WebView'in kökeni https://localhost (sunucu ALLOWED_ORIGINS'te var)
  android: {
    backgroundColor: '#0a2a2e',
  },
  ios: {
    backgroundColor: '#0a2a2e',
    contentInset: 'never',
  },
};

export default config;
