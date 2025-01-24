from typing import Dict, Any, Optional, List
from pathlib import Path
import json
from bson import ObjectId
import dataclasses
from dataclasses import dataclass, asdict, field
import json
from pathlib import Path

@dataclass
class ConstantConfig:
    """Base configuration for patient-modifiable constants"""
    insulin_to_carb_ratio: float = 10
    correction_factor: float = 50
    target_glucose: float = 100
    protein_factor: float = 0.5
    fat_factor: float = 0.2
    activity_coefficients: Dict[str, float] = field(default_factory=lambda: {
        "-2": 1.2,  # mode 1 (20% increase in insulin needs)
        "-1": 1.1,  # mode 2 (10% increase)
        "0": 1.0,  # Normal Activity (no change)
        "1": 0.9,  # High Activity (10% decrease)
        "2": 0.8  # Vigorous Activity (20% decrease)
    })
    absorption_modifiers: Dict[str, float] = field(default_factory=lambda: {
        'very_slow': 0.6,
        'slow': 0.8,
        'medium': 1.0,
        'fast': 1.2,
        'very_fast': 1.4
    })
    insulin_timing_guidelines: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        'very_slow': {'timing_minutes': 0, 'description': 'Take insulin at the start of meal'},
        'slow': {'timing_minutes': 5, 'description': 'Take insulin 5 minutes before meal'},
        'medium': {'timing_minutes': 10, 'description': 'Take insulin 10 minutes before meal'},
        'fast': {'timing_minutes': 15, 'description': 'Take insulin 15 minutes before meal'},
        'very_fast': {'timing_minutes': 20, 'description': 'Take insulin 20 minutes before meal'}
    })
    meal_timing_factors: Dict[str, float] = field(default_factory=lambda: {
        'breakfast': 1.2,  # Higher insulin resistance in morning
        'lunch': 1.0,
        'dinner': 0.9,  # Better insulin sensitivity in evening
        'snack': 1.0  # Default factor for snacks
    })
    time_of_day_factors: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        'early_morning': {
            'hours': (0, 6),
            'factor': 1.1,
            'description': 'Very early morning adjustment'
        },
        'morning': {
            'hours': (6, 10),
            'factor': 1.2,
            'description': 'Morning insulin resistance period'
        },
        'daytime': {
            'hours': (10, 22),
            'factor': 1.0,
            'description': 'Standard daytime period'
        },
        'late_night': {
            'hours': (22, 24),
            'factor': 0.9,
            'description': 'Late night adjustment'
        }
    })
    disease_factors: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        'type_1_diabetes': {
            'factor': 1.0,
            'description': 'Standard insulin sensitivity for Type 1 Diabetes'
        },
        'type_2_diabetes': {
            'factor': 0.8,
            'description': 'Reduced insulin sensitivity for Type 2 Diabetes'
        },
        'gestational_diabetes': {
            'factor': 1.2,
            'description': 'Increased insulin sensitivity during pregnancy'
        },
        'insulin_resistance': {
            'factor': 0.7,
            'description': 'Significant reduction in insulin sensitivity'
        },
        'thyroid_disorders': {
            'factor': 1.1,
            'description': 'Slight increase in insulin requirements'
        },
        'celiac_disease': {
            'factor': 1.1,
            'description': 'May require insulin adjustment due to absorption issues'
        }
    })

    # New medication factors
    medication_factors: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        'insulin_glargine': {
            'factor': 1.0,
            'description': 'Long-acting insulin with 24-hour coverage',
            'duration_based': True,
            'onset_hours': 2,
            'peak_hours': 4,
            'duration_hours': 24,
            'type': 'long_acting_insulin'
        },
        'insulin_detemir': {
            'factor': 1.0,
            'description': 'Long-acting insulin lasting 18-24 hours',
            'duration_based': True,
            'onset_hours': 1,
            'peak_hours': 6,
            'duration_hours': 24,
            'type': 'long_acting_insulin'
        },
        'insulin_degludec': {
            'factor': 1.0,
            'description': 'Ultra-long-acting insulin lasting up to 42 hours',
            'duration_based': True,
            'onset_hours': 1,
            'peak_hours': 12,
            'duration_hours': 42,
            'type': 'long_acting_insulin'
        },
        'nph_insulin': {
            'factor': 1.0,
            'description': 'Intermediate-acting insulin with pronounced peak',
            'duration_based': True,
            'onset_hours': 1,
            'peak_hours': 4,
            'duration_hours': 16,
            'type': 'long_acting_insulin'
        },
        # Existing medications remain the same
        'oral_contraceptives': {
            'factor': 1.2,  # 20% increase in insulin resistance
            'description': 'Oral contraceptives may increase insulin resistance',
            'duration_based': True,
            'onset_hours': 24,
            'peak_hours': 72,
            'duration_hours': 720  # 30 days
        },
        'injectable_contraceptives': {
            'factor': 1.3,  # 30% increase in insulin resistance
            'description': 'Injectable contraceptives can significantly increase insulin resistance',
            'duration_based': True,
            'onset_hours': 48,
            'peak_hours': 168,  # 1 week
            'duration_hours': 2160  # 90 days for quarterly injections
        },
        # Keep existing medications...
        'corticosteroids': {
            'factor': 1.4,
            'description': 'Significant increase in insulin resistance',
            'duration_based': True,
            'onset_hours': 4,
            'peak_hours': 8,
            'duration_hours': 24
        },
        'oral_contraceptives': {
            'factor': 1.2,  # 20% increase in insulin resistance
            'description': 'Oral contraceptives may increase insulin resistance',
            'duration_based': True,
            'onset_hours': 24,
            'peak_hours': 72,
            'duration_hours': 720  # 30 days
        },
        'injectable_contraceptives': {
            'factor': 1.3,  # 30% increase in insulin resistance
            'description': 'Injectable contraceptives can significantly increase insulin resistance',
            'duration_based': True,
            'onset_hours': 48,
            'peak_hours': 168,  # 1 week
            'duration_hours': 2160  # 90 days for quarterly injections
        },
        'corticosteroids': {
            'factor': 1.4,
            'description': 'Significant increase in insulin resistance',
            'duration_based': True,
            'onset_hours': 4,
            'peak_hours': 8,
            'duration_hours': 24
        },
        'beta_blockers': {
            'factor': 1.2,
            'description': 'Moderate increase in insulin resistance',
            'duration_based': False
        },
        'thiazide_diuretics': {
            'factor': 1.1,
            'description': 'Slight increase in insulin resistance',
            'duration_based': False
        },
        'metformin': {
            'factor': 0.9,
            'description': 'Improved insulin sensitivity',
            'duration_based': False
        },
        'thiazolidinediones': {
            'factor': 0.8,
            'description': 'Significant improvement in insulin sensitivity',
            'duration_based': True,
            'onset_hours': 24,
            'peak_hours': 48,
            'duration_hours': 168  # 1 week
        }
    })
