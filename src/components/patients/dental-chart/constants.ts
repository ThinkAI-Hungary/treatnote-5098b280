import statusesJson from './statuses.json';
import { DentalStatusDef } from './types';

export const DENTAL_STATUSES = statusesJson as DentalStatusDef[];

export const SURFACES = [
  { id: 'M', label: 'Mesial' },
  { id: 'O', label: 'Occlusal' },
  { id: 'D', label: 'Distal' },
  { id: 'V', label: 'Vestibular' },
  { id: 'L', label: 'Lingual / Palatal' }
];

export const ADULT_TEETH = {
  upperRight: ['18', '17', '16', '15', '14', '13', '12', '11'],
  upperLeft: ['21', '22', '23', '24', '25', '26', '27', '28'],
  lowerRight: ['48', '47', '46', '45', '44', '43', '42', '41'],
  lowerLeft: ['31', '32', '33', '34', '35', '36', '37', '38']
};

export const BABY_TEETH = {
  upperRight: ['55', '54', '53', '52', '51'],
  upperLeft: ['61', '62', '63', '64', '65'],
  lowerRight: ['85', '84', '83', '82', '81'],
  lowerLeft: ['71', '72', '73', '74', '75']
};
