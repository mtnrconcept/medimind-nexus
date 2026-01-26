import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { WindowManagerProvider } from "@/contexts/WindowManagerContext";
import { AIProvider } from "@/contexts/AIContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PageTransition from "@/components/layout/PageTransition";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Pathologies from "./pages/Pathologies";
import PathologyDetail from "./pages/PathologyDetail";
import Search from "./pages/Search";
import Admin from "./pages/Admin";
import Patients from "./pages/Patients";
import PatientDetail from "./pages/PatientDetail";
import CrossDataAnalysis from "./pages/CrossDataAnalysis";
import ContinuousDiscovery from "./pages/ContinuousDiscovery";
import DiscoveryPlatform from "./pages/DiscoveryPlatform";
import SwitchCalculator from "./pages/SwitchCalculator";
import MoleculeWorkbenchPage from "./pages/MoleculeWorkbenchPage";
import NotFound from "./pages/NotFound";
import SMARTLaunch from "./pages/smart/Launch";
import SMARTCallback from "./pages/smart/Callback";
import PopulateData from "./pages/PopulateData";

const queryClient = new QueryClient();

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <PageTransition key={location.pathname}>
      <Routes location={location}>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/pathologies" element={<ProtectedRoute><Pathologies /></ProtectedRoute>} />
        <Route path="/pathologies/:id" element={<ProtectedRoute><PathologyDetail /></ProtectedRoute>} />
        <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
        <Route path="/patients" element={<ProtectedRoute><Patients /></ProtectedRoute>} />
        <Route path="/patients/:id" element={<ProtectedRoute><PatientDetail /></ProtectedRoute>} />
        <Route path="/cross-data-analysis" element={<ProtectedRoute><CrossDataAnalysis /></ProtectedRoute>} />
        <Route path="/continuous-discovery" element={<ProtectedRoute><ContinuousDiscovery /></ProtectedRoute>} />
        <Route path="/discovery-platform" element={<ProtectedRoute><DiscoveryPlatform /></ProtectedRoute>} />
        <Route path="/tools/switch-calculator" element={<ProtectedRoute><SwitchCalculator /></ProtectedRoute>} />
        <Route path="/tools/molecule-workbench" element={<ProtectedRoute><MoleculeWorkbenchPage /></ProtectedRoute>} />
        <Route path="/admin" element={<Admin />} /> {/* TEMPORAIRE: Sans protection pour config initiale */}
        <Route path="/populate-data" element={<ProtectedRoute><PopulateData /></ProtectedRoute>} />

        {/* SMART on FHIR routes */}
        <Route path="/smart/launch" element={<SMARTLaunch />} />
        <Route path="/smart/callback" element={<SMARTCallback />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageTransition>
  );
};

import { ThemeProvider } from "@/components/theme-provider";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme" attribute="class" enableSystem>
      <TranslationProvider>
        <AIProvider>
          <WindowManagerProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <AuthProvider>
                  <AnimatedRoutes />
                </AuthProvider>
              </BrowserRouter>
            </TooltipProvider>
          </WindowManagerProvider>
        </AIProvider>
      </TranslationProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;