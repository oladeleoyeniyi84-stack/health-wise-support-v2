import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deleboston.healthwise',
  appName: 'Healthwise Support',
  webDir: 'dist/public',
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#1e40af",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: "DEFAULT",
      backgroundColor: "#1e40af"
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#1e40af",
      sound: "beep.wav"
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"]
    }
  },
  ios: {
    contentInset: "never",
    allowsLinkPreview: false,
    preferredContentMode: "mobile"
  }
};

export default config;
