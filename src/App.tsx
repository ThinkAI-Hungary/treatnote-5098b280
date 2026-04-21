import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";
import { PageLoader } from "@/components/PageLoader";
import { preloadCommonRoutes } from "@/lib/routePrefetch";

// Eager-loaded (always needed on first visit)
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy-loaded: code-split so each page JS only loads when needed
const Dashboard = lazy(() => import("./pages/Dashboard"));
const PatientManagement = lazy(() => import("./pages/PatientManagement"));
const PatientProfile = lazy(() => import("./pages/PatientProfile"));
const Appointments = lazy(() => import("./pages/Appointments"));
const ExaminationsList = lazy(() => import("./pages/ExaminationsList"));
const DentalCharting = lazy(() => import("./pages/DentalCharting"));
const VoiceRecording = lazy(() => import("./pages/VoiceRecording"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Downloads = lazy(() => import("./pages/Downloads"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Admin = lazy(() => import("./pages/Admin"));
const KlinikaAdmin = lazy(() => import("./pages/KlinikaAdmin"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));
const Register = lazy(() => import("./pages/Register"));
const SoloRegister = lazy(() => import("./pages/SoloRegister"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 min — navigating back won't refetch
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 min before garbage collection
      gcTime: 10 * 60 * 1000,
      // Don't refetch when window regains focus (reduces flicker)
      refetchOnWindowFocus: false,
    },
  },
});

const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE',
});

// Wrapper component for authenticated routes - Layout stays mounted
function AuthenticatedRoutes() {
  return (
    <AuthenticatedLayout>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </AuthenticatedLayout>
  );
}

const App = () => {
  // Eagerly preload commonly visited routes during idle time
  useEffect(() => {
    preloadCommonRoutes();
  }, []);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="klinika-theme">
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 1000 * 60 * 60 * 24, // 24 hours
          buster: 'v1.0.1', // change this to bust cache on major app updates
        }}
      >
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/accept-invitation" element={<Suspense fallback={<PageLoader />}><AcceptInvitation /></Suspense>} />
                <Route path="/register" element={<Suspense fallback={<PageLoader />}><Register /></Suspense>} />
                <Route path="/solo-register" element={<Suspense fallback={<PageLoader />}><SoloRegister /></Suspense>} />


                {/* Authenticated routes - Layout wrapper stays mounted */}
                <Route element={<AuthenticatedRoutes />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/patients" element={<PatientManagement />} />
                  <Route path="/patients/:id" element={<PatientProfile />} />
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/examinations" element={<ExaminationsList />} />
                  <Route path="/dental-charting" element={<DentalCharting />} />
                  <Route path="/voice-recording" element={<VoiceRecording />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/downloads" element={<Downloads />} />

                  <Route path="/profile" element={<Profile />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/klinika-admin" element={<KlinikaAdmin />} />
                </Route>

                <Route path="*" element={<Suspense fallback={<PageLoader />}><NotFound /></Suspense>} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
};

export default App;
