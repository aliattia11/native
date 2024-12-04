export class BaseConstants {
  static MEASUREMENT_SYSTEMS = {
    VOLUME: 'volume',
    WEIGHT: 'weight'
  };

  static VOLUME_MEASUREMENTS = {
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

  static WEIGHT_MEASUREMENTS = {
    palm: { grams: 85, display_name: "Palm-sized" },
    handful: { grams: 30, display_name: "Handful" },
    fist: { grams: 150, display_name: "Fist-sized" },
    w_plate: { grams: 300, display_name: "Full Plate (Weight)" },
    w_small_plate: { grams: 150, display_name: "Small Plate (Weight)" },
    g: { grams: 1, display_name: "Grams" },
    kg: { grams: 1000, display_name: "Kilograms" }
  };

  static ACTIVITY_LEVELS = [
    { value: -2, label: 'Sleep', impact: -0.2 },
    { value: -1, label: 'Very Low Activity', impact: -0.1 },
    { value: 0, label: 'Normal Activity', impact: 0 },
    { value: 1, label: 'High Activity', impact: 0.1 },
    { value: 2, label: 'Vigorous Activity', impact: 0.2 }
  ];

  static MEAL_TYPES = [
    { value: 'breakfast', label: 'Breakfast' },
    { value: 'lunch', label: 'Lunch' },
    { value: 'dinner', label: 'Dinner' },
    { value: 'snack', label: 'Snack' }
  ];

  // Default patient constants that can be modified per user
  static DEFAULT_PATIENT_CONSTANTS = {
    insulin_to_carb_ratio: 10,
    correction_factor: 50,
    target_glucose: 100,
    protein_factor: 0.5,
    fat_factor: 0.2,
    activity_coefficients: {
      "-2": 0.2,
      "-1": 0.1,
      "0": 0,
      "1": -0.1,
      "2": -0.2
    },
    absorption_modifiers: {
      very_slow: 0.6,
      slow: 0.8,
      medium: 1.0,
      fast: 1.2,
      very_fast: 1.4
    },
    insulin_timing_guidelines: {
      very_slow: { timing_minutes: 0, description: "Take insulin at the start of meal" },
      slow: { timing_minutes: 5, description: "Take insulin 5 minutes before meal" },
      medium: { timing_minutes: 10, description: "Take insulin 10 minutes before meal" },
      fast: { timing_minutes: 15, description: "Take insulin 15 minutes before meal" },
      very_fast: { timing_minutes: 20, description: "Take insulin 20 minutes before meal" }
    }
  };
}