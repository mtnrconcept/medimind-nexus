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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
