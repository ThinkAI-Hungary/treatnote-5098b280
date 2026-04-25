import { create } from 'zustand';

// ============ Types ============

export type ToothStatus =
  | 'healthy'
  | 'caries'
  | 'filled'
  | 'crown'
  | 'bridge_anchor'
  | 'bridge_pontic'
  | 'missing'
  | 'implant'
  | 'root_canal'
  | 'extraction_planned';

export type ToothSurface = 'mesial' | 'distal' | 'occlusal' | 'buccal' | 'lingual';

export interface ToothData {
  number: number;
  present: boolean;
  status: ToothStatus;
  surfaces: Record<ToothSurface, ToothStatus>;
  mobility: number;
  notes: string;
  cariesLocations: ToothSurface[];
  restorationLocations: ToothSurface[];
  endoStatus: 'none' | 'treated' | 'retreatment' | 'planned';
  crownType: 'none' | 'metal' | 'porcelain' | 'zirconia' | 'gold';
}

// ============ Constants ============

export const STATUS_COLORS: Record<ToothStatus, string> = {
  healthy: 'hsl(var(--primary))',
  caries: '#ef4444',
  filled: '#3b82f6',
  crown: '#f59e0b',
  bridge_anchor: '#8b5cf6',
  bridge_pontic: '#a78bfa',
  missing: '#9ca3af',
  implant: '#10b981',
  root_canal: '#ec4899',
  extraction_planned: '#dc2626',
};

export const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: 'Egészséges',
  caries: 'Szuvas',
  filled: 'Tömött',
  crown: 'Korona',
  bridge_anchor: 'Híd pillér',
  bridge_pontic: 'Híd pótfog',
  missing: 'Hiányzó',
  implant: 'Implantátum',
  root_canal: 'Gyökérkezelt',
  extraction_planned: 'Extrakció tervezett',
};

// ============ FDI numbering ============

const FDI_TEETH = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  38, 37, 36, 35, 34, 33, 32, 31,
  41, 42, 43, 44, 45, 46, 47, 48,
];

export const FDI_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
export const FDI_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
export const FDI_LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
export const FDI_LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

export const FDI_ALL_UPPER = [...FDI_UPPER_RIGHT, ...FDI_UPPER_LEFT];
export const FDI_ALL_LOWER = [...FDI_LOWER_RIGHT, ...FDI_LOWER_LEFT.slice().reverse()];
export const FDI_ALL = [...FDI_ALL_UPPER, ...FDI_ALL_LOWER];

export const isUpperTooth = (num: number) => num >= 11 && num <= 28;
export const isLowerTooth = (num: number) => num >= 31 && num <= 48;

// ============ Helpers ============

const createInitialTooth = (number: number): ToothData => ({
  number,
  present: true,
  status: 'healthy',
  surfaces: {
    mesial: 'healthy',
    distal: 'healthy',
    occlusal: 'healthy',
    buccal: 'healthy',
    lingual: 'healthy',
  },
  mobility: 0,
  notes: '',
  cariesLocations: [],
  restorationLocations: [],
  endoStatus: 'none',
  crownType: 'none',
});

const createInitialTeeth = (): Record<number, ToothData> => {
  const teeth: Record<number, ToothData> = {};
  FDI_TEETH.forEach((num) => {
    teeth[num] = createInitialTooth(num);
  });
  return teeth;
};

function sortTeethAnatomically(nums: number[]): number[] {
  return [...nums].sort((a, b) => {
    const qA = Math.floor(a / 10);
    const qB = Math.floor(b / 10);
    if (qA !== qB) return qA - qB;
    return (a % 10) - (b % 10);
  });
}

// ============ Store ============

interface DentalState {
  teeth: Record<number, ToothData>;
  selectedTeeth: number[];
  selectedTooth: number | null;
  examinationId: string | null;
  isDirty: boolean;

