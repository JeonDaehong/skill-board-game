import { defineConfig } from "vite";

export default defineConfig({
  // Deliberately not 5173: a SvelteKit app from another project left a service
  // worker registered on localhost:5173 that hijacks the page. A distinct port
  // is a clean origin with no stale worker.
  server: { port: 5280, strictPort: true, open: true },
});
