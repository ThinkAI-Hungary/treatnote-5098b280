import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { History, AlertTriangle } from 'lucide-react';
import { GlobalHistoryTab } from './GlobalHistoryTab';
import { ErrorLogsTab } from './ErrorLogsTab';

type Section = 'history' | 'errors';

interface AdminUser {
  id: string; email: string; full_name: string;
  company_name: string | null; company_id: string | null;
  telephely_id: string | null; telephely_name: string | null;
}
interface Company { id: string; name: string; slug: string; is_active: boolean; }
interface Telephely { id: string; name: string; company_id: string; }

interface MonitoringTabProps {
  users: AdminUser[];
  companies: Company[];
  telephelyek: Telephely[];
}

export function MonitoringTab({ users, companies, telephelyek }: MonitoringTabProps) {
  const [section, setSection] = useState<Section>('history');

  const sections: { id: Section; label: string; Icon: any }[] = [
    { id: 'history', label: 'Előzmények', Icon: History },
    { id: 'errors', label: 'Rendszer Hibák', Icon: AlertTriangle },
  ];

  return (
    <div className="space-y-4 overflow-x-hidden min-w-0">
      {/* Inner segment navigation */}
      <div className="flex flex-wrap items-center gap-1 bg-card/60 border border-primary/10 rounded-xl p-1 backdrop-blur-sm">
        {sections.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 relative',
              section === id
                ? 'bg-gradient-to-r from-primary/20 to-accent/20 text-primary shadow-sm border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div>
        {section === 'history' && (
          <GlobalHistoryTab users={users} companies={companies} telephelyek={telephelyek} />
        )}
        {section === 'errors' && <ErrorLogsTab />}
      </div>
    </div>
  );
}