  initializeTeeth: () => void;
  selectTooth: (toothNumber: number | null) => void;
  toggleToothSelection: (toothNumber: number) => void;
  selectMultipleTeeth: (toothNumbers: number[]) => void;
  clearSelection: () => void;
  updateTooth: (toothNumber: number, data: Partial<ToothData>) => void;
  updateMultipleTeeth: (toothNumbers: number[], data: Partial<ToothData>) => void;
  updateSurface: (toothNumber: number, surface: ToothSurface, status: ToothStatus) => void;
  updateMultipleSurfaces: (toothNumbers: number[], surface: ToothSurface, status: ToothStatus) => void;
  createBridge: (toothNumbers: number[]) => void;
  setExaminationId: (id: string | null) => void;
  setTeethFromDatabase: (teethData: ToothData[]) => void;
  resetStore: () => void;
}

export const useDentalStore = create<DentalState>((set) => ({
  teeth: createInitialTeeth(),
  selectedTeeth: [],
  selectedTooth: null,
  examinationId: null,
  isDirty: false,

  initializeTeeth: () => set({ teeth: createInitialTeeth(), isDirty: false }),

  selectTooth: (toothNumber) =>
    set({
      selectedTeeth: toothNumber !== null ? [toothNumber] : [],
      selectedTooth: toothNumber,
    }),

  toggleToothSelection: (toothNumber) =>
    set((state) => {
      const current = state.selectedTeeth;
      const next = current.includes(toothNumber)
        ? current.filter((n) => n !== toothNumber)
        : [...current, toothNumber];
      return {
        selectedTeeth: next,
        selectedTooth: next.length === 1 ? next[0] : next.length === 0 ? null : state.selectedTooth,
      };
    }),

  selectMultipleTeeth: (toothNumbers) =>
    set({
      selectedTeeth: toothNumbers,
      selectedTooth: toothNumbers.length === 1 ? toothNumbers[0] : toothNumbers[0] ?? null,
    }),

  clearSelection: () => set({ selectedTeeth: [], selectedTooth: null }),

  updateTooth: (toothNumber, data) =>
    set((state) => ({
      teeth: {
        ...state.teeth,
        [toothNumber]: { ...state.teeth[toothNumber], ...data },
      },
      isDirty: true,
    })),

  updateMultipleTeeth: (toothNumbers, data) =>
    set((state) => {
      const newTeeth = { ...state.teeth };
      for (const num of toothNumbers) {
        if (newTeeth[num]) newTeeth[num] = { ...newTeeth[num], ...data };
      }
      return { teeth: newTeeth, isDirty: true };
    }),

  updateSurface: (toothNumber, surface, status) =>
    set((state) => ({
      teeth: {
        ...state.teeth,
        [toothNumber]: {
          ...state.teeth[toothNumber],
          surfaces: { ...state.teeth[toothNumber].surfaces, [surface]: status },
        },
      },
      isDirty: true,
    })),

  updateMultipleSurfaces: (toothNumbers, surface, status) =>
    set((state) => {
      const newTeeth = { ...state.teeth };
      for (const num of toothNumbers) {
        if (newTeeth[num]) {
          newTeeth[num] = {
            ...newTeeth[num],
            surfaces: { ...newTeeth[num].surfaces, [surface]: status },
          };
        }
      }
      return { teeth: newTeeth, isDirty: true };
    }),

  createBridge: (toothNumbers) =>
    set((state) => {
      if (toothNumbers.length < 2) return state;
      const sorted = sortTeethAnatomically(toothNumbers);
      const newTeeth = { ...state.teeth };
      sorted.forEach((num, i) => {
        if (!newTeeth[num]) return;
        const isBridgeEnd = i === 0 || i === sorted.length - 1;
        newTeeth[num] = {
          ...newTeeth[num],
          status: isBridgeEnd ? 'bridge_anchor' : 'bridge_pontic',
          present: isBridgeEnd ? newTeeth[num].present : false,
        };
      });
      return { teeth: newTeeth, isDirty: true };
    }),

  setExaminationId: (id) => set({ examinationId: id }),

  setTeethFromDatabase: (teethData) => {
    const teeth = createInitialTeeth();
    teethData.forEach((tooth) => {
      if (teeth[tooth.number]) teeth[tooth.number] = tooth;
    });
    set({ teeth, isDirty: false });
  },

  resetStore: () =>
    set({
      teeth: createInitialTeeth(),
      selectedTeeth: [],
      selectedTooth: null,
      examinationId: null,
      isDirty: false,
    }),
}));