class Constants:
    """Enhanced constants management with dataclass support"""

    # Class-level constants
    MEASUREMENT_SYSTEMS = {
        'VOLUME': 'volume',
        'WEIGHT': 'weight'
    }

    VOLUME_MEASUREMENTS = {
        'cup': {'ml': 240, 'display_name': 'Cup'},
        'half_cup': {'ml': 120, 'display_name': '½ Cup'},
        'quarter_cup': {'ml': 60, 'display_name': '¼ Cup'},
        'tablespoon': {'ml': 15, 'display_name': 'Tablespoon'},
        'teaspoon': {'ml': 5, 'display_name': 'Teaspoon'},
        'bowl': {'ml': 400, 'display_name': 'Medium Bowl'},
        'v_plate': {'ml': 350, 'display_name': 'Full Plate (Volume)'},
        'v_small_plate': {'ml': 175, 'display_name': 'Small Plate (Volume)'},
        'ml': {'ml': 1, 'display_name': 'Milliliter'}
    }

    WEIGHT_MEASUREMENTS = {
        'palm': {'grams': 85, 'display_name': 'Palm-sized'},
        'handful': {'grams': 30, 'display_name': 'Handful'},
        'fist': {'grams': 150, 'display_name': 'Fist-sized'},
        'w_plate': {'grams': 300, 'display_name': 'Full Plate (Weight)'},
        'w_small_plate': {'grams': 150, 'display_name': 'Small Plate (Weight)'},
        'g': {'grams': 1, 'display_name': 'Grams'},
        'kg': {'grams': 1000, 'display_name': 'Kilograms'}
    }

    ACTIVITY_LEVELS = [
        {'value': -2, 'label': 'mode 1', 'impact': 1.2},
        {'value': -1, 'label': 'mode 2', 'impact': 1.1},
        {'value': 0, 'label': 'Normal Activity', 'impact': 1.0},
        {'value': 1, 'label': 'High Activity', 'impact': 0.9},
        {'value': 2, 'label': 'Vigorous Activity', 'impact': 0.8}
    ]

    MEAL_TYPES = [
        {'value': 'breakfast', 'label': 'Breakfast'},
        {'value': 'lunch', 'label': 'Lunch'},
        {'value': 'dinner', 'label': 'Dinner'},
        {'value': 'snack', 'label': 'Snack'}
    ]

    FOOD_CATEGORIES = [
        {'value': 'basic', 'label': 'Basic Foods'},
        {'value': 'starch', 'label': 'Starches'},
        {'value': 'starchy_vegetables', 'label': 'Starchy Vegetables'},
        {'value': 'pulses', 'label': 'Pulses'},
        {'value': 'fruits', 'label': 'Fruits'},
        {'value': 'dairy', 'label': 'Dairy'},
        {'value': 'sweets', 'label': 'Sweets & Desserts'},
        {'value': 'snacks', 'label': 'Snacks'},
        {'value': 'common_snacks', 'label': 'Common Snacks'},
        {'value': 'high_protein', 'label': 'High Protein Foods'},
        {'value': 'high_fat', 'label': 'High Fat Foods'},
        {'value': 'indian', 'label': 'Indian Dishes'},
        {'value': 'chinese', 'label': 'Chinese Dishes'},
        {'value': 'italian', 'label': 'Italian Dishes'},
        {'value': 'custom', 'label': 'Custom Foods'}
    ]

    DEFAULT_PATIENT_CONSTANTS = {
        'insulin_to_carb_ratio': 10,
        'correction_factor': 50,
        'target_glucose': 100,
        'protein_factor': 0.5,
        'fat_factor': 0.2,
        'activity_coefficients': {
            "-2": 1.2,  # mode 1 (20% increase in insulin needs)
            "-1": 1.1,  # mode 2 (10% increase)
            "0": 1.0,  # Normal Activity (no change)
            "1": 0.9,  # High Activity (10% decrease)
            "2": 0.8  # Vigorous Activity (20% decrease)
        },
        'absorption_modifiers': {
            'very_slow': 0.6,
            'slow': 0.8,
            'medium': 1.0,
            'fast': 1.2,
            'very_fast': 1.4
        },
        'insulin_timing_guidelines': {
            'very_slow': {'timing_minutes': 0, 'description': 'Take insulin at the start of meal'},
            'slow': {'timing_minutes': 5, 'description': 'Take insulin 5 minutes before meal'},
            'medium': {'timing_minutes': 10, 'description': 'Take insulin 10 minutes before meal'},
            'fast': {'timing_minutes': 15, 'description': 'Take insulin 15 minutes before meal'},
            'very_fast': {'timing_minutes': 20, 'description': 'Take insulin 20 minutes before meal'}
        },
        'meal_timing_factors': {
            'breakfast': 1.2,  # Higher insulin resistance in morning
            'lunch': 1.0,
            'dinner': 0.9,  # Better insulin sensitivity in evening
            'snack': 1.0  # Default factor for snacks
        },
        'time_of_day_factors': {
            'early_morning': {
                'hours': (0, 6),
                'factor': 1.1,
                'description': 'Very early morning adjustment'
            },
            'morning': {
                'hours': (6, 10),
                'factor': 1.2,
                'description': 'Morning insulin resistance period'
            },
            'daytime': {
                'hours': (10, 22),
                'factor': 1.0,
                'description': 'Standard daytime period'
            },
            'late_night': {
                'hours': (22, 24),
                'factor': 0.9,
                'description': 'Late night adjustment'
            }
        },
        'disease_factors': {
            'type_1_diabetes': {
                'factor': 1.0,
                'description': 'Standard insulin sensitivity for Type 1 Diabetes'
            },
            'type_2_diabetes': {
                'factor': 0.8,
                'description': 'Reduced insulin sensitivity for Type 2 Diabetes'
            },
            'gestational_diabetes': {
                'factor': 1.2,
                'description': 'Increased insulin sensitivity during pregnancy'
            },
            'insulin_resistance': {
                'factor': 0.7,
                'description': 'Significant reduction in insulin sensitivity'
            },
            'thyroid_disorders': {
                'factor': 1.1,
                'description': 'Slight increase in insulin requirements'
            },
            'celiac_disease': {
                'factor': 1.1,
                'description': 'May require insulin adjustment due to absorption issues'
            }
        },
        'medication_factors': {
            'insulin_glargine': {
                'factor': 1.0,
                'description': 'Long-acting insulin with 24-hour coverage',
                'duration_based': True,
                'onset_hours': 2,
                'peak_hours': 4,
                'duration_hours': 24,
                'type': 'long_acting_insulin'
            },
            'insulin_detemir': {
                'factor': 1.0,
                'description': 'Long-acting insulin lasting 18-24 hours',
                'duration_based': True,
                'onset_hours': 1,
                'peak_hours': 6,
                'duration_hours': 24,
                'type': 'long_acting_insulin'
            },
            'insulin_degludec': {
                'factor': 1.0,
                'description': 'Ultra-long-acting insulin lasting up to 42 hours',
                'duration_based': True,
                'onset_hours': 1,
                'peak_hours': 12,
                'duration_hours': 42,
                'type': 'long_acting_insulin'
            },
            'nph_insulin': {
                'factor': 1.0,
                'description': 'Intermediate-acting insulin with pronounced peak',
                'duration_based': True,
                'onset_hours': 1,
                'peak_hours': 4,
                'duration_hours': 16,
                'type': 'long_acting_insulin'
            },
            'oral_contraceptives': {
                'factor': 1.2,
                'description': 'Oral contraceptives may increase insulin resistance',
                'duration_based': True,
                'onset_hours': 24,
                'peak_hours': 72,
                'duration_hours': 720  # 30 days
            },
            'injectable_contraceptives': {
                'factor': 1.3,
                'description': 'Injectable contraceptives can significantly increase insulin resistance',
                'duration_based': True,
                'onset_hours': 48,
                'peak_hours': 168,  # 1 week
                'duration_hours': 2160  # 90 days for quarterly injections
            },
            'corticosteroids': {
                'factor': 1.4,
                'description': 'Significant increase in insulin resistance',
                'duration_based': True,
                'onset_hours': 4,
                'peak_hours': 8,
                'duration_hours': 24
            },
            'beta_blockers': {
                'factor': 1.2,
                'description': 'Moderate increase in insulin resistance',
                'duration_based': False
            },
            'thiazide_diuretics': {
                'factor': 1.1,
                'description': 'Slight increase in insulin resistance',
                'duration_based': False
            },
            'metformin': {
                'factor': 0.9,
                'description': 'Improved insulin sensitivity',
                'duration_based': False
            },
            'thiazolidinediones': {
                'factor': 0.8,
                'description': 'Significant improvement in insulin sensitivity',
                'duration_based': True,
                'onset_hours': 24,
                'peak_hours': 48,
                'duration_hours': 168  # 1 week
            }
        }
    }

    def __init__(self, patient_id: Optional[str] = None):
        """Initialize constants with optional patient-specific overrides"""
        self.patient_id = patient_id
        self.default_config = ConstantConfig()
        self.patient_config = self.default_config
        self._constants_cache = {}  # Add a cache for constants

        if patient_id:
            self._load_patient_constants()

    @property
    def volume_base(self) -> Dict[str, float]:
        """Returns a dictionary of volume measurements to their base unit (ml)"""
        if 'volume_base' not in self._constants_cache:
            self._constants_cache['volume_base'] = {
                unit: data['ml'] for unit, data in self.VOLUME_MEASUREMENTS.items()
            }
        return self._constants_cache['volume_base']

    @property
    def weight_base(self) -> Dict[str, float]:
        """Returns a dictionary of weight measurements to their base unit (grams)"""
        if 'weight_base' not in self._constants_cache:
            self._constants_cache['weight_base'] = {
                unit: data['grams'] for unit, data in self.WEIGHT_MEASUREMENTS.items()
            }
        return self._constants_cache['weight_base']

    def get_constant(self, key: str, default: Any = None) -> Any:
        """
        Get a constant value from patient-specific or default constants

        Args:
            key: The constant key to retrieve
            default: Default value if constant not found

        Returns:
            The constant value or default if not found
        """
        # Check cache first
        cache_key = f'constant_{key}'
        if cache_key in self._constants_cache:
            return self._constants_cache[cache_key]

        value = None

        # Check patient_config first
        if hasattr(self.patient_config, key):
            value = getattr(self.patient_config, key)
        # Then check class-level constants
        elif hasattr(self, key.upper()):
            value = getattr(self, key.upper())
        # Handle nested attributes
        elif '.' in key:
            try:
                parts = key.split('.')
                current = self.patient_config
                for part in parts:
                    if hasattr(current, part):
                        current = getattr(current, part)
                    else:
                        current = None
                        break
                value = current
            except Exception:
                value = None

        # Cache the result if it's not None
        if value is not None:
            self._constants_cache[cache_key] = value
            return value

        return default

    def convert_to_standard(self, amount: float, from_unit: str) -> Optional[float]:
        """Convert any measurement to its base unit (ml or g)"""
        try:
            if from_unit in self.volume_base:
                return float(amount) * self.volume_base[from_unit]
            elif from_unit in self.weight_base:
                return float(amount) * self.weight_base[from_unit]
            return None
        except (TypeError, ValueError):
            return None

    def _load_patient_constants(self) -> None:
        """
        Load patient-specific constants, merging with defaults
        """
        try:
            from config import mongo
            print(f"Loading constants for patient: {self.patient_id}")  # Debug log
            patient = mongo.db.users.find_one({'_id': ObjectId(self.patient_id)})

            if patient:
                # First try patient_constants field
                constants_data = patient.get('patient_constants')
                if not constants_data:
                    # If not found, try individual fields
                    constants_data = {
                        'insulin_to_carb_ratio': patient.get('insulin_to_carb_ratio'),
                        'correction_factor': patient.get('correction_factor'),
                        'target_glucose': patient.get('target_glucose'),
                        'protein_factor': patient.get('protein_factor'),
                        'fat_factor': patient.get('fat_factor'),
                        'activity_coefficients': patient.get('activity_coefficients'),
                        'absorption_modifiers': patient.get('absorption_modifiers'),
                        'insulin_timing_guidelines': patient.get('insulin_timing_guidelines')
                    }

                # Remove None values
                constants_data = {k: v for k, v in constants_data.items() if v is not None}

                if constants_data:
                    print(f"Found patient constants: {constants_data}")  # Debug log
                    self.patient_config = dataclasses.replace(
                        self.default_config,
                        **constants_data
                    )
                else:
                    print("No patient constants found, using defaults")  # Debug log
        except Exception as e:
            print(f"Error loading patient constants: {e}")

    def get_patient_constants(self) -> Dict[str, Any]:
        """Get current patient or default constants as a dictionary"""
        return asdict(self.patient_config)

    def update_patient_constants(self, new_constants: Dict[str, Any]) -> bool:
        """
        Update patient-specific constants in MongoDB
        """

        if not self.patient_id:
            return False

        try:
            # Validate and filter constants
            valid_constants = {
                k: v for k, v in new_constants.items()
                if hasattr(self.default_config, k)
            }

            result = mongo.db.users.update_one(
                {'_id': ObjectId(self.patient_id)},
                {'$set': {'patient_constants': valid_constants}}
            )

            if result.modified_count > 0:
                # Update in-memory configuration
                self.patient_config = dataclasses.replace(
                    self.patient_config,
                    **valid_constants
                )
                return True

            return False
        except Exception as e:
            print(f"Error updating patient constants: {e}")
            return False

    def convert_between_units(self, amount: float, from_unit: str, to_unit: str) -> float:
        """
        Convert between different units

        Args:
            amount: The amount to convert
            from_unit: The unit to convert from
            to_unit: The unit to convert to

        Returns:
            Converted amount in target units or None if conversion not possible
        """
        base_amount = self.convert_to_standard(amount, from_unit)
        if base_amount is None:
            return None

        if to_unit in self.volume_base:
            return base_amount / self.volume_base[to_unit]
        elif to_unit in self.weight_base:
            return base_amount / self.weight_base[to_unit]
        return None

    @classmethod
    def get_supported_measurements(cls) -> Dict[str, Any]:
        """
        Get all supported measurement types

        Returns:
            Dictionary containing volume and weight measurements with their properties
        """
        return {
            "volume": list(cls.VOLUME_MEASUREMENTS.keys()),
            "weight": list(cls.WEIGHT_MEASUREMENTS.keys()),
            "standard_portions": {
                k: {
                    "display_name": v["display_name"],
                    **({"ml": v["ml"]} if "ml" in v else {}),
                    **({"grams": v["grams"]} if "grams" in v else {})
                }
                for k, v in {**cls.VOLUME_MEASUREMENTS, **cls.WEIGHT_MEASUREMENTS}.items()
            }
        }

    @classmethod
    def get_all_constants(cls) -> Dict[str, Any]:
        """Get all base constants in a format suitable for frontend export"""
        config = ConstantConfig()
        return {
            'MEASUREMENT_SYSTEMS': cls.MEASUREMENT_SYSTEMS,
            'VOLUME_MEASUREMENTS': cls.VOLUME_MEASUREMENTS,
            'WEIGHT_MEASUREMENTS': cls.WEIGHT_MEASUREMENTS,
            'ACTIVITY_LEVELS': cls.ACTIVITY_LEVELS,
            'MEAL_TYPES': cls.MEAL_TYPES,
            'FOOD_CATEGORIES': cls.FOOD_CATEGORIES,
            'DEFAULT_PATIENT_CONSTANTS': cls.DEFAULT_PATIENT_CONSTANTS,
            'MEAL_TIMING_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['meal_timing_factors'],
            'TIME_OF_DAY_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['time_of_day_factors']
        }

    @classmethod
    def export_constants_to_frontend(cls, output_path: str = '../frontend/src/constants/shared_constants.js'):
        """
        Enhanced export of constants to JavaScript, ensuring comprehensive coverage
        """
        constants = {
            'MEASUREMENT_SYSTEMS': cls.MEASUREMENT_SYSTEMS,
            'VOLUME_MEASUREMENTS': cls.VOLUME_MEASUREMENTS,
            'WEIGHT_MEASUREMENTS': cls.WEIGHT_MEASUREMENTS,
            'DEFAULT_PATIENT_CONSTANTS': cls.DEFAULT_PATIENT_CONSTANTS,
            'ACTIVITY_LEVELS': cls.ACTIVITY_LEVELS,
            'MEAL_TYPES': cls.MEAL_TYPES,
            'FOOD_CATEGORIES': cls.FOOD_CATEGORIES,  # Use class constant
            'MEAL_TIMING_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['meal_timing_factors'],  # Use class constant
            'TIME_OF_DAY_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['time_of_day_factors'],  # Use class constant
            'DISEASE_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['disease_factors'],
            'MEDICATION_FACTORS': cls.DEFAULT_PATIENT_CONSTANTS['medication_factors'],
            # Conversion Utilities
            'CONVERSION_UTILS': {
                'convertToGrams': '''
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
          ''',
                'convertToMl': '''
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
          '''
            }
        }

        js_content = f"""// Auto-generated from backend constants - DO NOT EDIT DIRECTLY
              export const SHARED_CONSTANTS = {json.dumps(constants, indent=2)};

              // Utility Functions
              export const convertToGrams = {constants['CONVERSION_UTILS']['convertToGrams']};
              export const convertToMl = {constants['CONVERSION_UTILS']['convertToMl']};

              // New utility function for calculating disease and medication impacts
              export const calculateHealthFactors = (diseases, medications) => {{
                  let totalFactor = 1.0;

                  // Calculate disease impacts
                  if (diseases && diseases.length > 0) {{
                      diseases.forEach(disease => {{
                          const diseaseFactor = SHARED_CONSTANTS.DISEASE_FACTORS[disease]?.factor || 1.0;
                          totalFactor *= diseaseFactor;
                      }});
                  }}

                  // Calculate medication impacts
                  if (medications && medications.length > 0) {{
                      medications.forEach(med => {{
                          const medFactor = SHARED_CONSTANTS.MEDICATION_FACTORS[med]?.factor || 1.0;
                          totalFactor *= medFactor;
                      }});
                  }}

                  return totalFactor;
              }};
              """

        frontend_path = Path(output_path)
        frontend_path.parent.mkdir(parents=True, exist_ok=True)

        with open(frontend_path, 'w') as f:
            f.write(js_content)