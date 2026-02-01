import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flow.speedreader',
  appName: 'Flow',
  webDir: 'dist',
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000'
    }
  },
  
  android: {
    backgroundColor: '#000000',
    allowMixedContent: true
  },
  
  ios: {
    backgroundColor: '#000000',
    contentInset: 'automatic',
    scheme: 'Flow'
  }
};

export default config;
