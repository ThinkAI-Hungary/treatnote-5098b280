// Components
export { ZsigmondyCross } from './components/ZsigmondyCross';
export { ZsigmondyToothCell } from './components/ZsigmondyToothCell';
export { ToothDetailPanel } from './components/ToothDetailPanel';

// Store
export {
  useDentalStore,
  FDI_UPPER_RIGHT,
  FDI_UPPER_LEFT,
  FDI_LOWER_LEFT,
  FDI_LOWER_RIGHT,
  FDI_ALL_UPPER,
  FDI_ALL_LOWER,
  FDI_ALL,
  STATUS_COLORS,
  STATUS_LABELS,
  isUpperTooth,
  isLowerTooth,
} from './store/dentalStore';

export type {
  ToothStatus,
  ToothSurface,
  ToothData,
} from './store/dentalStore';

// Database mapping
export { dbRowToToothData, toothDataToDbRow } from './lib/dentalMapping';
export type { TeethRow } from './lib/dentalMapping';

// Data hook
export { useDentalData } from './hooks/useDentalData';
