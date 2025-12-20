import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { Users, Calendar, Stethoscope, TrendingUp } from 'lucide-react';
import { PageLoader } from '@/components/PageLoader';

interface DashboardStats {
  totalPatients: number;
  todayAppointments: number;
  totalExaminations: number;
  recentExaminations: number;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const [stats, setStats] = useState<DashboardStats>({
    totalPatients: 0,
    todayAppointments: 0,
    totalExaminations: 0,
    recentExaminations: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!user) {
        setStatsLoading(false);
        return;
      }

      try {
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const [patientsRes, appointmentsRes, examinationsRes, recentExamsRes] = await Promise.all([
          supabase.from('patients').select('id', { count: 'exact', head: true }),
          supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('appointment_date', today),
          supabase.from('examinations').select('id', { count: 'exact', head: true }),
          supabase.from('examinations').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
        ]);

        setStats({
          totalPatients: patientsRes.count || 0,
          todayAppointments: appointmentsRes.count || 0,
          totalExaminations: examinationsRes.count || 0,
          recentExaminations: recentExamsRes.count || 0,
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setStatsLoading(false);
      }
    }

    fetchStats();
  }, [user]);

  // Show loading spinner until all data is loaded
  const isLoading = authLoading || profileLoading || statsLoading;

  if (isLoading) {
    return <PageLoader />;
  }

  const statCards = [
    {
      title: 'Összes páciens',
      value: stats.totalPatients,
      description: 'Regisztrált páciensek',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Mai időpontok',
      value: stats.todayAppointments,
      description: 'Mára foglalt időpontok',
      icon: Calendar,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Összes vizsgálat',
      value: stats.totalExaminations,
      description: 'Elvégzett vizsgálatok',
      icon: Stethoscope,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Heti aktivitás',
      value: stats.recentExaminations,
      description: 'Vizsgálatok az elmúlt 7 napban',
      icon: TrendingUp,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Üdvözöljük{profile?.full_name ? `, ${profile.full_name}` : ''}!
        </h1>
        <p className="text-muted-foreground mt-1">
          Itt láthatja a napi összefoglalót és a legfontosabb információkat.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stat.value}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gyors műveletek</CardTitle>
            <CardDescription>Gyakran használt funkciók</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Link
              to="/patients"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <Users className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">Új páciens felvétele</div>
                <div className="text-sm text-muted-foreground">
                  Páciens adatainak rögzítése
                </div>
              </div>
            </Link>
            <Link
              to="/appointments"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <Calendar className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">Időpontfoglalás</div>
                <div className="text-sm text-muted-foreground">
                  Új időpont rögzítése
                </div>
              </div>
            </Link>
            <Link
              to="/voice-recording"
              className="flex items-center gap-3 rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <Stethoscope className="h-5 w-5 text-primary" />
              <div>
                <div className="font-medium">Hangfelvétel készítése</div>
                <div className="text-sm text-muted-foreground">
                  Vizsgálati jegyzőkönyv diktálása
                </div>
              </div>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rendszer információ</CardTitle>
            <CardDescription>Fiók és előfizetés adatok</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user?.email}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-muted-foreground">Előfizetés</span>
              <span className="font-medium">
                {profile?.subscription_status === 'active' ? (
                  <span className="text-green-600">Aktív</span>
                ) : (
                  <span className="text-yellow-600">Inaktív</span>
                )}
              </span>
            </div>
            {profile?.company_name && (
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground">Cég</span>
                <span className="font-medium">{profile.company_name}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-2">
              <span className="text-muted-foreground">Csomag</span>
              <span className="font-medium">
                {profile?.subscription_plan || 'Nincs megadva'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
