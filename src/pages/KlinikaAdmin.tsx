
import { PageLoader } from '@/components/PageLoader';
import { usePageLoadingSignal } from '@/contexts/PageLoadingContext';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Building2, Users, Plus, UserPlus, Trash2, Loader2, Eye, EyeOff, Shield, Mail, Sparkles, Star, FileText, Copy, X, RefreshCw, Pencil, CreditCard
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useFlexiConnection } from '@/hooks/useFlexiConnection';
import { useSzotar } from '@/hooks/useSzotar';
import { useProfile } from '@/hooks/useProfile';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithRetry } from '@/lib/supabaseHelpers';
import { normalizeHungarianString } from '@/lib/hungarianNormalizer';
import { useKlinikaData } from '@/hooks/useKlinikaData';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { OnboardingTour, TourStep } from '@/components/klinika/OnboardingTour';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { hu } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { KezelesiSzabalyokTab } from '@/components/klinika/KezelesiSzabalyokTab';
import { ElofizetesTab } from '@/components/klinika/ElofizetesTab';
import { SzotarTab } from '@/components/klinika/SzotarTab';
import { StarField } from '@/components/klinika/StarField';
import { AnimatedCard } from '@/components/klinika/AnimatedCard';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';
import { Book } from 'lucide-react';

interface AvailableUser {
  id: string;
  email: string;
  full_name: string | null;
  has_company: boolean;
  is_local_user: boolean;
}

const validRoles = [
  { value: 'user', label: 'Felhasználó' },
  { value: 'klinika_admin', label: 'Klinika Admin' },
];

