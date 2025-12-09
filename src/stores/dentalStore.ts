import { create } from 'zustand';

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
  surfaces: {
    mesial: ToothStatus;
    distal: ToothStatus;
    occlusal: ToothStatus;
    buccal: ToothStatus;
    lingual: ToothStatus;
  };
  mobility: number;
  notes: string;
  cariesLocations: ToothSurface[];
  restorationLocations: ToothSurface[];
  endoStatus: 'none' | 'treated' | 'retreatment' | 'planned';
  crownType: 'none' | 'metal' | 'porcelain' | 'zirconia' | 'gold';
}

interface DentalState {
  teeth: Record<number, ToothData>;
  selectedTooth: number | null;
  examinationId: string | null;
  isDirty: boolean;
  
  // Actions
  initializeTeeth: () => void;
  selectTooth: (toothNumber: number | null) => void;
  updateTooth: (toothNumber: number, data: Partial<ToothData>) => void;
  updateSurface: (toothNumber: number, surface: ToothSurface, status: ToothStatus) => void;
  setExaminationId: (id: string | null) => void;
  setTeethFromDatabase: (teethData: ToothData[]) => void;
  resetStore: () => void;
}

// FDI tooth numbering: 11-18, 21-28 (upper), 31-38, 41-48 (lower)
const FDI_TEETH = [
  // Upper right (quadrant 1)
  18, 17, 16, 15, 14, 13, 12, 11,
  // Upper left (quadrant 2)
  21, 22, 23, 24, 25, 26, 27, 28,
  // Lower left (quadrant 3)
  38, 37, 36, 35, 34, 33, 32, 31,
  // Lower right (quadrant 4)
  41, 42, 43, 44, 45, 46, 47, 48,
];

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

export const useDentalStore = create<DentalState>((set) => ({
  teeth: createInitialTeeth(),
  selectedTooth: null,
  examinationId: null,
  isDirty: false,

  initializeTeeth: () => set({ teeth: createInitialTeeth(), isDirty: false }),

  selectTooth: (toothNumber) => set({ selectedTooth: toothNumber }),

  updateTooth: (toothNumber, data) =>
    set((state) => ({
      teeth: {
        ...state.teeth,
        [toothNumber]: { ...state.teeth[toothNumber], ...data },
      },
      isDirty: true,
    })),

  updateSurface: (toothNumber, surface, status) =>
    set((state) => ({
      teeth: {
        ...state.teeth,
        [toothNumber]: {
          ...state.teeth[toothNumber],
          surfaces: {
            ...state.teeth[toothNumber].surfaces,
            [surface]: status,
          },
        },
      },
      isDirty: true,
    })),

  setExaminationId: (id) => set({ examinationId: id }),

  setTeethFromDatabase: (teethData) => {
    const teeth: Record<number, ToothData> = createInitialTeeth();
    teethData.forEach((tooth) => {
      if (teeth[tooth.number]) {
        teeth[tooth.number] = tooth;
      }
    });
    set({ teeth, isDirty: false });
  },

  resetStore: () =>
    set({
      teeth: createInitialTeeth(),
      selectedTooth: null,
      examinationId: null,
      isDirty: false,
    }),
}));

export const FDI_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
export const FDI_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
export const FDI_LOWER_LEFT = [38, 37, 36, 35, 34, 33, 32, 31];
export const FDI_LOWER_RIGHT = [41, 42, 43, 44, 45, 46, 47, 48];

export const isUpperTooth = (num: number) => num >= 11 && num <= 28;
export const isLowerTooth = (num: number) => num >= 31 && num <= 48;
export const isMolar = (num: number) => {
  const lastDigit = num % 10;
  return lastDigit >= 6 && lastDigit <= 8;
};
export const isPremolar = (num: number) => {
  const lastDigit = num % 10;
  return lastDigit === 4 || lastDigit === 5;
};
export const isIncisorOrCanine = (num: number) => {
  const lastDigit = num % 10;
  return lastDigit >= 1 && lastDigit <= 3;
};
