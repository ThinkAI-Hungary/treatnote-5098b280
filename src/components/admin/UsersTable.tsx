import { useState, useMemo } from 'react';
import { TableCell, TableHead, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnimatedTable, AnimatedTableRow } from '@/components/ui/animated-table';
import { Edit, Trash2, Search, ChevronUp, ChevronDown, ChevronsUpDown, X, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  company_name: string | null;
  company_id: string | null;
  telephely_id: string | null;
  telephely_name: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  subscription_end_date: string | null;
  role: string;
  can_create_users: boolean;
  flexi_username: string | null;
}

interface Company {
  id: string;
  name: string;
  slug: string;
}

interface Telephely {
  id: string;
  name: string;
  company_id: string;
}

type SortField = 'company_name' | 'telephely_name' | 'full_name' | 'email' | 'role' | 'subscription_status' | 'flexi_username';
type SortDirection = 'asc' | 'desc' | null;

interface UsersTableProps {
  users: AdminUser[];
  companies: Company[];
  telephelyek: Telephely[];
  loading?: boolean;
  onEdit: (user: AdminUser) => void;
  onDelete: (userId: string) => void;
}

export function UsersTable({ users, companies, telephelyek, loading = false, onEdit, onDelete }: UsersTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterTelephely, setFilterTelephely] = useState<string>('all');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Get available telephely options based on selected company filter
  const filteredTelephelyOptions = useMemo(() => {
    if (filterCompany === 'all') return telephelyek;
    return telephelyek.filter(t => t.company_id === filterCompany);
  }, [filterCompany, telephelyek]);

  // Reset telephely filter when company changes
  const handleCompanyFilterChange = (value: string) => {
    setFilterCompany(value);
    setFilterTelephely('all');
  };

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filter and sort users
  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(user =>
        user.email.toLowerCase().includes(query) ||
        (user.full_name?.toLowerCase() || '').includes(query) ||
        (user.company_name?.toLowerCase() || '').includes(query) ||
        (user.telephely_name?.toLowerCase() || '').includes(query)
      );
    }

    // Apply company filter
    if (filterCompany !== 'all') {
      result = result.filter(user => user.company_id === filterCompany);
    }

    // Apply telephely filter
    if (filterTelephely !== 'all') {
      result = result.filter(user => user.telephely_id === filterTelephely);
    }

    // Apply role filter
    if (filterRole !== 'all') {
      result = result.filter(user => user.role === filterRole);
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      result = result.filter(user => user.subscription_status === filterStatus);
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        let aVal = a[sortField] || '';
        let bVal = b[sortField] || '';
        
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [users, searchQuery, filterCompany, filterTelephely, filterRole, filterStatus, sortField, sortDirection]);

  const clearFilters = () => {
    setSearchQuery('');
    setFilterCompany('all');
    setFilterTelephely('all');
    setFilterRole('all');
    setFilterStatus('all');
    setSortField(null);
    setSortDirection(null);
  };

  const hasActiveFilters = searchQuery || filterCompany !== 'all' || filterTelephely !== 'all' || filterRole !== 'all' || filterStatus !== 'all';

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => {
    const isActive = sortField === field;
    return (
      <TableHead 
        className="cursor-pointer select-none hover:bg-muted/50 transition-colors font-semibold"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          {children}
          {isActive && sortDirection === 'asc' && <ChevronUp className="h-4 w-4" />}
          {isActive && sortDirection === 'desc' && <ChevronDown className="h-4 w-4" />}
          {!isActive && <ChevronsUpDown className="h-4 w-4 opacity-30" />}
        </div>
      </TableHead>
    );
  };

  const headers = (
    <>
      <SortableHeader field="company_name">Cég</SortableHeader>
      <SortableHeader field="telephely_name">Telephely</SortableHeader>
      <SortableHeader field="full_name">Név</SortableHeader>
      <SortableHeader field="email">Email</SortableHeader>
      <SortableHeader field="flexi_username">Flexi</SortableHeader>
      <SortableHeader field="role">Szerep</SortableHeader>
      <SortableHeader field="subscription_status">Státusz</SortableHeader>
      <TableHead className="text-right font-semibold">Műveletek</TableHead>
    </>
  );

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Keresés..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterCompany} onValueChange={handleCompanyFilterChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cég szűrő" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden cég</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTelephely} onValueChange={setFilterTelephely}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Telephely szűrő" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden telephely</SelectItem>
            {filteredTelephelyOptions.map((telephely) => (
              <SelectItem key={telephely.id} value={telephely.id}>
                {telephely.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Szerep szűrő" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden szerep</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="klinika_admin">Klinika Admin</SelectItem>
            <SelectItem value="user">Felhasználó</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Státusz szűrő" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Minden státusz</SelectItem>
            <SelectItem value="active">Aktív</SelectItem>
            <SelectItem value="inactive">Inaktív</SelectItem>
          </SelectContent>
        </Select>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
            <X className="h-4 w-4" />
            Szűrők törlése
          </Button>
        )}
      </div>


      {/* Table */}
      <AnimatedTable
        loading={loading}
        headers={headers}
        isEmpty={filteredAndSortedUsers.length === 0}
        emptyMessage="Nincs találat"
        emptyIcon={<Users className="h-12 w-12" />}
      >
        {filteredAndSortedUsers.map((userData, index) => (
          <AnimatedTableRow key={userData.id} index={index}>
            <TableCell>{userData.company_name || '-'}</TableCell>
            <TableCell>{userData.telephely_name || '-'}</TableCell>
            <TableCell className="font-medium">{userData.full_name || '-'}</TableCell>
            <TableCell>{userData.email}</TableCell>
            <TableCell>
              {userData.flexi_username ? (
                <Badge variant="outline" className="text-green-700 dark:text-green-400 border-green-600/50 bg-green-50/50 dark:bg-green-950/30">
                  {userData.flexi_username}
                </Badge>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant={userData.role === 'admin' ? 'destructive' : userData.role === 'klinika_admin' ? 'default' : 'outline'}>
                {userData.role === 'admin' ? 'Admin' : userData.role === 'klinika_admin' ? 'Klinika Admin' : 'Felhasználó'}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={userData.subscription_status === 'active' ? 'default' : 'secondary'}>
                {userData.subscription_status === 'active' ? 'Aktív' : 'Inaktív'}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(userData)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onDelete(userData.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </TableCell>
          </AnimatedTableRow>
        ))}
      </AnimatedTable>
    </div>
  );
}