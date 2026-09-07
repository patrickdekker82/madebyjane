import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  root: "apps/web",
  plugins: [react(), tailwind()],
  optimizeDeps: {
    include: [
      "three",
      "@react-three/fiber",
      "three/examples/jsm/controls/OrbitControls.js",
    ],
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 4310),
    strictPort: true,
    proxy: { "/api": process.env.API_PROXY ?? "http://127.0.0.1:4311" },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
