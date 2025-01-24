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
  "ACTIVITY_LEVELS": [
    {
      "value": -2,
      "label": "mode 1",
      "impact": 1.2
    },
    {
      "value": -1,
      "label": "mode 2",
      "impact": 1.1
    },
    {
      "value": 0,
      "label": "Normal Activity",
      "impact": 1.0
    },
    {
      "value": 1,
      "label": "High Activity",
      "impact": 0.9
    },
    {
      "value": 2,
      "label": "Vigorous Activity",
      "impact": 0.8
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
  "DEFAULT_PATIENT_CONSTANTS": {
    "insulin_to_carb_ratio": 10,
    "correction_factor": 50,
    "target_glucose": 100,
    "protein_factor": 0.5,
    "fat_factor": 0.2,
    "activity_coefficients": {
      "-2": 1.2,
      "-1": 1.1,
      "0": 1.0,
      "1": 0.9,
      "2": 0.8
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
    },
    "disease_factors": {
      "type_1_diabetes": {
        "factor": 1.0,
        "description": "Standard insulin sensitivity for Type 1 Diabetes"
      },
      "type_2_diabetes": {
        "factor": 0.8,
        "description": "Reduced insulin sensitivity for Type 2 Diabetes"
      },
      "gestational_diabetes": {
        "factor": 1.2,
        "description": "Increased insulin sensitivity during pregnancy"
      },
      "insulin_resistance": {
        "factor": 0.7,
        "description": "Significant reduction in insulin sensitivity"
      },
      "thyroid_disorders": {
        "factor": 1.1,
        "description": "Slight increase in insulin requirements"
      },
      "celiac_disease": {
        "factor": 1.1,
        "description": "May require insulin adjustment due to absorption issues"
      }
    },
    "medication_factors": {
      "insulin_glargine": {
        "factor": 1.0,
        "description": "Long-acting insulin with 24-hour coverage",
        "duration_based": true,
        "onset_hours": 2,
        "peak_hours": 4,
        "duration_hours": 24,
        "type": "long_acting_insulin"
      },
      "insulin_detemir": {
        "factor": 1.0,
        "description": "Long-acting insulin lasting 18-24 hours",
        "duration_based": true,
        "onset_hours": 1,
        "peak_hours": 6,
        "duration_hours": 24,
        "type": "long_acting_insulin"
      },
      "insulin_degludec": {
        "factor": 1.0,
        "description": "Ultra-long-acting insulin lasting up to 42 hours",
        "duration_based": true,
        "onset_hours": 1,
        "peak_hours": 12,
        "duration_hours": 42,
        "type": "long_acting_insulin"
      },
      "nph_insulin": {
        "factor": 1.0,
        "description": "Intermediate-acting insulin with pronounced peak",
        "duration_based": true,
        "onset_hours": 1,
        "peak_hours": 4,
        "duration_hours": 16,
        "type": "long_acting_insulin"
      },
      "injectable_contraceptives": {
        "factor": 1.3,
        "description": "Injectable contraceptives can significantly increase insulin resistance",
        "duration_based": true,
        "onset_hours": 48,
        "peak_hours": 168,
        "duration_hours": 2160
      },
      "corticosteroids": {
        "factor": 1.4,
        "description": "Significant increase in insulin resistance",
        "duration_based": true,
        "onset_hours": 4,
        "peak_hours": 8,
        "duration_hours": 24
      },
      "oral_contraceptives": {
        "factor": 1.2,
        "description": "Oral contraceptives may increase insulin resistance",
        "duration_based": true,
        "onset_hours": 24,
        "peak_hours": 72,
        "duration_hours": 720
      },
      "beta_blockers": {
        "factor": 1.2,
        "description": "Moderate increase in insulin resistance",
        "duration_based": false
      },
      "thiazide_diuretics": {
        "factor": 1.1,
        "description": "Slight increase in insulin resistance",
        "duration_based": false
      },
      "metformin": {
        "factor": 0.9,
        "description": "Improved insulin sensitivity",
        "duration_based": false
      },
      "thiazolidinediones": {
        "factor": 0.8,
        "description": "Significant improvement in insulin sensitivity",
        "duration_based": true,
        "onset_hours": 24,
        "peak_hours": 48,
        "duration_hours": 168
      }
    },
    "insulin_types": {
      "rapid_acting": {
        "insulin_lispro": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.25,
          "peak_hours": 1.5,
          "duration_hours": 4.5,
          "type": "rapid_acting",
          "brand_names": [
            "Humalog",
            "Admelog"
          ]
        },
        "insulin_aspart": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.25,
          "peak_hours": 1.5,
          "duration_hours": 4.0,
          "type": "rapid_acting",
          "brand_names": [
            "NovoLog",
            "Fiasp"
          ]
        },
        "insulin_glulisine": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.25,
          "peak_hours": 1.5,
          "duration_hours": 4.0,
          "type": "rapid_acting",
          "brand_names": [
            "Apidra"
          ]
        }
      },
      "short_acting": {
        "regular_insulin": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.5,
          "peak_hours": 3.0,
          "duration_hours": 6.0,
          "type": "short_acting",
          "brand_names": [
            "Humulin R",
            "Novolin R"
          ]
        }
      },
      "intermediate_acting": {
        "nph_insulin": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 1.5,
          "peak_hours": 6.0,
          "duration_hours": 16.0,
          "type": "intermediate_acting",
          "brand_names": [
            "Humulin N",
            "Novolin N"
          ]
        }
      },
      "mixed": {
        "nph_regular_70_30": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.5,
          "peak_hours": 4.0,
          "duration_hours": 14.0,
          "type": "mixed",
          "brand_names": [
            "Humulin 70/30",
            "Novolin 70/30"
          ]
        },
        "nph_regular_50_50": {
          "factor": 1.0,
          "duration_based": true,
          "onset_hours": 0.5,
          "peak_hours": 3.5,
          "duration_hours": 12.0,
          "type": "mixed",
          "brand_names": [
            "Humulin 50/50"
          ]
        }
      }
    }
  },
  "INSULIN_TYPES": {
    "rapid_acting": {
      "insulin_lispro": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.25,
        "peak_hours": 1.5,
        "duration_hours": 4.5,
        "type": "rapid_acting",
        "brand_names": [
          "Humalog",
          "Admelog"
        ]
      },
      "insulin_aspart": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.25,
        "peak_hours": 1.5,
        "duration_hours": 4.0,
        "type": "rapid_acting",
        "brand_names": [
          "NovoLog",
          "Fiasp"
        ]
      },
      "insulin_glulisine": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.25,
        "peak_hours": 1.5,
        "duration_hours": 4.0,
        "type": "rapid_acting",
        "brand_names": [
          "Apidra"
        ]
      }
    },
    "short_acting": {
      "regular_insulin": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.5,
        "peak_hours": 3.0,
        "duration_hours": 6.0,
        "type": "short_acting",
        "brand_names": [
          "Humulin R",
          "Novolin R"
        ]
      }
    },
    "intermediate_acting": {
      "nph_insulin": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 1.5,
        "peak_hours": 6.0,
        "duration_hours": 16.0,
        "type": "intermediate_acting",
        "brand_names": [
          "Humulin N",
          "Novolin N"
        ]
      }
    },
    "mixed": {
      "nph_regular_70_30": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.5,
        "peak_hours": 4.0,
        "duration_hours": 14.0,
        "type": "mixed",
        "brand_names": [
          "Humulin 70/30",
          "Novolin 70/30"
        ]
      },
      "nph_regular_50_50": {
        "factor": 1.0,
        "duration_based": true,
        "onset_hours": 0.5,
        "peak_hours": 3.5,
        "duration_hours": 12.0,
        "type": "mixed",
        "brand_names": [
          "Humulin 50/50"
        ]
      }
    }
  },
  "CONVERSION_UTILS": {
    "convertToGrams": "\n                function convertToGrams(amount, unit) {\n                    const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;\n                    const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;\n\n                    if (weightMeasurements[unit]) {\n                        return amount * weightMeasurements[unit].grams;\n                    }\n\n                    if (volumeMeasurements[unit]) {\n                        // For volume, use a default density of 1g/ml for simplicity\n                        return amount * volumeMeasurements[unit].ml;\n                    }\n\n                    // If unit is not found, return the original amount\n                    return amount;\n                }\n                ",
    "convertToMl": "\n                function convertToMl(amount, unit) {\n                    const volumeMeasurements = SHARED_CONSTANTS.VOLUME_MEASUREMENTS;\n                    const weightMeasurements = SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;\n\n                    if (volumeMeasurements[unit]) {\n                        return amount * volumeMeasurements[unit].ml;\n                    }\n\n                    if (weightMeasurements[unit]) {\n                        // For weight, use a default density of 1g/ml for simplicity\n                        return amount * weightMeasurements[unit].grams;\n                    }\n\n                    // If unit is not found, return the original amount\n                    return amount;\n                }\n                "
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

        // Utility function for calculating health factors
        export const calculateHealthFactors = (diseases, medications) => {
            let totalFactor = 1.0;

            // Calculate disease impacts
            if (diseases && diseases.length > 0) {
                diseases.forEach(disease => {
                    const diseaseFactor = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.disease_factors[disease]?.factor || 1.0;
                    totalFactor *= diseaseFactor;
                });
            }

            // Calculate medication impacts
            if (medications && medications.length > 0) {
                medications.forEach(med => {
                    const medFactor = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors[med]?.factor || 1.0;
                    totalFactor *= medFactor;
                });
            }

            return totalFactor;
        };

        // Utility function for getting insulin information
        export const getInsulinInfo = (insulinName) => {
            for (const category in SHARED_CONSTANTS.INSULIN_TYPES) {
                if (SHARED_CONSTANTS.INSULIN_TYPES[category][insulinName]) {
                    return {
                        ...SHARED_CONSTANTS.INSULIN_TYPES[category][insulinName],
                        category
                    };
                }
            }
            return null;
        };
        