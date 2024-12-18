import { SHARED_CONSTANTS } from './shared_constants';

// Export SHARED_CONSTANTS directly
export { SHARED_CONSTANTS };

// Measurement Systems and Measurements
export const MEASUREMENT_SYSTEMS = SHARED_CONSTANTS.MEASUREMENT_SYSTEMS || {};
export const VOLUME_MEASUREMENTS = SHARED_CONSTANTS.VOLUME_MEASUREMENTS || {};
export const WEIGHT_MEASUREMENTS = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS || {};

// Default Patient Constants
export const DEFAULT_PATIENT_CONSTANTS = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS || {};

// Activity and Meal Types with fallbacks
export const ACTIVITY_LEVELS = SHARED_CONSTANTS.ACTIVITY_LEVELS || [
  { value: 0, label: 'Normal Activity', impact: 0 }
];

export const MEAL_TYPES = SHARED_CONSTANTS.MEAL_TYPES || [
  { value: 'other', label: 'Other' }
];

// Additional exports from shared constants
export const FOOD_CATEGORIES = SHARED_CONSTANTS.FOOD_CATEGORIES || [];
export const MEAL_TIMING_FACTORS = SHARED_CONSTANTS.MEAL_TIMING_FACTORS || {};
export const TIME_OF_DAY_FACTORS = SHARED_CONSTANTS.TIME_OF_DAY_FACTORS || {};

// New exports for disease and medication factors
export const DISEASE_FACTORS = SHARED_CONSTANTS.DISEASE_FACTORS || {};
export const MEDICATION_FACTORS = SHARED_CONSTANTS.MEDICATION_FACTORS || {};

// Export utility functions
export const convertToGrams = SHARED_CONSTANTS.convertToGrams || ((amount, unit) => amount);
export const convertToMl = SHARED_CONSTANTS.convertToMl || ((amount, unit) => amount);
export const calculateHealthFactors = SHARED_CONSTANTS.calculateHealthFactors ||
  ((diseases, medications) => 1.0);