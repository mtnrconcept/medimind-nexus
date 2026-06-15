import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import { TranslationProvider } from "@/contexts/TranslationContext";
import { WindowManagerProvider } from "@/contexts/WindowManagerContext";
import { AIProvider } from "@/contexts/AIContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import PageTransition from "@/components/layout/PageTransition";
import Index from "./pages/Index";

const Auth = lazy(() => import("./pages/Auth"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Pathologies = lazy(() => import("./pages/Pathologies"));
const PathologyDetail = lazy(() => import("./pages/PathologyDetail"));
const Search = lazy(() => import("./pages/Search"));
const Admin = lazy(() => import("./pages/Admin"));
const Patients = lazy(() => import("./pages/Patients"));
const PatientDetail = lazy(() => import("./pages/PatientDetail"));
const CrossDataAnalysis = lazy(() => import("./pages/CrossDataAnalysis"));
const ContinuousDiscovery = lazy(() => import("./pages/ContinuousDiscovery"));
const DiscoveryPlatform = lazy(() => import("./pages/DiscoveryPlatform"));
const SwitchCalculator = lazy(() => import("./pages/SwitchCalculator"));
const MoleculeWorkbenchPage = lazy(() => import("./pages/MoleculeWorkbenchPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const SMARTLaunch = lazy(() => import("./pages/smart/Launch"));
const SMARTCallback = lazy(() => import("./pages/smart/Callback"));
const PopulateData = lazy(() => import("./pages/PopulateData"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="min-h-screen bg-background" aria-busy="true" aria-live="polite" />
);

const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <PageTransition key={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
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
