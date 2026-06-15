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
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react-dom") || id.includes("react-router-dom") || id.includes("react/")) return "react-vendor";
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("@radix-ui") || id.includes("lucide-react") || id.includes("cmdk") || id.includes("vaul")) return "ui-vendor";
          if (id.includes("@xyflow") || id.includes("react-grid-layout") || id.includes("react-resizable")) return "graph-vendor";
          if (id.includes("three") || id.includes("@react-three")) return "three-vendor";
          if (id.includes("recharts")) return "charts-vendor";
          if (id.includes("jspdf") || id.includes("xlsx")) return "export-vendor";
          if (id.includes("@rdkit")) return "chem-vendor";
          if (id.includes("react-markdown") || id.includes("purify")) return "content-vendor";
          return "vendor";
        },
      },
    },
  },
}));
