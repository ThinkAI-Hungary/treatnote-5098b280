/**
 * Client-side treatment item classifier.
 * Maps a treatment item name + category to a visual group, color, and icon
 * using Hungarian keyword matching. No API call needed for 90%+ of items.
 */

export interface TreatmentVisualCue {
  visual_group: string;
  visual_color: string;
  visual_icon: string;
  label: string;        // Hungarian display name
}

const CLASSIFICATION_RULES: Array<TreatmentVisualCue & { keywords: string[] }> = [
  {
    visual_group: 'restorative',
    visual_color: '#3b82f6',
    visual_icon: 'filled_dot',
    label: 'Konzerváló',
    keywords: ['tömés', 'kompozit', 'amalgám', 'üvegionomer', 'betét', 'inlay', 'onlay', 'overlay', 'konzerváló'],
  },
  {
    visual_group: 'prosthetic',
    visual_color: '#8b5cf6',
    visual_icon: 'ring',
    label: 'Protetika',
    keywords: ['korona', 'héj', 'veneer', 'fogpótlás', 'leplezés', 'laminát', 'protetik'],
  },
  {
    visual_group: 'bridge',
    visual_color: '#7c3aed',
    visual_icon: 'double_ring',
    label: 'Híd',
    keywords: ['híd', 'hídtag', 'hídpillér', 'pontic'],
  },
  {
    visual_group: 'surgical',
    visual_color: '#ef4444',
    visual_icon: 'x_mark',
    label: 'Szájsebészet',
    keywords: ['extrakció', 'húzás', 'sebészet', 'rezekció', 'ciszta', 'eltávolítás', 'szájsebész'],
  },
  {
    visual_group: 'endodontic',
    visual_color: '#f97316',
    visual_icon: 'arrow_down',
    label: 'Endodontia',
    keywords: ['gyökérkezelés', 'endodontia', 'csatorna', 'pulpa', 'gyökértömés'],
  },
  {
    visual_group: 'periodontic',
    visual_color: '#22c55e',
    visual_icon: 'wavy_line',
    label: 'Parodontológia',
    keywords: ['depurálás', 'kürettálás', 'parodont', 'scaling', 'íny', 'gingivektómia', 'gingivitis'],
  },
  {
    visual_group: 'implant',
    visual_color: '#06b6d4',
    visual_icon: 'screw',
    label: 'Implantológia',
    keywords: ['implant', 'beültetés', 'csontpótlás', 'sinus', 'membrán', 'augmentáció', 'implantátum'],
  },
  {
    visual_group: 'preventive',
    visual_color: '#eab308',
    visual_icon: 'shield',
    label: 'Prevenció',
    keywords: ['szűrés', 'fluor', 'barázdazárás', 'higiénia', 'polírozás', 'prevenció', 'megelőz'],
  },
  {
    visual_group: 'diagnostic',
    visual_color: '#64748b',
    visual_icon: 'dot_outline',
    label: 'Diagnosztika',
    keywords: ['röntgen', 'ct', 'cbct', 'panoráma', 'diagnoszti', 'vizsgálat', 'szkenner', 'konzultáció'],
  },
  {
    visual_group: 'aesthetic',
    visual_color: '#ec4899',
    visual_icon: 'sparkle',
    label: 'Esztétika',
    keywords: ['fehérítés', 'esztétikai', 'smile', 'bleach', 'kozmetikai'],
  },
];

/**
 * Classify a treatment item by name and optional category.
 * Returns the best-matching visual cue, or falls back to 'diagnostic' (gray).
 */
export function classifyTreatmentItem(name: string, category?: string): TreatmentVisualCue {
  const text = `${name} ${category || ''}`.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) {
      return {
        visual_group: rule.visual_group,
        visual_color: rule.visual_color,
        visual_icon: rule.visual_icon,
        label: rule.label,
      };
    }
  }

  // Fallback: diagnostic (neutral gray)
  return {
    visual_group: 'diagnostic',
    visual_color: '#64748b',
    visual_icon: 'dot_outline',
    label: 'Diagnosztika',
  };
}

/**
 * Get all available visual groups for display in admin UI.
 */
export function getAllVisualGroups(): TreatmentVisualCue[] {
  return CLASSIFICATION_RULES.map(r => ({
    visual_group: r.visual_group,
    visual_color: r.visual_color,
    visual_icon: r.visual_icon,
    label: r.label,
  }));
}

/**
 * Get a specific visual group's display info.
 */
export function getVisualGroup(groupId: string): TreatmentVisualCue | undefined {
  return CLASSIFICATION_RULES.find(r => r.visual_group === groupId);
}

/**
 * Predefined category options for the admin form.
 */
export const TREATMENT_CATEGORIES = [
  'Konzerváló',
  'Protetika',
  'Szájsebészet',
  'Endodontia',
  'Parodontológia',
  'Implantológia',
  'Prevenció',
  'Diagnosztika',
  'Esztétika',
  'Egyéb',
] as const;
