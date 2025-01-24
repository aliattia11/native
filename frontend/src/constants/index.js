import { SHARED_CONSTANTS } from './shared_constants';

// Measurement Systems and Measurements
export const MEASUREMENT_SYSTEMS = SHARED_CONSTANTS.MEASUREMENT_SYSTEMS || {};
export const VOLUME_MEASUREMENTS = SHARED_CONSTANTS.VOLUME_MEASUREMENTS || {};
export const WEIGHT_MEASUREMENTS = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS || {};

// Default Patient Constants
export const DEFAULT_PATIENT_CONSTANTS = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS || {};

// Activity and Meal Types with fallbacks
export const ACTIVITY_LEVELS = [
  ...(SHARED_CONSTANTS.ACTIVITY_LEVELS || []),
  { value: 0, label: 'Normal Activity', impact: 0 }
];

export const MEAL_TYPES = [
  ...(SHARED_CONSTANTS.MEAL_TYPES || []),
  { value: 'other', label: 'Other' }
];
