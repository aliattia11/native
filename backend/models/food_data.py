from typing import Dict, Any
from constants import Constants

# Initialize constants for use throughout the module
base_constants = Constants()
# Standardized Food Database
# Full Food Database with corrected units
FOOD_DATABASE = {
    "rice": {
        "serving_size": {
            "amount": 1,
            "unit": "bowl",
            "w_amount": 200,
            "w_unit": "g"
        },
        "carbs": 44.0,
        "protein": 5.0,
        "fat": 0.4,
        "fiber": 0.6,
        "absorption_type": "fast",
        "gi_index": 73,
        "description": "Cooked white rice"
    }
}

STARCH_LIST = {
    "white_bread": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",  # Changed from slice
            "w_amount": 50,
            "w_unit": "g"
        },
        "carbs": 26.0,
        "protein": 4.0,
        "fat": 2.0,
        "fiber": 1.2,
        "absorption_type": "fast",
        "gi_index": 75,
        "description": "White bread slices"
    }
}

STARCHY_VEGETABLES = {
    "potato": {
        "serving_size": {
            "amount": 1,
            "unit": "cup",  # Changed from palm
            "w_amount": 85,
            "w_unit": "g"
        },
        "carbs": 17.0,
        "protein": 2.0,
        "fat": 0.1,
        "fiber": 2.2,
        "absorption_type": "medium",
        "gi_index": 85,
        "description": "Medium white potato"
    }
}

PULSES = {
    "dal": {
        "serving_size": {
            "amount": 1,
            "unit": "bowl",
            "w_amount": 240,
            "w_unit": "g"
        },
        "carbs": 45.0,
        "protein": 27.0,
        "fat": 2.4,
        "fiber": 15.0,
        "absorption_type": "slow",
        "gi_index": 25,
        "description": "Cooked yellow split lentils"
    }
}

FRUITS = {
    "apple": {
        "serving_size": {
            "amount": 1,
            "unit": "cup",  # Changed from fist
            "w_amount": 150,
            "w_unit": "g"
        },
        "carbs": 21.0,
        "protein": 0.5,
        "fat": 0.3,
        "fiber": 3.6,
        "absorption_type": "medium",
        "gi_index": 36,
        "description": "Medium apple with skin"
    }
}

MILK_AND_DAIRY = {
    "paneer": {
        "serving_size": {
            "amount": 1,
            "unit": "cup",
            "w_amount": 85,
            "w_unit": "g"
        },
        "carbs": 3.0,
        "protein": 14.0,
        "fat": 22.0,
        "fiber": 0.0,
        "absorption_type": "slow",
        "gi_index": 0,
        "description": "Indian cottage cheese"
    }
}

SWEETS_AND_DESSERTS = {
    "sugar": {
        "serving_size": {
            "amount": 2,
            "unit": "tablespoon",
            "w_amount": 30,
            "w_unit": "g"
        },
        "carbs": 25.2,
        "protein": 0.0,
        "fat": 0.0,
        "fiber": 0.0,
        "absorption_type": "very_fast",
        "gi_index": 65,
        "description": "White granulated sugar"
    }
}

SNACKS = {
    "veg_pizza": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",  # Changed from slice
            "w_amount": 150,
            "w_unit": "g"
        },
        "carbs": 70.0,
        "protein": 16.0,
        "fat": 20.0,
        "fiber": 4.0,
        "absorption_type": "medium",
        "gi_index": 60,
        "description": "6-inch vegetarian pizza"
    }
}

COMMON_SNACKS = {
    "pani_puri": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",
            "w_amount": 120,
            "w_unit": "g"
        },
        "carbs": 24.0,
        "protein": 3.0,
        "fat": 8.0,
        "fiber": 1.5,
        "absorption_type": "fast",
        "gi_index": 70,
        "description": "Indian street food snack with potato filling"
    }
}

HIGH_PROTEIN_FOODS = {
    "non_veg_burger": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",
            "w_amount": 300,
            "w_unit": "g"
        },
        "carbs": 31.0,
        "protein": 29.0,
        "fat": 17.0,
        "fiber": 1.4,
        "absorption_type": "medium",
        "gi_index": 55,
        "description": "Beef burger with bun and vegetables"
    }
}

HIGH_FAT_FOODS = {
    "french_fries": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",
            "w_amount": 300,
            "w_unit": "g"
        },
        "carbs": 41.0,
        "protein": 3.4,
        "fat": 15.0,
        "fiber": 3.8,
        "absorption_type": "fast",
        "gi_index": 75,
        "description": "Medium portion"
    }
}

INDIAN_DISHES = {
    "chole_bhature": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",
            "w_amount": 300,
            "w_unit": "g"
        },
        "carbs": 65.0,
        "protein": 15.0,
        "fat": 22.0,
        "fiber": 12.0,
        "absorption_type": "medium",
        "gi_index": 45,
        "description": "Spicy chickpea curry with fried bread",
        "components": {
            "chole": {
                "carbs": 30,
                "serving": "bowl",
                "w_amount": 200,
                "w_unit": "g"
            },
            "bhature": {
                "carbs": 35,
                "serving": "v_plate",
                "w_amount": 100,
                "w_unit": "g"
            }
        }
    }
}

CHINESE_DISHES = {
    "fried_rice": {
        "serving_size": {
            "amount": 1,
            "unit": "bowl",
            "w_amount": 250,
            "w_unit": "g"
        },
        "carbs": 45.0,
        "protein": 6.0,
        "fat": 12.0,
        "fiber": 2.5,
        "absorption_type": "medium",
        "gi_index": 65,
        "description": "Stir-fried rice with vegetables"
    }
}

ITALIAN_DISHES = {
    "lasagna": {
        "serving_size": {
            "amount": 1,
            "unit": "v_plate",  # Changed from piece
            "w_amount": 250,
            "w_unit": "g"
        },
        "carbs": 35.0,
        "protein": 18.0,
        "fat": 14.0,
        "fiber": 2.8,
        "absorption_type": "medium",
        "gi_index": 55,
        "description": "Layered pasta with meat sauce and cheese"
    }
}

# Food categories mapping
FOOD_CATEGORIES = {
    'basic': FOOD_DATABASE,
    'starch': STARCH_LIST,
    'starchy_vegetables': STARCHY_VEGETABLES,
    'pulses': PULSES,
    'fruits': FRUITS,
    'dairy': MILK_AND_DAIRY,
    'sweets': SWEETS_AND_DESSERTS,
    'snacks': SNACKS,
    'common_snacks': COMMON_SNACKS,
    'high_protein': HIGH_PROTEIN_FOODS,
    'high_fat': HIGH_FAT_FOODS,
    'indian': INDIAN_DISHES,
    'chinese': CHINESE_DISHES,
    'italian': ITALIAN_DISHES
}


def validate_food_measurements(food_data: Dict[str, Any]) -> bool:
    """
    Validate that food measurements use supported units from Constants
    """
    constants = Constants()
    supported_measurements = constants.get_supported_measurements()

    serving_size = food_data.get('serving_size', {})
    unit = serving_size.get('unit')
    w_unit = serving_size.get('w_unit')

    # Check if primary unit is supported
    if unit not in supported_measurements['volume'] and unit not in supported_measurements['weight']:
        return False

    # Check if weight unit is supported
    if w_unit and w_unit not in supported_measurements['weight']:
        return False

    return True
