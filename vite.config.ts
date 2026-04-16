import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // ─── base path ──────────────────────────────────────────────────────────────
  // Capacitor (iOS/Android) loads from the device filesystem (file:// protocol)
  // and requires relative paths: base = './'
  //
  // Vercel (web) needs absolute paths: base = '/'
  // Without '/', nested routes like /auth/callback try to load assets from
  // /auth/assets/... instead of /assets/..., causing a MIME-type crash.
  //
  // Usage:
  //   Web build (Vercel):       npm run build           → base = '/'
  //   Mobile build (Capacitor): npm run build:mobile    → base = './'
  base: process.env.VITE_CAPACITOR === "true" ? "./" : "/",

  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
