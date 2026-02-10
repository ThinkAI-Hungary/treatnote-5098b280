import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import PatientManagement from "./pages/PatientManagement";
import Appointments from "./pages/Appointments";
import ExaminationsList from "./pages/ExaminationsList";
import DentalCharting from "./pages/DentalCharting";
import VoiceRecording from "./pages/VoiceRecording";
import Analytics from "./pages/Analytics";
import Downloads from "./pages/Downloads";

import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import KlinikaAdmin from "./pages/KlinikaAdmin";
import AcceptInvitation from "./pages/AcceptInvitation";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper component for authenticated routes - Layout stays mounted
function AuthenticatedRoutes() {
  return (
    <AuthenticatedLayout>
      <Outlet />
    </AuthenticatedLayout>
  );
}

const App = () => (
  <ThemeProvider defaultTheme="system" storageKey="klinika-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/accept-invitation" element={<AcceptInvitation />} />
              
              {/* Authenticated routes - Layout wrapper stays mounted */}
              <Route element={<AuthenticatedRoutes />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/patients" element={<PatientManagement />} />
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
              
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
          <ThemeToggle />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
