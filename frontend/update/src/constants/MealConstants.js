// Constants for measurement systems
export const MEASUREMENT_SYSTEMS = {
  VOLUME: 'volume',
  WEIGHT: 'weight'
};

export const VOLUME_MEASUREMENTS = {
  cup: { ml: 240, display_name: "Cup" },
  half_cup: { ml: 120, display_name: "½ Cup" },
  quarter_cup: { ml: 60, display_name: "¼ Cup" },
  tablespoon: { ml: 15, display_name: "Tablespoon" },
  teaspoon: { ml: 5, display_name: "Teaspoon" },
  bowl: { ml: 400, display_name: "Medium Bowl" },
  v_plate: { ml: 350, display_name: "Full Plate (Volume)" },
  v_small_plate: { ml: 175, display_name: "Small Plate (Volume)" },
  ml: { ml: 1, display_name: "Milliliter" }
};

export const WEIGHT_MEASUREMENTS = {
  palm: { grams: 85, display_name: "Palm-sized" },
  handful: { grams: 30, display_name: "Handful" },
  fist: { grams: 150, display_name: "Fist-sized" },
  w_plate: { grams: 300, display_name: "Full Plate (Weight)" },
  w_small_plate: { grams: 150, display_name: "Small Plate (Weight)" },
  g: { grams: 1, display_name: "Grams" },
  kg: { grams: 1000, display_name: "Kilograms" }
};

// Activity levels
export const ACTIVITY_LEVELS = [
  { value: -2, label: 'Sleep', impact: -0.2 },
  { value: -1, label: 'Very Low Activity', impact: -0.1 },
  { value: 0, label: 'Normal Activity', impact: 0 },
  { value: 1, label: 'High Activity', impact: 0.1 },
  { value: 2, label: 'Vigorous Activity', impact: 0.2 }
];

// Meal types
export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' }
];

// Insulin calculation constants
export const INSULIN_CONSTANTS = {
  CARB_TO_INSULIN_RATIO: 10,
  PROTEIN_FACTOR: 0.5,
  FAT_FACTOR: 0.2,
  TARGET_BLOOD_SUGAR: 100,
  CORRECTION_FACTOR: 50
};

// Absorption modifiers
export const ABSORPTION_MODIFIERS = {
  very_slow: 0.6,
  slow: 0.8,
  medium: 1.0,
  fast: 1.2,
  very_fast: 1.4
};