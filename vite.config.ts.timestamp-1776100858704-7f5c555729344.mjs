// vite.config.ts
import { defineConfig } from "file:///sessions/dreamy-peaceful-keller/mnt/XPLAY_AppStore_Migration/xplay-capacitor-ready/node_modules/vite/dist/node/index.js";
import react from "file:///sessions/dreamy-peaceful-keller/mnt/XPLAY_AppStore_Migration/xplay-capacitor-ready/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///sessions/dreamy-peaceful-keller/mnt/XPLAY_AppStore_Migration/xplay-capacitor-ready/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/sessions/dreamy-peaceful-keller/mnt/XPLAY_AppStore_Migration/xplay-capacitor-ready";
var vite_config_default = defineConfig(({ mode }) => ({
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
      overlay: false
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"]
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvc2Vzc2lvbnMvZHJlYW15LXBlYWNlZnVsLWtlbGxlci9tbnQvWFBMQVlfQXBwU3RvcmVfTWlncmF0aW9uL3hwbGF5LWNhcGFjaXRvci1yZWFkeVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL3Nlc3Npb25zL2RyZWFteS1wZWFjZWZ1bC1rZWxsZXIvbW50L1hQTEFZX0FwcFN0b3JlX01pZ3JhdGlvbi94cGxheS1jYXBhY2l0b3ItcmVhZHkvdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL3Nlc3Npb25zL2RyZWFteS1wZWFjZWZ1bC1rZWxsZXIvbW50L1hQTEFZX0FwcFN0b3JlX01pZ3JhdGlvbi94cGxheS1jYXBhY2l0b3ItcmVhZHkvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcblxuLy8gaHR0cHM6Ly92aXRlanMuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XG4gIC8vIFx1MjUwMFx1MjUwMFx1MjUwMCBiYXNlIHBhdGggXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXHUyNTAwXG4gIC8vIENhcGFjaXRvciAoaU9TL0FuZHJvaWQpIGxvYWRzIGZyb20gdGhlIGRldmljZSBmaWxlc3lzdGVtIChmaWxlOi8vIHByb3RvY29sKVxuICAvLyBhbmQgcmVxdWlyZXMgcmVsYXRpdmUgcGF0aHM6IGJhc2UgPSAnLi8nXG4gIC8vXG4gIC8vIFZlcmNlbCAod2ViKSBuZWVkcyBhYnNvbHV0ZSBwYXRoczogYmFzZSA9ICcvJ1xuICAvLyBXaXRob3V0ICcvJywgbmVzdGVkIHJvdXRlcyBsaWtlIC9hdXRoL2NhbGxiYWNrIHRyeSB0byBsb2FkIGFzc2V0cyBmcm9tXG4gIC8vIC9hdXRoL2Fzc2V0cy8uLi4gaW5zdGVhZCBvZiAvYXNzZXRzLy4uLiwgY2F1c2luZyBhIE1JTUUtdHlwZSBjcmFzaC5cbiAgLy9cbiAgLy8gVXNhZ2U6XG4gIC8vICAgV2ViIGJ1aWxkIChWZXJjZWwpOiAgICAgICBucG0gcnVuIGJ1aWxkICAgICAgICAgICBcdTIxOTIgYmFzZSA9ICcvJ1xuICAvLyAgIE1vYmlsZSBidWlsZCAoQ2FwYWNpdG9yKTogbnBtIHJ1biBidWlsZDptb2JpbGUgICAgXHUyMTkyIGJhc2UgPSAnLi8nXG4gIGJhc2U6IHByb2Nlc3MuZW52LlZJVEVfQ0FQQUNJVE9SID09PSBcInRydWVcIiA/IFwiLi9cIiA6IFwiL1wiLFxuXG4gIHNlcnZlcjoge1xuICAgIGhvc3Q6IFwiOjpcIixcbiAgICBwb3J0OiA4MDgwLFxuICAgIGhtcjoge1xuICAgICAgb3ZlcmxheTogZmFsc2UsXG4gICAgfSxcbiAgfSxcbiAgcGx1Z2luczogW3JlYWN0KCksIG1vZGUgPT09IFwiZGV2ZWxvcG1lbnRcIiAmJiBjb21wb25lbnRUYWdnZXIoKV0uZmlsdGVyKEJvb2xlYW4pLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIFwiQFwiOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgIH0sXG4gICAgZGVkdXBlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiLCBcInJlYWN0L2pzeC1ydW50aW1lXCIsIFwiQHRhbnN0YWNrL3JlYWN0LXF1ZXJ5XCJdLFxuICB9LFxuICBvcHRpbWl6ZURlcHM6IHtcbiAgICBpbmNsdWRlOiBbXCJyZWFjdFwiLCBcInJlYWN0LWRvbVwiLCBcIkB0YW5zdGFjay9yZWFjdC1xdWVyeVwiXSxcbiAgfSxcbn0pKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMmEsU0FBUyxvQkFBb0I7QUFDeGMsT0FBTyxXQUFXO0FBQ2xCLE9BQU8sVUFBVTtBQUNqQixTQUFTLHVCQUF1QjtBQUhoQyxJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVl6QyxNQUFNLFFBQVEsSUFBSSxtQkFBbUIsU0FBUyxPQUFPO0FBQUEsRUFFckQsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sS0FBSztBQUFBLE1BQ0gsU0FBUztBQUFBLElBQ1g7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEVBQUUsT0FBTyxPQUFPO0FBQUEsRUFDOUUsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsSUFDQSxRQUFRLENBQUMsU0FBUyxhQUFhLHFCQUFxQix1QkFBdUI7QUFBQSxFQUM3RTtBQUFBLEVBQ0EsY0FBYztBQUFBLElBQ1osU0FBUyxDQUFDLFNBQVMsYUFBYSx1QkFBdUI7QUFBQSxFQUN6RDtBQUNGLEVBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
