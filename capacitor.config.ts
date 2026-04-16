import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.xplay.app",
  appName: "XPLAY",
  webDir: "dist",

  ios: {
    // Deep-link scheme: xplay://auth/callback handles Supabase auth redirects
    scheme: "xplay",
    contentInset: "never",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#120A25",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#120A25",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
