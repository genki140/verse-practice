import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.VITE_BASE_PATH || "/verse-practice/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["*.png"],
      manifest: {
        id: base,
        name: "Verse Practice",
        short_name: "Verse Practice",
        lang: "ja",
        description: "状況と聖句を結び付ける個人学習",
        start_url: base,
        scope: base,
        display: "standalone",
        theme_color: "#255b56",
        background_color: "#f7f8f4",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,png,webmanifest}"],
        navigateFallback: base + "index.html",
        navigateFallbackAllowlist: [new RegExp("^" + base)],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
