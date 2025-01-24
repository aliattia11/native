// Auto-generated from backend constants - DO NOT EDIT DIRECTLY
          export const SHARED_CONSTANTS = {
  "MEASUREMENT_SYSTEMS": {
    "VOLUME": "volume",
    "WEIGHT": "weight"
  },
  "VOLUME_MEASUREMENTS": {
    "cup": {
      "ml": 240,
      "display_name": "Cup"
    },
    "half_cup": {
      "ml": 120,
      "display_name": "\u00bd Cup"
    },
    "quarter_cup": {
      "ml": 60,
      "display_name": "\u00bc Cup"
    },
    "tablespoon": {
      "ml": 15,
      "display_name": "Tablespoon"
    },
    "teaspoon": {
      "ml": 5,
      "display_name": "Teaspoon"
    },
    "bowl": {
      "ml": 400,
      "display_name": "Medium Bowl"
    },
    "v_plate": {
      "ml": 350,
      "display_name": "Full Plate (Volume)"
    },
    "v_small_plate": {
      "ml": 175,
      "display_name": "Small Plate (Volume)"
    },
    "ml": {
      "ml": 1,
      "display_name": "Milliliter"
    }
  },
  "WEIGHT_MEASUREMENTS": {
    "palm": {
      "grams": 85,
      "display_name": "Palm-sized"
    },
    "handful": {
      "grams": 30,
      "display_name": "Handful"
    },
    "fist": {
      "grams": 150,
      "display_name": "Fist-sized"
    },
    "w_plate": {
      "grams": 300,
      "display_name": "Full Plate (Weight)"
    },
    "w_small_plate": {
      "grams": 150,
      "display_name": "Small Plate (Weight)"
    },
    "g": {
      "grams": 1,
      "display_name": "Grams"
    },
    "kg": {
      "grams": 1000,
      "display_name": "Kilograms"
    }
  },
  "DEFAULT_PATIENT_CONSTANTS": {
    "insulin_to_carb_ratio": 10,
    "correction_factor": 50,
    "target_glucose": 100,
    "protein_factor": 0.5,
    "fat_factor": 0.2,
    "activity_coefficients": {
      "-2": 0.2,
      "-1": 0.1,
      "0": 0,
      "1": -0.1,
      "2": -0.2
    },
    "absorption_modifiers": {
      "very_slow": 0.6,
      "slow": 0.8,
      "medium": 1.0,
      "fast": 1.2,
      "very_fast": 1.4
    },
    "insulin_timing_guidelines": {
      "very_slow": {
        "timing_minutes": 0,
        "description": "Take insulin at the start of meal"
      },
      "slow": {
        "timing_minutes": 5,
        "description": "Take insulin 5 minutes before meal"
      },
      "medium": {
        "timing_minutes": 10,
        "description": "Take insulin 10 minutes before meal"
      },
      "fast": {
        "timing_minutes": 15,
        "description": "Take insulin 15 minutes before meal"
      },
      "very_fast": {
        "timing_minutes": 20,
        "description": "Take insulin 20 minutes before meal"
      }
    },
    "meal_timing_factors": {
      "breakfast": 1.2,
      "lunch": 1.0,
      "dinner": 0.9,
      "snack": 1.0
    },
    "time_of_day_factors": {
      "early_morning": {
        "hours": [
          0,
          6
        ],
        "factor": 1.1,
        "description": "Very early morning adjustment"
      },
      "morning": {
        "hours": [
          6,
          10
        ],
        "factor": 1.2,
        "description": "Morning insulin resistance period"
      },
      "daytime": {
        "hours": [
          10,
          22
        ],
        "factor": 1.0,
        "description": "Standard daytime period"
      },
      "late_night": {
        "hours": [
          22,
          24
        ],
        "factor": 0.9,
        "description": "Late night adjustment"
      }
    }
  },
  "ACTIVITY_LEVELS": [
    {
      "value": -2,
      "label": "Sleep",
      "impact": -0.2
    },
    {
      "value": -1,
      "label": "Very Low Activity",
      "impact": -0.1
    },
    {
      "value": 0,
      "label": "Normal Activity",
      "impact": 0
    },
    {
      "value": 1,
      "label": "High Activity",
      "impact": 0.1
    },
    {
      "value": 2,
      "label": "Vigorous Activity",
      "impact": 0.2
    }
  ],
  "MEAL_TYPES": [
    {
      "value": "breakfast",
      "label": "Breakfast"
    },
    {
      "value": "lunch",
      "label": "Lunch"
    },
    {
      "value": "dinner",
      "label": "Dinner"
    },
    {
      "value": "snack",
      "label": "Snack"
    }
  ],
  "FOOD_CATEGORIES": [
    {
      "value": "basic",
      "label": "Basic Foods"
    },
    {
      "value": "starch",
      "label": "Starches"
    },
    {
      "value": "starchy_vegetables",
      "label": "Starchy Vegetables"
    },
    {
      "value": "pulses",
      "label": "Pulses"
    },
    {
      "value": "fruits",
      "label": "Fruits"
    },
    {
      "value": "dairy",
      "label": "Dairy"
    },
    {
      "value": "sweets",
      "label": "Sweets & Desserts"
    },
    {
      "value": "snacks",
      "label": "Snacks"
    },
    {
      "value": "common_snacks",
      "label": "Common Snacks"
    },
    {
      "value": "high_protein",
      "label": "High Protein Foods"
    },
    {
      "value": "high_fat",
      "label": "High Fat Foods"
    },
    {
      "value": "indian",
      "label": "Indian Dishes"
    },
    {
      "value": "chinese",
      "label": "Chinese Dishes"
    },
    {
      "value": "italian",
      "label": "Italian Dishes"
    },
    {
      "value": "custom",
      "label": "Custom Foods"
    }
  ],
  "MEAL_TIMING_FACTORS": {
    "breakfast": 1.2,
    "lunch": 1.0,
    "dinner": 0.9,
    "snack": 1.0
  },
  "TIME_OF_DAY_FACTORS": {
    "early_morning": {
      "hours": [
        0,
        6
      ],
      "factor": 1.1,
      "description": "Very early morning adjustment"
    },
    "morning": {
      "hours": [
        6,
        10
      ],
      "factor": 1.2,
      "description": "Morning insulin resistance period"
    },
    "daytime": {
      "hours": [
        10,
        22
      ],
      "factor": 1.0,
      "description": "Standard daytime period"
    },
    "late_night": {
      "hours": [
        22,
        24
      ],
      "factor": 0.9,
      "description": "Late night adjustment"
    }
  },
  "CONVERSION_UTILS": {
    "convertToGrams": "\n          function convertToGrams(amount, unit) {\n              const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;\n              const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;\n\n              if (weightMeasurements[unit]) {\n                  return amount * weightMeasurements[unit].grams;\n              }\n\n              if (volumeMeasurements[unit]) {\n                  // For volume, use a default density of 1g/ml for simplicity\n                  return amount * volumeMeasurements[unit].ml;\n              }\n\n              // If unit is not found, return the original amount\n              return amount;\n          }\n          ",
    "convertToMl": "\n          function convertToMl(amount, unit) {\n              const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;\n              const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;\n\n              if (volumeMeasurements[unit]) {\n                  return amount * volumeMeasurements[unit].ml;\n              }\n\n              if (weightMeasurements[unit]) {\n                  // For weight, use a default density of 1g/ml for simplicity\n                  return amount * weightMeasurements[unit].grams;\n              }\n\n              // If unit is not found, return the original amount\n              return amount;\n          }\n          "
  }
};

          // Utility Functions
          export const convertToGrams = 
          function convertToGrams(amount, unit) {
              const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;
              const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;

              if (weightMeasurements[unit]) {
                  return amount * weightMeasurements[unit].grams;
              }

              if (volumeMeasurements[unit]) {
                  // For volume, use a default density of 1g/ml for simplicity
                  return amount * volumeMeasurements[unit].ml;
              }

              // If unit is not found, return the original amount
              return amount;
          }
          ;
          export const convertToMl = 
          function convertToMl(amount, unit) {
              const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;
              const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;

              if (volumeMeasurements[unit]) {
                  return amount * volumeMeasurements[unit].ml;
              }

              if (weightMeasurements[unit]) {
                  // For weight, use a default density of 1g/ml for simplicity
                  return amount * weightMeasurements[unit].grams;
              }

              // If unit is not found, return the original amount
              return amount;
          }
          ;
          