import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const fallbackSupabaseUrl = "https://kparxcfspgoonqttduyk.supabase.co";
const fallbackSupabasePublishableKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwYXJ4Y2ZzcGdvb25xdHRkdXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMzA4OTYsImV4cCI6MjA4MDgwNjg5Nn0.ALqq0nzAaElR5kvYPf9moP5hd8mC3fJqz7oqYqPnRRI";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: ["0111c82ed4d4.ngrok-free.app"],
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || fallbackSupabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackSupabasePublishableKey),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || fallbackSupabasePublishableKey),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replace(/\\/g, "/");
          if (!modulePath.includes("node_modules")) return undefined;
          if (
            modulePath.includes("node_modules/react/") ||
            modulePath.includes("node_modules/react-dom/") ||
            modulePath.includes("node_modules/react-router/") ||
            modulePath.includes("node_modules/react-router-dom/") ||
            modulePath.includes("node_modules/@remix-run/router/") ||
            modulePath.includes("node_modules/scheduler/") ||
            modulePath.includes("node_modules/use-sync-external-store/")
          ) {
            return "react-vendor";
          }
          if (modulePath.includes("@supabase")) return "supabase-vendor";
          if (modulePath.includes("@radix-ui") || modulePath.includes("lucide-react") || modulePath.includes("cmdk") || modulePath.includes("vaul")) return "ui-vendor";
          if (modulePath.includes("@xyflow") || modulePath.includes("react-grid-layout") || modulePath.includes("react-resizable")) return "graph-vendor";
          if (modulePath.includes("three") || modulePath.includes("@react-three")) return "three-vendor";
          if (modulePath.includes("recharts")) return "charts-vendor";
          if (modulePath.includes("jspdf") || modulePath.includes("xlsx")) return "export-vendor";
          if (modulePath.includes("@rdkit")) return "chem-vendor";
          if (modulePath.includes("react-markdown") || modulePath.includes("purify")) return "content-vendor";
          return "vendor";
        },
      },
    },
  },
}));
