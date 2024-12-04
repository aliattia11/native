from typing import Dict, Any, Optional, List
from pathlib import Path
import json
from bson import ObjectId
import dataclasses
from dataclasses import dataclass, asdict, field

@dataclass
class ConstantConfig:
    """Base configuration for patient-modifiable constants"""
    insulin_to_carb_ratio: float = 10
    correction_factor: float = 50
    target_glucose: float = 100
    protein_factor: float = 0.5
    fat_factor: float = 0.2
    activity_coefficients: Dict[str, float] = field(default_factory=lambda: {
        "-2": 0.2,   # Sleep
        "-1": 0.1,   # Very Low Activity
        "0": 0,      # Normal Activity
        "1": -0.1,   # High Activity
        "2": -0.2    # Vigorous Activity
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

class Constants:
    """Enhanced constants management with dataclass support"""

    # Measurement Systems
    MEASUREMENT_SYSTEMS = {
        'VOLUME': 'volume',
        'WEIGHT': 'weight'
    }

    # Volume Measurements
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

    # Weight Measurements
    WEIGHT_MEASUREMENTS = {
        'palm': {'grams': 85, 'display_name': 'Palm-sized'},
        'handful': {'grams': 30, 'display_name': 'Handful'},
        'fist': {'grams': 150, 'display_name': 'Fist-sized'},
        'w_plate': {'grams': 300, 'display_name': 'Full Plate (Weight)'},
        'w_small_plate': {'grams': 150, 'display_name': 'Small Plate (Weight)'},
        'g': {'grams': 1, 'display_name': 'Grams'},
        'kg': {'grams': 1000, 'display_name': 'Kilograms'}
    }

    # Activity Levels
    ACTIVITY_LEVELS = [
        {'value': -2, 'label': 'Sleep', 'impact': -0.2},
        {'value': -1, 'label': 'Very Low Activity', 'impact': -0.1},
        {'value': 0, 'label': 'Normal Activity', 'impact': 0},
        {'value': 1, 'label': 'High Activity', 'impact': 0.1},
        {'value': 2, 'label': 'Vigorous Activity', 'impact': 0.2}
    ]

    # Meal Types
    MEAL_TYPES = [
        {'value': 'breakfast', 'label': 'Breakfast'},
        {'value': 'lunch', 'label': 'Lunch'},
        {'value': 'dinner', 'label': 'Dinner'},
        {'value': 'snack', 'label': 'Snack'}
    ]

    def __init__(self, patient_id: Optional[str] = None):
        """
        Initialize constants with optional patient-specific overrides
        """
        self.patient_id = patient_id
        self.default_config = ConstantConfig()
        self.patient_config = self.default_config

        if patient_id:
            self._load_patient_constants()

    def _load_patient_constants(self) -> None:
        """
        Load patient-specific constants, merging with defaults
        """
        try:
            from config import mongo
            patient = mongo.db.users.find_one({'_id': ObjectId(self.patient_id)})

            if patient and 'patient_constants' in patient:
                # Merge patient constants with defaults
                patient_constants = patient['patient_constants']
                self.patient_config = dataclasses.replace(
                    self.default_config,
                    **{k: v for k, v in patient_constants.items() if hasattr(self.default_config, k)}
                )
        except Exception as e:
            print(f"Error loading patient constants: {e}")

    def get_patient_constants(self) -> Dict[str, Any]:
        """
        Get current patient or default constants as a dictionary
        """
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

  

    def convert_to_standard(self, amount: float, from_unit: str) -> Optional[float]:
        """
        Convert any measurement to its base unit (ml or g)

        Args:
            amount: The amount to convert
            from_unit: The unit to convert from

        Returns:
            Converted amount in base units (ml or g) or None if conversion not possible
        """
        if from_unit in self.volume_base:
            return amount * self.volume_base[from_unit]
        elif from_unit in self.weight_base:
            return amount * self.weight_base[from_unit]
        return None

    def convert_between_units(self, amount: float, from_unit: str, to_unit: str) -> Optional[float]:
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

    def get_constant(self, key: str, default: Any = None) -> Any:
        """Get a constant value with fallback to default"""
        return self.constants.get(key, default)

    def update_patient_constants(self, new_constants: Dict[str, Any]) -> bool:
        """Update patient-specific constants in MongoDB"""
        if not self.patient_id:
            return False

        try:
            valid_constants = {k: v for k, v in new_constants.items()
                               if k in self.DEFAULT_PATIENT_CONSTANTS}

            result = mongo.db.users.update_one(
                {'_id': ObjectId(self.patient_id)},
                {'$set': valid_constants}
            )

            if result.modified_count > 0:
                self.constants.update(valid_constants)
                return True

            return False
        except Exception as e:
            print(f"Error updating patient constants: {e}")
            return False

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
        return {
            'MEASUREMENT_SYSTEMS': cls.MEASUREMENT_SYSTEMS,
            'VOLUME_MEASUREMENTS': cls.VOLUME_MEASUREMENTS,
            'WEIGHT_MEASUREMENTS': cls.WEIGHT_MEASUREMENTS,
            'ACTIVITY_LEVELS': cls.ACTIVITY_LEVELS,
            'MEAL_TYPES': cls.MEAL_TYPES,
            'DEFAULT_PATIENT_CONSTANTS': cls.DEFAULT_PATIENT_CONSTANTS
        }

    @classmethod
    def export_constants_to_frontend(cls, output_path: str = '../frontend/src/constants/shared_constants.js') -> None:
        """
        Enhanced export of constants to JavaScript, ensuring comprehensive coverage
        """
        constants = {
            'MEASUREMENT_SYSTEMS': cls.MEASUREMENT_SYSTEMS,
            'VOLUME_MEASUREMENTS': cls.VOLUME_MEASUREMENTS,
            'WEIGHT_MEASUREMENTS': cls.WEIGHT_MEASUREMENTS,
            'DEFAULT_PATIENT_CONSTANTS': asdict(ConstantConfig()),
            'ACTIVITY_LEVELS': cls.ACTIVITY_LEVELS,
            'MEAL_TYPES': cls.MEAL_TYPES,

            # Add food-related categories from food_service.py
            'FOOD_CATEGORIES': [
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
            ],

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
        """

        frontend_path = Path(output_path)
        frontend_path.parent.mkdir(parents=True, exist_ok=True)

        with open(frontend_path, 'w') as f:
            f.write(js_content)
