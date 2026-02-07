import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.agroguard.app",
  appName: "AgroGuard",
  webDir: "build",
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#0f3b23",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true
    }
  }
};

export default config;