// Stable top-level component — NOT defined inside KlinikaAdmin, so it never re-mounts on re-renders.
function ManualInvitationDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  const handleCopy = () => {
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success('Link másolva');
    }
  };
  return (
    <Dialog open={!!url} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Meghívó elkészült</DialogTitle>
          <DialogDescription>
            A rendszer nem küld automatikus emailt.
            Kérjük másolja ki az alábbi linket és küldje el a felhasználónak:
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="inv-link" className="sr-only">Link</Label>
            <Input id="inv-link" value={url || ''} readOnly />
          </div>
          <Button size="sm" type="button" className="px-3" onClick={handleCopy}>
            <span className="sr-only">Másolás</span>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button type="button" variant="secondary" onClick={onClose}>Bezárás</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function KlinikaAdmin() {
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id;
  const navigate = useNavigate();
  const { profile } = useProfile();
  // Solo companies don't have members — they're single-doctor practices
  const isSoloCompany = !!profile?.is_solo;
  // Use profile telephely to scope the Flexi connection check.
  // The more authoritative activeTelephelyId (from useKlinikaData) is declared below.
  const profileTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id || null;
  const { isConnected: isFlexiConnected, isLoading: isFlexiLoading } = useFlexiConnection(profileTelephelyId);
  const { hasSzotar, hasProbaPaciens, hasFlexiDomain, isLoading: szotarLoading } = useSzotar();

  // Single unified data hook - no cascading loading states
  const {
    isAdmin,
    isKlinikaAdmin,
    companyId,
    companyName,
    telephelyId,
    telephelyName,
    users,
    sentInvitations,
    isLoading,
    refreshUsers,
    refreshInvitations,
  } = useKlinikaData();

  // Check if treatment rules exist for the onboarding guard
  const activeTelephelyId = telephelyId || profile?.telephely_id || (profile as any)?.current_telephely_id;
  const [hasRulesGuard, setHasRulesGuard] = useState(true);
  const [rulesGuardLoading, setRulesGuardLoading] = useState(true);
  const [onboardingScannedFor, setOnboardingScannedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTelephelyId) { setHasRulesGuard(false); setRulesGuardLoading(false); return; }

    const checkRules = async () => {
      setRulesGuardLoading(true);
      try {
        const { count, error } = await supabase
          .from('treatment_rules')
          .select('id', { count: 'exact', head: true })
          .eq('clinic_id', activeTelephelyId);

        if (error) throw error;
        setHasRulesGuard((count || 0) > 0);
      } catch (err) {
        console.error('Failed to load rules guard:', err);
        setHasRulesGuard(false);
      } finally {
        setOnboardingScannedFor(activeTelephelyId);
        setRulesGuardLoading(false);
      }
    };

    checkRules();
  }, [activeTelephelyId]);

  const allOnboardingComplete = hasFlexiDomain && hasProbaPaciens && isFlexiConnected && hasSzotar && hasRulesGuard;
  const onboardingLoading = szotarLoading || isFlexiLoading || rulesGuardLoading;


  // Fetch licenses to show per-user license status
  const [userLicenseMap, setUserLicenseMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!companyId) return;
    supabase
      .from('licenses')
      .select('assigned_user_id, status')
      .eq('company_id', companyId)
      .in('status', ['assigned'])
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        data?.forEach((l) => {
          if (l.assigned_user_id) map[l.assigned_user_id] = true;
        });
        setUserLicenseMap(map);
      });
  }, [companyId, users]);

  // URL search params for tab navigation
  const [searchParams, setSearchParams] = useSearchParams();

  // Controlled tab state for tour navigation
  const validTabs = ['users', 'kezelesi-szabalyok', 'szotar', 'elofizetes'];
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    const defaultTab = isSoloCompany ? 'kezelesi-szabalyok' : 'users';
    return tabParam && validTabs.includes(tabParam) && !(isSoloCompany && tabParam === 'users')
      ? tabParam
      : defaultTab;
  });

  // Sync tab from URL param on mount and when URL changes
  // Solo users must not land on the 'users' tab
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    console.log("KlinikaAdmin synced activeTab from URL:", tabParam);
    if (tabParam && validTabs.includes(tabParam)) {
      if (isSoloCompany && tabParam === 'users') {
        setActiveTab('kezelesi-szabalyok');
        setSearchParams({ tab: 'kezelesi-szabalyok' });
      } else {
        setActiveTab(tabParam);
      }
    }
  }, [searchParams, isSoloCompany]);

  // Update URL when tab changes
  const handleTabChange = useCallback((value: string) => {
    console.log("KlinikaAdmin handleTabChange:", value);
    setActiveTab(value);
    setSearchParams({ tab: value });
  }, [setSearchParams]);
  // Build tour steps with requiredTab to know which tab each step belongs to
  const tourSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="header"]',
      title: 'Üdvözöljük a Klinika Admin felületen!',
      content: 'Itt kezelheti a szervezetét, a tagokat és a szabályokat. Ez az útmutató bemutatja a főbb funkciókat.',
      position: 'bottom',
      requiredTab: 'users', // Start on users tab
    },
    {
      target: '[data-tour="tabs"]',
      title: 'Navigációs fülek',
      content: 'Két fő terület van: a "Tagok" fül a felhasználók kezelésére, és a "Szabályok" fül a kezelési szabályok feltöltésére.',
      position: 'bottom',
      requiredTab: 'users',
    },
    {
      target: '[data-tour="new-user-button"]',
      title: 'Új felhasználó létrehozása',
      content: 'Ezen a gombon keresztül hozhat létre új felhasználókat, akik automatikusan az Ön szervezetéhez kerülnek. Megadhat email címet vagy egyszerű felhasználónevet.',
      position: 'bottom',
      requiredTab: 'users',
    },
    {
      target: '[data-tour="users-table"]',
      title: 'Tagok listája',
      content: 'Itt láthatja a szervezet összes tagját, státuszukat és szerepkörüket.',
      position: 'bottom',
      requiredTab: 'users',
    },
  ], []);

  // Tour steps for Kezelési Szabályok tab
  const rulesTourSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="ksz-header"]',
      title: 'Kezelési Szabályok',
      content: 'Itt kezelheti a klinika kezelési szabályait. A szabályok határozzák meg, hogyan értelmezze a rendszer a felvételeket és milyen tételekké alakítsa őket.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="ksz-generate"]',
      title: 'Szabályok generálása',
      content: 'A „Generálás szótárból" gombbal automatikusan létrehozhatja a szabályokat a feltöltött szótár alapján. Ha már vannak szabályai, az „Újragenerálás" frissíti őket.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="ksz-subtabs"]',
      title: 'Szabályok / PDF Feltöltés',
      content: 'Két alfül érhető el: a „Szabályok" listázza az összes meglévő szabályt, míg a „PDF Feltöltés" fülön PDF protokollokat tölthet fel, amelyekből a rendszer automatikusan szabályokat generál.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="ksz-table"]',
      title: 'Szabályok táblázat',
      content: 'A táblázatban láthatja a szabályok nevét, kategóriáját, vizitjeit és tételeit. Szerkeszthet, törölhet, vagy ki-/bekapcsolhat szabályokat. A keresővel és kategória szűrővel gyorsan rátalálhat egy adott szabályra.',
      position: 'bottom' as const,
      noScroll: true,
    },
  ], []);

  // Tour steps for Szótár tab
  const szotarTourSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="szt-header"]',
      title: 'Szótár',
      content: 'A szótár tartalmazza a klinika kezeléseit, amelyeket a FlexiDent rendszerből generálunk. A szótár alapján a rendszer felismeri, milyen kezeléseket említett a felvételen.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="szt-actions"]',
      title: 'Szótár műveletek',
      content: 'Itt készíthet vagy újragenerálhat szótárt, beállíthatja a próba páciens azonosítót (a tesztek futtatásához szükséges), és megadhatja a FlexiDent domain-t.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="szt-domain"]',
      title: 'FlexiDent domain',
      content: 'Itt láthatja és szerkesztheti a klinika FlexiDent domain címét. Erre a rendszernek szüksége van a kezelési adatok lekérdezéséhez.',
      position: 'bottom' as const,
    },
    {
      target: '[data-tour="szt-kezelesek"]',
      title: 'Szótár kezelések',
      content: 'A generált szótár kezeléseinek listája. Kereshet név szerint és szűrhet kategória alapján. Ezek a kezelések jelennek meg a hangfelvétel feldolgozásánál is.',
      position: 'bottom' as const,
      noScroll: true,
    },
  ], []);

  const {
    showTour,
    startTour,
    completeTour,
    skipTour,
    isNewUser,
  } = useOnboardingTour({
    tourKey: 'klinika-admin',
    isEligible: isKlinikaAdmin || isAdmin,
    autoShowForNewUsers: true,
    newUserDays: 7,
  });

  // Separate tour for Kezelési Szabályok tab
  const {
    showTour: showRulesTour,
    startTour: startRulesTour,
    completeTour: completeRulesTour,
    skipTour: skipRulesTour,
    hasSeenTour: hasSeenRulesTour,
  } = useOnboardingTour({
    tourKey: 'klinika-rules',
    isEligible: isKlinikaAdmin || isAdmin,
    autoShowForNewUsers: false,
  });

  // Separate tour for Szótár tab
  const {
    showTour: showSzotarTour,
    startTour: startSzotarTour,
    completeTour: completeSzotarTour,
    skipTour: skipSzotarTour,
    hasSeenTour: hasSeenSzotarTour,
  } = useOnboardingTour({
    tourKey: 'klinika-szotar',
    isEligible: isKlinikaAdmin || isAdmin,
    autoShowForNewUsers: false,
  });

  // Freeze the tour steps at the moment the tour opens to avoid "glitchy" reordering
  const [tourStepsSnapshot, setTourStepsSnapshot] = useState<TourStep[] | null>(null);

  useEffect(() => {
    if (showTour) {
      setTourStepsSnapshot((prev) => prev ?? tourSteps);
    } else {
      setTourStepsSnapshot(null);
    }
  }, [showTour, tourSteps]);

  const effectiveTourSteps = showTour ? (tourStepsSnapshot ?? tourSteps) : tourSteps;

  const handleStartTour = useCallback(() => {
    setTourStepsSnapshot(tourSteps);
    startTour();
  }, [startTour, tourSteps]);

  const handleStartRulesTour = useCallback(() => {
    setActiveTab('kezelesi-szabalyok');
    setTimeout(() => startRulesTour(), 100);
  }, [startRulesTour]);

  const handleStartSzotarTour = useCallback(() => {
    setActiveTab('szotar');
    setTimeout(() => startSzotarTour(), 100);
  }, [startSzotarTour]);

  // Auto-start tab-specific tours when switching tabs — only if the user hasn't seen them yet
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;
    if (prev === activeTab) return;
    const anyTourOpen = showTour || showRulesTour || showSzotarTour;
    if (anyTourOpen) return;

    if (activeTab === 'kezelesi-szabalyok' && !hasSeenRulesTour) {
      setTimeout(() => startRulesTour(), 150);
    } else if (activeTab === 'szotar' && !hasSeenSzotarTour) {
      setTimeout(() => startSzotarTour(), 150);
    }
  }, [activeTab, startRulesTour, startSzotarTour, showRulesTour, showSzotarTour, showTour, hasSeenRulesTour, hasSeenSzotarTour]);

  // Info button: launch the tour matching the currently active tab
  useEffect(() => {
    const handler = () => {
      if (activeTab === 'kezelesi-szabalyok') {
        handleStartRulesTour();
      } else if (activeTab === 'szotar') {
        handleStartSzotarTour();
      } else {
        handleStartTour();
      }
    };
    window.addEventListener('taskbar-info', handler);
    return () => window.removeEventListener('taskbar-info', handler);
  }, [handleStartTour, handleStartRulesTour, handleStartSzotarTour, activeTab]);

  const [lastInvitationUrl, setLastInvitationUrl] = useState<string | null>(null);
  // Maps invitation email → registration URL so we can show the link in the pending table
  const [invitationUrlMap, setInvitationUrlMap] = useState<Record<string, string>>({});

  // Create user state
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserConfirmPassword, setNewUserConfirmPassword] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [newUserRole, setNewUserRole] = useState('user');
  const [isLocalUser, setIsLocalUser] = useState(false);

  // Invite user state
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);

  // Cancelling invitation state
  const [cancellingInvitationId, setCancellingInvitationId] = useState<string | null>(null);

  // Edit user name state
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<{ id: string; email: string; full_name: string | null; role: string } | null>(null);
  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState('user');
  const [updatingUser, setUpdatingUser] = useState(false);

  // Dialog is now a stable component defined OUTSIDE this function (below) — just call it with props.






  const handleCancelInvitation = useCallback(async (invitationId: string) => {
    setCancellingInvitationId(invitationId);
    try {
      const { error } = await invokeWithRetry('klinika-admin', {
        operation: 'cancel-invitation',
        invitationId,
      });
      if (error) throw error;
      toast.success('Meghívó visszavonva');
      refreshInvitations();
    } catch (error: any) {
      console.error('Error cancelling invitation:', error);
      toast.error(error.message || 'Hiba a meghívó visszavonásakor');
    } finally {
      setCancellingInvitationId(null);
    }
  }, [refreshInvitations]);

  const handleCreateUser = useCallback(async () => {
    // Validation
    if (!newUserEmail.trim()) {
      toast.error(isLocalUser ? 'Kérjük adja meg a felhasználónevet' : 'Kérjük adja meg az email címet');
      return;
    }

    if (isLocalUser) {
      if (!newUserPassword.trim()) {
        toast.error('Kérjük adja meg a jelszót');
        return;
      }
      if (newUserPassword !== newUserConfirmPassword) {
        toast.error('A jelszavak nem egyeznek');
        return;
      }
      if (newUserPassword.length < 6) {
        toast.error('A jelszónak legalább 6 karakter hosszúnak kell lennie');
        return;
      }
    } else {
      // Email validation for non-local users
      if (!newUserEmail.includes('@')) {
        toast.error('Kérjük adjon meg egy érvényes email címet');
        return;
      }
    }

    setCreatingUser(true);
    try {
      if (isLocalUser) {
        // Local User Creation Flow
        const sanitizedCompanyName = normalizeHungarianString(companyName || 'local').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sanitizedUsername = normalizeHungarianString(newUserEmail).toLowerCase().replace(/[^a-z0-9]/g, '');
        const finalEmail = newUserEmail.includes('@')
          ? newUserEmail
          : `${sanitizedUsername}@${sanitizedCompanyName}.com`;

        const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
          operation: 'create-user',
          email: finalEmail,
          password: newUserPassword,
          fullName: newUserFullName,
          role: newUserRole,
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        toast.success(`Felhasználó létrehozva: ${newUserFullName || finalEmail}`);
        refreshUsers(); // Refresh user list
      } else {
        // Invitation Flow
        const { data, error } = await supabase.functions.invoke('invitation-handler', {
          body: {
            operation: 'send-invitation-email',
            email: newUserEmail.trim(),
            role: newUserRole,
            full_name: newUserFullName, // Send full name to be stored
            companyId: companyId,
            telephelyId: telephelyId
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        setLastInvitationUrl(data.invitation_url);
        if (data.invitation_url) {
          setInvitationUrlMap(prev => ({ ...prev, [newUserEmail.trim().toLowerCase()]: data.invitation_url }));
        }
        toast.success(`Meghívó elküldve: ${newUserEmail}`);
        refreshInvitations(); // Refresh invitation list
      }

      // Reset form and close dialog
      setCreateUserOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserConfirmPassword('');
      setNewUserFullName('');
      setIsLocalUser(false);

    } catch (err: any) {
      console.error('Error creating/inviting user:', err);
      // Try to extract error message from various formats
      let errorMessage = err.message || '';

      // Check for error in the response
      const body = err?.context?.body;
      if (typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          if (parsed?.error) errorMessage = parsed.error;
        } catch { }
      }

      // Check for duplicate email error
      if (errorMessage.toLowerCase().includes('already') && errorMessage.toLowerCase().includes('registered')) {
        toast.error('Ez az email cím már regisztrálva van a rendszerben');
      } else {
        toast.error(errorMessage || 'Hiba a művelet során');
      }
    } finally {
      setCreatingUser(false);
    }
  }, [newUserEmail, newUserPassword, newUserConfirmPassword, newUserFullName, newUserRole, isLocalUser, companyId, telephelyId, companyName, refreshUsers, refreshInvitations]);

  // Keep handleInviteUser for local users (created by admin)
  const handleInviteUser = useCallback(async (userId: string, isLocalUser: boolean) => {
    setInvitingUserId(userId);
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'invite-user',
        userId,
      });

      if (error) {
        let message = error.message;
        const body = (error as any)?.context?.body;
        if (typeof body === 'string') {
          try {
            const parsed = JSON.parse(body);
            if (parsed?.error) message = parsed.error;
          } catch { }
        }
        toast.error(message);
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Felhasználó sikeresen hozzáadva az organizációhoz');
      refreshUsers();
      refreshInvitations();
    } catch (error: any) {
      console.error('Error inviting user:', error);
      toast.error(error?.message || 'Hiba a felhasználó meghívásakor');
    } finally {
      setInvitingUserId(null);
    }
  }, [refreshUsers, refreshInvitations]);

  const handleDeleteUser = useCallback(async (userId: string, userEmail: string) => {
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'delete-user-completely',
        email: userEmail,
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      toast.success('A felhasználó sikeresen törölve lett', {
        className: 'bg-galaxy-card border-primary/20 text-foreground',
      });
      refreshUsers();
      refreshInvitations();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast.error(error.message || 'Hiba a felhasználó törlésekor');
    }
  }, [refreshUsers, refreshInvitations]);

  const openEditUser = useCallback((user: { id: string; email: string; full_name: string | null; role: string }) => {
    setEditingUser(user);
    setEditUserFullName(user.full_name || '');
    setEditUserRole(user.role === 'klinika_admin' ? 'klinika_admin' : 'user');
    setEditUserOpen(true);
  }, []);

  const handleUpdateUser = useCallback(async () => {
    if (!editingUser) return;

    setUpdatingUser(true);
    try {
      const { data, error } = await invokeWithRetry<{ error?: string }>('klinika-admin', {
        operation: 'update-user',
        userId: editingUser.id,
        fullName: editUserFullName.trim(),
        role: editUserRole,
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Felhasználó frissítve');
      setEditUserOpen(false);
      setEditingUser(null);
      setEditUserFullName('');
      setEditUserRole('user');
      refreshUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast.error(error.message || 'Hiba a felhasználó frissítésekor');
    } finally {
      setUpdatingUser(false);
    }
  }, [editingUser, editUserFullName, editUserRole, refreshUsers]);



  // Signal loading to sidebar indicator
  usePageLoadingSignal(isLoading);

  // Single unified loading gate - loader stays until ALL data is ready, including sync latency
  const isSyncingOnboarding = !!activeTelephelyId && onboardingScannedFor !== activeTelephelyId;
  const isCurrentlyLoading = isLoading || onboardingLoading || isSyncingOnboarding;

  console.log("KlinikaAdmin Loading State:", {
    isCurrentlyLoading,
    isLoading,
    onboardingLoading,
    szotarLoading,
    isFlexiLoading,
    rulesGuardLoading,
    isSyncingOnboarding,
    activeTelephelyId,
    onboardingScannedFor,
  });

  if (isCurrentlyLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Guard: if onboarding is incomplete, show info message
  if (!allOnboardingComplete) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Klinika Admin</h1>
          <p className="text-muted-foreground mt-1">
            A klinika beállításai és kezelése
          </p>
        </div>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Beállítás szükséges</AlertTitle>
          <AlertDescription>
            A Klinika Admin felület eléréséhez először végezze el az összes beállítási lépést a{' '}
            <button
              onClick={() => navigate('/dashboard')}
              className="underline font-medium hover:text-destructive-foreground/80"
            >
              Főoldalon
            </button>
            .
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Access denied view
  if (!isKlinikaAdmin && !isAdmin) {
    return (
      <div className="relative min-h-[60vh] animate-fade-in">
        <AnimatedCard className="relative z-10 max-w-md mx-auto mt-20">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-6">
              <Shield className="h-16 w-16 text-destructive/70" />
              <div className="absolute inset-0 animate-pulse-glow rounded-full" />
            </div>
            <h3 className="text-xl font-semibold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Hozzáférés megtagadva
            </h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              Ez az oldal csak Klinika Adminok számára érhető el.
            </p>
          </CardContent>
        </AnimatedCard>
      </div>
    );
  }

  // Main content - cinematic reveal with staggered animation
  return (
    <div className="relative min-h-screen">
      {/* Background layer - fades in first */}


      {/* Content layer - slides up after background */}
      <div
        className="relative z-10 space-y-8 pb-8"
      >
        {/* Header section */}
        <div data-tour="header" className="relative overflow-hidden rounded-xl bg-galaxy-header p-6 border border-primary/20 dark:border-sparkle-blue/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center glow-purple">
                  <Building2 className="h-7 w-7 text-primary-foreground" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                  {companyName && telephelyName ? `${companyName} - ${telephelyName}` : 'Organizáció kezelése'}
                </h1>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Organizáció kezelése
                </p>
              </div>
            </div>
          </div>
        </div>


        {/* Tabs with min-height to prevent layout jumps - controlled for tour navigation */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList data-tour="tabs" className="bg-card/80 backdrop-blur-sm border border-primary/20 dark:border-sparkle-blue/20 p-1">
            {!isSoloCompany && (
              <TabsTrigger
                value="users"
                className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
              >
                <Users className="h-4 w-4" />
                Tagok
              </TabsTrigger>
            )}
            <TabsTrigger
              value="kezelesi-szabalyok"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
            >
              <FileText className="h-4 w-4" />
              Kezelési Szabályok
            </TabsTrigger>
            <TabsTrigger
              value="szotar"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
            >
              <Book className="h-4 w-4" />
              Szótár
            </TabsTrigger>
            <TabsTrigger
              value="elofizetes"
              className="flex items-center gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/20 data-[state=active]:to-accent/20 data-[state=active]:text-primary"
            >
              <CreditCard className="h-4 w-4" />
              Előfizetés
            </TabsTrigger>
          </TabsList>

          {/* Tab content with min-height to prevent layout jumps */}
          <div className="min-h-[400px]">
            <TabsContent value="users" className="space-y-6 mt-0">

              <AnimatedCard data-tour="users-table">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <CardTitle>Szervezeti tagok</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {users.length} tag • {telephelyName || 'Telephely'}
                        </p>
                      </div>
                    </div>

                    {companyId && telephelyId && (
                      <>
                        {/* Single invite button — role is chosen via the Jogkör dropdown inside the dialog */}
                        <div className="flex gap-2">
                          <GalaxyButton size="icon" onClick={refreshUsers} title="Frissítés">
                            <RefreshCw className="h-4 w-4" />
                          </GalaxyButton>
                          <GalaxyButton
                            data-tour="new-user-button"
                            onClick={() => { setNewUserRole('user'); setIsLocalUser(false); setNewUserEmail(''); setNewUserFullName(''); setCreateUserOpen(true); }}
                          >
                            <UserPlus className="mr-2 h-4 w-4" />
                            Új felhasználó
                          </GalaxyButton>
                        </div>

                        {/* Unified invite/create dialog — role is pre-set by the button that opened it */}
                        <Dialog
                          open={createUserOpen}
                          onOpenChange={(open) => {
                            if (!open) {
                              setCreateUserOpen(false);
                              setNewUserEmail('');
                              setNewUserPassword('');
                              setNewUserConfirmPassword('');
                              setNewUserFullName('');
                              setIsLocalUser(false);
                            }
                          }}
                        >
                          <DialogContent className="border-primary/20 dark:border-sparkle-blue/20 bg-card/95 backdrop-blur-md">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                <UserPlus className="h-5 w-5 text-primary" />
                                {isLocalUser ? 'Helyi felhasználó létrehozása' : 'Új felhasználó hozzáadása'}
                              </DialogTitle>
                              <DialogDescription>
                                {isLocalUser
                                  ? 'Hozzon létre helyi fiókot jelszóval (email nélkül).'
                                  : 'Adja meg az email címet és válasszon jogkört a meghívóhoz.'}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                              {!isLocalUser ? (
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Email cím</Label>
                                  <Input
                                    type="email"
                                    placeholder="email@example.com"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="border-primary/20 focus:border-primary/40"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Generálunk egy meghívó linket, amelyet elküldhet a felhasználónak.
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Felhasználónév</Label>
                                  <Input
                                    placeholder="felhasználónév"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                    className="border-primary/20 focus:border-primary/40"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Ha nem tartalmaz @ jelet, automatikusan @{companyName?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'local'}.com végződést kap
                                  </p>
                                </div>
                              )}
                              {isAdmin && (
                                <div className="flex items-center gap-2 pt-1">
                                  <Checkbox
                                    id="local-user-toggle"
                                    checked={isLocalUser}
                                    onCheckedChange={(checked) => {
                                      setIsLocalUser(!!checked);
                                      setNewUserEmail('');
                                      setNewUserPassword('');
                                      setNewUserConfirmPassword('');
                                      setNewUserFullName('');
                                    }}
                                  />
                                  <Label htmlFor="local-user-toggle" className="text-sm font-medium cursor-pointer">
                                    Helyi felhasználó (jelszóval, email meghívó nélkül)
                                  </Label>
                                </div>
                              )}
                              {!isLocalUser && (
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Jogkör</Label>
                                  <Select value={newUserRole} onValueChange={setNewUserRole}>
                                    <SelectTrigger className="border-primary/20">
                                      <SelectValue placeholder="Válassz jogkört" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">Felhasználó</SelectItem>
                                      <SelectItem value="klinika_admin">Klinika Admin</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                              {isLocalUser && (
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Teljes név</Label>
                                  <Input
                                    placeholder="Teljes név"
                                    value={newUserFullName}
                                    onChange={(e) => setNewUserFullName(e.target.value)}
                                    className="border-primary/20 focus:border-primary/40"
                                  />
                                </div>
                              )}
                              {isLocalUser && (
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Jelszó</Label>
                                    <div className="relative">
                                      <Input
                                        type={showPassword ? "text" : "password"}
                                        autoComplete="new-password"
                                        placeholder="Jelszó"
                                        value={newUserPassword}
                                        onChange={(e) => setNewUserPassword(e.target.value)}
                                        className="border-primary/20 focus:border-primary/40 pr-10"
                                      />
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                        onClick={() => setShowPassword(!showPassword)}
                                      >
                                        {showPassword ? (
                                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                                        ) : (
                                          <Eye className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label className="text-sm font-medium">Jelszó megerősítése</Label>
                                    <Input
                                      type="password"
                                      autoComplete="new-password"
                                      placeholder="Jelszó újra"
                                      value={newUserConfirmPassword}
                                      onChange={(e) => setNewUserConfirmPassword(e.target.value)}
                                      className="border-primary/20 focus:border-primary/40"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                            <DialogFooter>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setCreateUserOpen(false);
                                  setNewUserEmail('');
                                  setNewUserPassword('');
                                  setNewUserConfirmPassword('');
                                  setNewUserFullName('');
                                  setIsLocalUser(false);
                                }}
                                className="border-primary/20 hover:bg-primary/10"
                              >
                                Mégse
                              </Button>
                              <GalaxyButton
                                onClick={handleCreateUser}
                                disabled={creatingUser || (isLocalUser && (newUserConfirmPassword !== '' && newUserPassword !== newUserConfirmPassword))}
                              >
                                {creatingUser ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {isLocalUser ? 'Létrehozás...' : 'Generálás...'}
                                  </>
                                ) : (
                                  <>
                                    <Mail className="mr-2 h-4 w-4" />
                                    {isLocalUser ? 'Létrehozás' : 'Meghívó generálása'}
                                  </>
                                )}
                              </GalaxyButton>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent>
                  {!companyId || !telephelyId ? (
                    <div className="text-sm text-muted-foreground bg-muted/50 px-4 py-2 rounded-lg">
                      Cég és telephely hozzárendelése szükséges a felhasználó létrehozáshoz
                    </div>
                  ) : users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="relative mb-4">
                        <Users className="h-16 w-16 text-muted-foreground/30" />
                        <Sparkles className="absolute -top-2 -right-2 h-6 w-6 text-accent/50 animate-float" style={{ willChange: 'transform' }} />
                      </div>
                      <p className="text-muted-foreground">Még nincsenek tagok</p>
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow className="bg-gradient-to-r from-primary/5 to-accent/5 border-b border-primary/10">
                            <TableHead className="font-semibold">Email</TableHead>
                            <TableHead className="font-semibold">Név</TableHead>
                            <TableHead className="font-semibold">Licenc</TableHead>
                            <TableHead className="font-semibold">Szerep</TableHead>
                            <TableHead className="text-right font-semibold">Műveletek</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow
                              key={user.id}
                              className="group hover:bg-gradient-to-r hover:from-primary/5 hover:to-accent/5"
                            >
                              <TableCell className="font-medium">{user.email}</TableCell>
                              <TableCell>{user.full_name || '-'}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={userLicenseMap[user.id] ? 'default' : 'outline'}
                                  className={cn(
                                    userLicenseMap[user.id] && "bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700"
                                  )}
                                >
                                  {userLicenseMap[user.id] ? 'Aktív' : 'Inaktív'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    user.role === 'admin' && 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700',
                                    user.role === 'klinika_admin' && 'bg-gradient-to-r from-primary to-accent text-white hover:opacity-90',
                                    user.role !== 'admin' && user.role !== 'klinika_admin' && 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                                  )}
                                >
                                  {user.role === 'admin' ? 'Admin' : user.role === 'klinika_admin' ? 'Klinika Admin' : 'Felhasználó'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                {/* Allow editing/deleting if target role is NOT admin (allows editing klinika_admin and user) */}
                                {user.role !== 'admin' && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="text-primary hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => openEditUser({
                                        id: user.id,
                                        email: user.email,
                                        full_name: user.full_name,
                                        role: user.role
                                      })}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    {/* Hide delete button for current user to prevent self-lockout */}
                                    {user.id !== currentUserId && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => handleDeleteUser(user.id, user.email)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {sentInvitations.filter(i => i.status === 'pending').length > 0 && (
                    <div className="mt-8 space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Függőben lévő meghívók
                      </h3>
                      <div className="rounded-lg overflow-hidden border border-primary/10">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead>Email</TableHead>
                              <TableHead>Jogosultság</TableHead>
                              <TableHead>Meghívva</TableHead>
                              <TableHead>Meghívó link</TableHead>
                              <TableHead className="text-right">Műveletek</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sentInvitations.filter(i => i.status === 'pending').map((invitation) => (
                              <TableRow
                                key={invitation.id}
                                className="group"
                              >
                                <TableCell className="font-medium">{invitation.email}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className={cn(
                                    "border-primary/20",
                                    invitation.role === 'klinika_admin' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                  )}>
                                    {invitation.role === 'klinika_admin' ? 'Klinika Admin' : 'Felhasználó'}
                                  </Badge>
                                </TableCell>
                                <TableCell>{new Date(invitation.created_at).toLocaleDateString('hu-HU')}</TableCell>
                                <TableCell>
                                  {/* Meghívó link oszlop — builds URL from token (server) or client-side map */}
                                  {(() => {
                                    const url = invitation.token
                                      ? `${window.location.origin}/register?token=${invitation.token}`
                                      : invitationUrlMap[invitation.email.toLowerCase()];
                                    return url ? (
                                      <div className="flex items-center gap-1 max-w-[220px]">
                                        <code className="text-xs flex-1 truncate text-muted-foreground font-mono select-all" title={url}>
                                          {url}
                                        </code>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 hover:bg-primary/10 hover:text-primary"
                                          onClick={() => {
                                            navigator.clipboard.writeText(url);
                                            toast.success('Link másolva');
                                          }}
                                          title="Link másolása"
                                        >
                                          <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-muted-foreground/40">—</span>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleCancelInvitation(invitation.id)}
                                    disabled={cancellingInvitationId === invitation.id}
                                  >
                                    {cancellingInvitationId === invitation.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </AnimatedCard>
            </TabsContent>



            <TabsContent value="kezelesi-szabalyok" className="mt-0">
              <KezelesiSzabalyokTab
                companyId={companyId}
                telephelyId={telephelyId}
                companyName={companyName}
                telephelyName={telephelyName}
              />
            </TabsContent>

            <TabsContent value="szotar" className="mt-0">
              <SzotarTab
                companyId={companyId}
                telephelyId={telephelyId}
                companyName={companyName}
                telephelyName={telephelyName}
              />
            </TabsContent>

            <TabsContent value="elofizetes" className="mt-0">
              <ElofizetesTab
                companyId={companyId}
                telephelyId={telephelyId}
                companyName={companyName}
                users={users}
                isSolo={isSoloCompany}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>


      {/* Onboarding Tour — Tagok */}
      <OnboardingTour
        steps={effectiveTourSteps}
        isOpen={showTour}
        onComplete={completeTour}
        onSkip={skipTour}
        onStepChange={(step) => {
          if (step.requiredTab) {
            setActiveTab(step.requiredTab);
          }
        }}
      />
      {/* Onboarding Tour — Kezelési Szabályok */}
      <OnboardingTour
        steps={rulesTourSteps}
        isOpen={showRulesTour}
        onComplete={completeRulesTour}
        onSkip={skipRulesTour}
      />
      {/* Onboarding Tour — Szótár */}
      <OnboardingTour
        steps={szotarTourSteps}
        isOpen={showSzotarTour}
        onComplete={completeSzotarTour}
        onSkip={skipSzotarTour}
      />

      {/* Edit User Dialog */}
      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent className="border-primary/20 dark:border-sparkle-blue/20 bg-card/95 backdrop-blur-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Felhasználó szerkesztése
            </DialogTitle>
            <DialogDescription>
              {editingUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {(isAdmin || editingUser?.id === currentUserId) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Teljes név</Label>
                <Input
                  placeholder="Teljes név"
                  value={editUserFullName}
                  onChange={(e) => setEditUserFullName(e.target.value)}
                  className="border-primary/20 focus:border-primary/40"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Szerepkör</Label>
              {editingUser?.id === currentUserId ? (
                <>
                  <Input
                    value={editUserRole === 'klinika_admin' ? 'Klinika Admin' : editUserRole === 'admin' ? 'Admin' : 'Felhasználó'}
                    disabled
                    className="bg-muted border-primary/20"
                  />
                  <p className="text-xs text-muted-foreground">Saját szerepkör nem módosítható</p>
                </>
              ) : (
                <Select value={editUserRole} onValueChange={setEditUserRole}>
                  <SelectTrigger className="border-primary/20 focus:border-primary/40">
                    <SelectValue placeholder="Válassz szerepkört" />
                  </SelectTrigger>
                  <SelectContent>
                    {validRoles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditUserOpen(false);
                setEditingUser(null);
                setEditUserFullName('');
              }}
              className="border-primary/20 hover:bg-primary/10"
            >
              Mégse
            </Button>
            <GalaxyButton
              onClick={handleUpdateUser}
              disabled={updatingUser}
            >
              {updatingUser ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mentés
            </GalaxyButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ManualInvitationDialog url={lastInvitationUrl} onClose={() => setLastInvitationUrl(null)} />
    </div>
  );
}
