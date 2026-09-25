import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  build: {
    rolldownOptions: {
      output: { advancedChunks: { groups: [{ name: "maplibre", test: /maplibre-gl/ }] } },
    },
    chunkSizeWarningLimit: 1200,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
})
