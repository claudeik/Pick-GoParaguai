import type { CapacitorConfig } from '@capacitor/cli';

// App do turista na Play Store e na App Store, publicado pela EPYX.
// O appId é o mesmo nas duas lojas e não muda depois da primeira publicação.
const config: CapacitorConfig = {
  appId: 'br.com.epyx.pickgo',
  appName: 'Pick & Go',
  webDir: 'dist-turista',
  plugins: {
    PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] },
  },
};

export default config;
