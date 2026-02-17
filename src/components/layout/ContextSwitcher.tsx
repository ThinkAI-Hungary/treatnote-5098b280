import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/useProfile';
import { toast } from 'sonner';

interface TelephelyOption {
    id: string;
    name: string;
    role: string;
    company_id: string; // Added company_id
}

export function ContextSwitcher() {
    const { user } = useAuth();
    const { profile } = useProfile();
    const [open, setOpen] = useState(false);
    const [telephelys, setTelephelys] = useState<TelephelyOption[]>([]);
    const [loading, setLoading] = useState(true);

    // Current selected comes from profile (source of truth for context)
    // Cast to any to avoid type error until types.ts is updated
    const currentTelephelyId = (profile as any)?.current_telephely_id || profile?.telephely_id;

    useEffect(() => {
        async function fetchMemberships() {
            if (!user) return;

            try {
                setLoading(true);
                // Fetch memberships with telephely details including company_id
                const { data, error } = await supabase
                    .from('telephely_memberships')
                    .select('telephely_id, role, telephely(name, company_id)')
                    .eq('user_id', user.id);

                if (error) throw error;

                const options: TelephelyOption[] = data.map((item: any) => ({
                    id: item.telephely_id,
                    name: item.telephely?.name || 'Ismeretlen telephely',
                    role: item.role === 'klinika_admin' ? 'Admin' : 'Felhasználó',
                    company_id: item.telephely?.company_id,
                }));

                setTelephelys(options);

                // If no memberships found (legacy user?), we might want to show the one from profile if it exists
                if (options.length === 0 && profile?.telephely_id) {
                    // Fallback for legacy
                    const { data: legacyTelephely } = await supabase
                        .from('telephely')
                        .select('name, company_id')
                        .eq('id', profile.telephely_id)
                        .single();

                    if (legacyTelephely) {
                        setTelephelys([{
                            id: profile.telephely_id,
                            name: legacyTelephely.name,
                            role: 'Legacy User',
                            company_id: legacyTelephely.company_id,
                        }]);
                    }
                }

            } catch (error) {
                console.error('Error fetching memberships:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchMemberships();
    }, [user, profile]);

    const handleSwitch = async (telephelyId: string) => {
        if (!user) return;

        try {
            const target = telephelys.find(t => t.id === telephelyId);
            if (!target) return;

            // Update profile current_telephely_id AND legacy fields for RLS compatibility
            const { error } = await supabase
                .from('profiles')
                .update({
                    current_telephely_id: telephelyId,
                    telephely_id: telephelyId,
                    company_id: target.company_id
                } as any) // Cast to any to avoid strict type checking for current_telephely_id
                .eq('user_id', user.id);

            if (error) throw error;

            setOpen(false);
            toast.success('Telephely váltás sikeres');

            // Force reload or query invalidation to refresh data
            window.location.reload();

        } catch (error) {
            console.error('Error switching telephely:', error);
            toast.error('Hiba a telephely váltásakor');
        }
    };

    const selectedTelephely = telephelys.find(t => t.id === currentTelephelyId);

    if (loading) {
        return <div className="w-[200px] h-9 animate-pulse bg-muted rounded" />;
    }

    // If user has no telephelys (new user?), don't render switcher or render placeholder
    if (telephelys.length === 0) {
        return null;
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between"
                >
                    <Building2 className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <span className="truncate">
                        {selectedTelephely ? selectedTelephely.name : "Válasszon telephelyet..."}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                <Command>
                    <CommandList>
                        <CommandGroup heading="Telephelyek">
                            {telephelys.map((telephely) => (
                                <CommandItem
                                    key={telephely.id}
                                    value={telephely.name}
                                    onSelect={() => handleSwitch(telephely.id)}
                                >
                                    <Check
                                        className={cn(
                                            "mr-2 h-4 w-4",
                                            currentTelephelyId === telephely.id ? "opacity-100" : "opacity-0"
                                        )}
                                    />
                                    <div className="flex flex-col">
                                        <span>{telephely.name}</span>
                                        <span className="text-xs text-muted-foreground">{telephely.role}</span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
