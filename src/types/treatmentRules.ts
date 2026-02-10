// Treatment Rules Types - Normalized structure for multi-tenant dental SaaS

export type ScalingType = 'per_tooth' | 'per_case' | 'fix';
export type TargetToothType = 'all' | 'pillar_only' | 'pontic_only';

export interface RuleItem {
  id?: string;
  visit_id?: string;
  name: string;
  quantity: number;
  unit: string;
  scaling: ScalingType;
  target_tooth_type: TargetToothType;
  display_order: number;
}

export interface RuleVisit {
  id?: string;
  rule_id?: string;
  visit_number: number;
  duration_days: number;
  healing_months: number;
  display_order: number;
  items: RuleItem[];
}

export interface TreatmentRule {
  id?: string;
  clinic_id: string;
  name: string;
  category: string | null;
  trigger_words: string[];
  semantic_description: string | null;
  alapszabaly?: boolean;
  aktiv?: boolean;
  created_at?: string;
  updated_at?: string;
  visits?: RuleVisit[];
}

// UI Options
export const SCALING_OPTIONS: { value: ScalingType; label: string }[] = [
  { value: 'per_tooth', label: 'Foganként' },
  { value: 'per_case', label: 'Esetenként' },
  { value: 'fix', label: 'Fix' },
];

export const TARGET_TOOTH_OPTIONS: { value: TargetToothType; label: string }[] = [
  { value: 'all', label: 'Minden' },
  { value: 'pillar_only', label: 'Csak pillér' },
  { value: 'pontic_only', label: 'Csak pótfog' },
];

export const CATEGORY_OPTIONS: string[] = [
  'Fogpótlástan',
  'Szájsebészet',
  'Endodontia',
  'Parodontológia',
  'Gyermekfogászat',
  'Fogszabályozás',
  'Konzerváló fogászat',
  'Implantológia',
  'Diagnosztika',
  'Egyéb',
];

// Default values for new items
export const DEFAULT_RULE_ITEM: Omit<RuleItem, 'display_order'> = {
  name: '',
  quantity: 1,
  unit: 'db',
  scaling: 'per_tooth',
  target_tooth_type: 'all',
};

export const DEFAULT_RULE_VISIT: Omit<RuleVisit, 'display_order' | 'visit_number'> = {
  duration_days: 0,
  healing_months: 0,
  items: [],
};
