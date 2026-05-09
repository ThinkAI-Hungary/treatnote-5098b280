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
    label: 'Konzerváló fogászat',
    keywords: ['tömés', 'kompozit', 'amalgám', 'üvegionomer', 'betét', 'inlay', 'onlay', 'overlay', 'konzerváló'],
  },
  {
    visual_group: 'prosthetic',
    visual_color: '#8b5cf6',
    visual_icon: 'ring',
    label: 'Fogpótlástan',
    keywords: ['korona', 'héj', 'veneer', 'fogpótlás', 'leplezés', 'laminát', 'protetika', 'híd', 'pontic'],
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
    visual_group: 'pediatric',
    visual_color: '#f43f5e',
    visual_icon: 'sparkle',
    label: 'Gyermekfogászat',
    keywords: ['gyermek', 'tej', 'tejfog'],
  },
  {
    visual_group: 'orthodontic',
    visual_color: '#10b981',
    visual_icon: 'wavy_line',
    label: 'Fogszabályozás',
    keywords: ['fogszabályozás', 'bracket', 'ív', 'retainer', 'aligner'],
  },
  {
    visual_group: 'diagnostic',
    visual_color: '#64748b',
    visual_icon: 'dot_outline',
    label: 'Diagnosztika',
    keywords: ['röntgen', 'ct', 'cbct', 'panoráma', 'diagnoszti', 'vizsgálat', 'szkenner', 'konzultáció', 'státusz'],
  },
  {
    visual_group: 'other',
    visual_color: '#94a3b8',
    visual_icon: 'dot_outline',
    label: 'Egyéb',
    keywords: ['egyéb', 'other', 'fogkefe', 'paszta', 'szájvíz'],
  },
];

/**
 * Classify a treatment item by name and optional category.
 * Returns the best-matching visual cue, or falls back to 'other' (gray).
 */
export function classifyTreatmentItem(name: string, category?: string): TreatmentVisualCue {
  const text = `${name} ${category || ''}`.toLowerCase();

  for (const rule of CLASSIFICATION_RULES) {
    if (rule.keywords.some(kw => text.includes(kw)) || (category && category.toLowerCase() === rule.label.toLowerCase())) {
      return {
        visual_group: rule.visual_group,
        visual_color: rule.visual_color,
        visual_icon: rule.visual_icon,
        label: rule.label,
      };
    }
  }

  // Fallback: other (neutral gray)
  return {
    visual_group: 'other',
    visual_color: '#94a3b8',
    visual_icon: 'dot_outline',
    label: category && category !== 'custom' ? category : 'Egyéb',
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
] as const;
