import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Alias "@/" -> "src/". Usamos resolve.alias (no un plugin) para que también lo
// herede el sub-build del Web Worker en Rolldown.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Cabeceras de seguridad (defensa en profundidad). La app es 100% cliente, sin
// backend ni secretos. CSP permite worker/blob (Web Worker) e inline (script de tema).
// Estas cabeceras se aplican en `vite dev` y `vite preview`; en hosting estático
// de producción deben configurarse en el proveedor (CDN / reverse proxy).
const securityHeaders: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "worker-src 'self' blob:",
    "connect-src 'self' blob: data:",
  ].join("; "),
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

function securityHeadersPlugin(): Plugin {
  const apply = (req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    for (const [key, value] of Object.entries(securityHeaders)) res.setHeader(key, value);
    next();
  };
  return {
    name: "security-headers",
    configureServer(server) {
      server.middlewares.use(apply);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apply);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
  resolve: { alias: { "@": srcDir } },
  worker: { format: "es" },
  build: { target: "es2020", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
