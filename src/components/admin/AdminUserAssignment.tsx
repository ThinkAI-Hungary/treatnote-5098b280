import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Save } from 'lucide-react';
import { GalaxyButton } from '@/components/klinika/GalaxyButton';

interface AdminUserAssignmentProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    userId?: string; // If provided, edit this user's assignments
}

interface Assignment {
    id: string;
    company_id: string;
    telephely_id: string;
    role: string;
}

interface Company {
    id: string;
    name: string;
}

interface Telephely {
    id: string;
    name: string;
    company_id: string;
}

export function AdminUserAssignment({ open, onOpenChange, onSuccess, userId: propUserId }: AdminUserAssignmentProps) {
    const [userId, setUserId] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [userName, setUserName] = useState('');
    const [assignments, setAssignments] = useState<Assignment[]>([{
        id: crypto.randomUUID(),
        company_id: '',
        telephely_id: '',
        role: 'user',
    }]);
    const [initialAssignments, setInitialAssignments] = useState<Assignment[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [telephelys, setTelephelys] = useState<Telephely[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const hasChanges = JSON.stringify(assignments.map(({ company_id, telephely_id, role }) => ({ company_id, telephely_id, role }))) !==
        JSON.stringify(initialAssignments.map(({ company_id, telephely_id, role }) => ({ company_id, telephely_id, role })));

    // Fetch companies and telephelys
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [companiesRes, telephelysRes] = await Promise.all([
                supabase.from('companies').select('id, name').order('name'),
                supabase.from('telephely').select('id, name, company_id').order('name'),
            ]);

            if (companiesRes.data) setCompanies(companiesRes.data);
            if (telephelysRes.data) setTelephelys(telephelysRes.data);
        } catch (error) {
            console.error('Error fetching data:', error);
            toast.error('Nem sikerült betölteni a cégeket és telephelyeket');
        } finally {
            setLoading(false);
        }
    }, []);

    // Load user's existing memberships if userId is provided
    const fetchUserMemberships = useCallback(async (targetUserId: string) => {
        try {
            const { data: profile } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('user_id', targetUserId)
                .single();

            if (profile) {
                setUserEmail(profile.email || '');
                setUserName(profile.full_name || '');
            }

            const { data: memberships } = await supabase
                .from('telephely_memberships')
                .select('telephely_id, role, telephely(company_id)')
                .eq('user_id', targetUserId);

            if (memberships && memberships.length > 0) {
                const fetchedAssignments = memberships.map(m => ({
                    id: crypto.randomUUID(),
                    company_id: (m as any).telephely?.company_id || '',
                    telephely_id: m.telephely_id,
                    role: m.role || 'user',
                }));
                setAssignments(fetchedAssignments);
                setInitialAssignments(fetchedAssignments);
            } else {
                setInitialAssignments([]);
            }
        } catch (error) {
            console.error('Error fetching user memberships:', error);
            toast.error('Nem sikerült betölteni a felhasználó adatait');
        }
    }, []);

    // Load data when dialog opens

    useEffect(() => {
        if (open) {
            fetchData();
            if (propUserId) {
                setUserId(propUserId);
                fetchUserMemberships(propUserId);
            }
        } else {
            // Reset form when dialog closes
            if (!propUserId) {
                setUserId('');
                setUserEmail('');
                setUserName('');
            }
            setAssignments([{
                id: crypto.randomUUID(),
                company_id: '',
                telephely_id: '',
                role: 'user',
            }]);
        }
    }, [open, propUserId, fetchData, fetchUserMemberships]);

    const addAssignment = () => {
        setAssignments([...assignments, {
            id: crypto.randomUUID(),
            company_id: '',
            telephely_id: '',
            role: 'user',
        }]);
    };

    const removeAssignment = (id: string) => {
        setAssignments(assignments.filter(a => a.id !== id));
    };

    const updateAssignment = (id: string, field: keyof Assignment, value: string) => {
        setAssignments(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
    };

    const handleSave = async () => {
        // Validate
        if (!userId && !userEmail && !propUserId) {
            toast.error('Adja meg a felhasználó azonosítóját vagy email címét');
            return;
        }

        if (assignments.some(a => !a.company_id || !a.telephely_id || !a.role)) {
            toast.error('Minden hozzárendelésnek rendelkeznie kell céggel, telephellyel és szereppel');
            return;
        }

        setSaving(true);
        try {
            // If email provided, lookup user ID from backend
            let targetUserId = userId || propUserId;
            if (!targetUserId && userEmail) {
                const { data: userData, error: userError } = await supabase.functions.invoke('klinika-admin', {
                    body: {
                        operation: 'get-user-by-email',
                        email: userEmail,
                    },
                });

                if (userError || !userData?.user?.id) {
                    toast.error('Nem található felhasználó ezzel az email címmel');
                    setSaving(false);
                    return;
                }
                targetUserId = userData.user.id;
            }

            // Call assign-user-memberships operation
            const { data, error } = await supabase.functions.invoke('klinika-admin', {
                body: {
                    operation: 'assign-user-memberships',
                    userId: targetUserId,
                    memberships: assignments.map(a => ({
                        company_id: a.company_id,
                        telephely_id: a.telephely_id,
                        role: a.role,
                    })),
                },
            });

            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast.success(`Változtatások elmentve`);
            setInitialAssignments([...assignments]);
            onSuccess();
            onOpenChange(false);

            // Reset form only if not editing a specific user
            if (!propUserId) {
                setUserId('');
                setUserEmail('');
                setUserName('');
                setAssignments([{
                    id: crypto.randomUUID(),
                    company_id: '',
                    telephely_id: '',
                    role: 'user',
                }]);
            }
        } catch (error: any) {
            console.error('Error assigning user:', error);

            // Try to extract more details from the error
            let message = 'Nem sikerült hozzárendelni a felhasználót';
            if (error instanceof Error) message = error.message;

            // Check for body hidden in context
            if (error.context?.body) {
                try {
                    const body = typeof error.context.body === 'string'
                        ? JSON.parse(error.context.body)
                        : error.context.body;
                    if (body.error) message = body.error;
                } catch (e) {
                    console.error('Failed to parse error body', e);
                }
            }

            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const getFilteredTelephelys = (companyId: string) => {
        return telephelys.filter(t => t.company_id === companyId);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {propUserId ? 'Felhasználó hozzárendelésének szerkesztése' : 'Felhasználó hozzárendelése szervezetekhez'}
                    </DialogTitle>
                    <DialogDescription>
                        Rendeljen hozzá egy felhasználót több cég/telephely párhoz meghatározott szerepkörrel.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {!propUserId && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Felhasználó azonosító</Label>
                                <Input
                                    placeholder="Felhasználó azonosító (opcionális, ha email megadva)"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>VAGY Email cím</Label>
                                <Input
                                    type="email"
                                    placeholder="felhasznalo@example.com"
                                    value={userEmail}
                                    onChange={(e) => setUserEmail(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    {propUserId && userName && (
                        <div className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-sm font-medium">{userName}</p>
                            <p className="text-xs text-muted-foreground">{userEmail}</p>
                        </div>
                    )}

                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between mb-4">
                            <Label className="text-base font-semibold">Hozzárendelések</Label>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={addAssignment}
                                className="flex items-center gap-2"
                            >
                                <Plus className="h-4 w-4" />
                                Hozzárendelés hozzáadása
                            </Button>
                        </div>

                        <div className="space-y-4">
                            {assignments.map((assignment) => (
                                <div key={assignment.id} className="grid grid-cols-[1fr,1fr,120px,40px] gap-3 p-3 border rounded-lg">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Cég</Label>
                                        <Select
                                            key={`company-${assignment.id}-${assignment.company_id}`}
                                            value={assignment.company_id || ""}
                                            onValueChange={(value) => {
                                                console.log('Company selected:', value);
                                                setAssignments(prev => prev.map(a =>
                                                    a.id === assignment.id
                                                        ? { ...a, company_id: value, telephely_id: '' }
                                                        : a
                                                ));
                                            }}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Válasszon céget" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="z-[150]">
                                                {companies.map(company => (
                                                    <SelectItem key={company.id} value={company.id}>
                                                        {company.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Telephely</Label>
                                        <Select
                                            key={`telephely-${assignment.id}-${assignment.telephely_id}`}
                                            value={assignment.telephely_id || ""}
                                            onValueChange={(value) => updateAssignment(assignment.id, 'telephely_id', value)}
                                            disabled={!assignment.company_id}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Válasszon telephelyet" />
                                            </SelectTrigger>
                                            <SelectContent position="popper" className="z-[150]">
                                                {getFilteredTelephelys(assignment.company_id).map(telephely => (
                                                    <SelectItem key={telephely.id} value={telephely.id}>
                                                        {telephely.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs">Szerepkör</Label>
                                        <Select
                                            value={assignment.role}
                                            onValueChange={(value) => updateAssignment(assignment.id, 'role', value)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="user">Felhasználó</SelectItem>
                                                <SelectItem value="klinika_admin">Klinika Admin</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-end">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => removeAssignment(assignment.id)}
                                            disabled={assignments.length === 1}
                                            className="text-destructive hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Mégse
                    </Button>
                    <GalaxyButton onClick={handleSave} disabled={saving || loading || !hasChanges}>
                        {saving ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Mentés...
                            </>
                        ) : (
                            <>
                                <Save className="mr-2 h-4 w-4" />
                                Változtatások mentése
                            </>
                        )}
                    </GalaxyButton>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
