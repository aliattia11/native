from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from datetime import datetime

# Updated imports
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
from services.food_service import get_food_details
from config import mongo

meal_insulin_bp = Blueprint('meal_insulin', __name__)

def calculate_activity_impact(activities):
    """Calculate the total activity impact coefficient"""
    total_coefficient = 0

    for activity in activities:
        level = activity.get('level', 0)
        duration = activity.get('duration', 0)

        # Convert string duration (HH:MM) to hours
        if isinstance(duration, str):
            try:
                hours, minutes = map(int, duration.split(':'))
                duration = hours + minutes / 60
            except:
                duration = 0

        # Get activity coefficients from constants
        activity_coefficients = current_app.constants.get_constant('activity_coefficients')
        impact = activity_coefficients.get(str(level), 0)

        # Apply duration factor (capped at 2 hours)
        duration_factor = min(duration / 2, 1)
        total_coefficient += impact * duration_factor

    return total_coefficient

def get_meal_timing_factor(meal_type, time=None):
    """
    Get timing factor based on meal type and time of day

    Args:
        meal_type (str): Type of meal (breakfast, lunch, dinner, snack)
        time (datetime, optional): Time of meal, defaults to current time
    """
    if time is None:
        time = datetime.now()

    hour = time.hour

    # Base timing factors
    timing_factors = {
        'breakfast': 1.2,  # Higher insulin resistance in morning
        'lunch': 1.0,
        'dinner': 0.9,  # Better insulin sensitivity in evening
        'snack': 1.0  # Default factor for snacks
    }

    # Time-based adjustments
    if hour < 6:  # Very early morning
        return timing_factors.get(meal_type, 1.0) * 1.1
    elif 6 <= hour < 10:  # Morning
        return timing_factors.get(meal_type, 1.0) * 1.2
    elif 22 <= hour:  # Late night
        return timing_factors.get(meal_type, 1.0) * 0.9

    return timing_factors.get(meal_type, 1.0)


def calculate_meal_nutrition(food_items):
    """
    Calculate total nutrition for all food items in the meal using dual measurement system
    """
    total_calories = 0
    total_carbs = 0
    total_protein = 0
    total_fat = 0
    absorption_factors = []
    constants = current_app.constants

    for food in food_items:
        food_details = get_food_details(food['name'])
        if not food_details:
            continue

        portion = food.get('portion', 1)
        measurement = food.get('measurement', 'serving')
        details = food_details['details']

        # Convert to standard units using Constants class methods
        standard_amount = constants.convert_to_standard(portion, measurement)
        if standard_amount is None:
            continue

        # Calculate ratio based on serving size
        base_amount = constants.convert_to_standard(
            details['serving_size']['amount'],
            details['serving_size']['unit']
        )
        if base_amount is None or base_amount == 0:
            continue

        ratio = standard_amount / base_amount

        # Calculate nutrition values using the ratio
        carbs = details.get('carbs', 0) * ratio
        protein = details.get('protein', 0) * ratio
        fat = details.get('fat', 0) * ratio

        total_carbs += carbs
        total_protein += protein
        total_fat += fat
        total_calories += (carbs * 4) + (protein * 4) + (fat * 9)
        absorption_factors.append(details.get('absorption_type', 'medium'))

    # Get absorption modifiers from constants
    absorption_types = current_app.constants.get_constant('absorption_modifiers', {
        'very_fast': 1.4,
        'fast': 1.2,
        'medium': 1.0,
        'slow': 0.8,
        'very_slow': 0.6
    })

    avg_absorption = 1.0
    if absorption_factors:
        avg_absorption = sum(absorption_types.get(factor, 1.0) for factor in absorption_factors) / len(
            absorption_factors)

    return {
        'calories': round(total_calories, 1),
        'carbs': round(total_carbs, 1),
        'protein': round(total_protein, 1),
        'fat': round(total_fat, 1),
        'absorption_factor': round(avg_absorption, 2)
    }


def calculate_suggested_insulin(user_id, nutrition, activities, blood_glucose=None, meal_type='normal'):
    # Initialize Constants with patient ID
    patient_constants = Constants(user_id).get_patient_constants()  # Use get_patient_constants instead

    # Get user-specific constants with fallbacks
    insulin_to_carb_ratio = patient_constants['insulin_to_carb_ratio']
    correction_factor = patient_constants['correction_factor']
    target_glucose = patient_constants['target_glucose']
    protein_factor = patient_constants['protein_factor']
    fat_factor = patient_constants['fat_factor']
    # Calculate timing factor
    timing_factor = get_meal_timing_factor(meal_type)

    # Adjust carb calculation based on absorption factor
    absorption_adjusted_carbs = nutrition['carbs'] * nutrition.get('absorption_factor', 1.0)
    carb_insulin = absorption_adjusted_carbs / insulin_to_carb_ratio

    # Enhanced protein/fat contribution calculation
    protein_contribution = nutrition['protein'] * protein_factor
    fat_contribution = nutrition['fat'] * fat_factor
    protein_fat_insulin = (protein_contribution + fat_contribution) / insulin_to_carb_ratio

    # Calculate activity impact
    activity_coefficient = calculate_activity_impact(activities)

    # Apply timing factor to base insulin calculation
    base_insulin = (carb_insulin + protein_fat_insulin) * timing_factor

    # Activity adjustment
    activity_adjusted_insulin = base_insulin * (1 + activity_coefficient)

    # Add correction insulin if blood glucose is provided
    correction_insulin = 0
    if blood_glucose is not None:
        glucose_difference = blood_glucose - target_glucose
        correction_insulin = max(0, glucose_difference / correction_factor)

    total_insulin = activity_adjusted_insulin + correction_insulin

    return {
        'total': round(max(0, total_insulin), 1),
        'breakdown': {
            'carb_insulin': round(carb_insulin, 2),
            'protein_fat_insulin': round(protein_fat_insulin, 2),
            'timing_factor': round(timing_factor, 2),
            'activity_coefficient': round(activity_coefficient, 2),
            'correction_insulin': round(correction_insulin, 2),
            'absorption_factor': nutrition.get('absorption_factor', 1.0)
        }
    }


@meal_insulin_bp.route('/api/meal', methods=['POST'])
@token_required
def submit_meal(current_user):
    try:
        data = request.json
        required_fields = ['mealType', 'foodItems', 'activities']
        if not all(field in data for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        # Get supported measurements from Constants
        supported_measurements = current_app.constants.get_supported_measurements()

        # Validate measurements for each food item
        for item in data['foodItems']:
            measurement = item.get('measurement')
            if measurement not in supported_measurements['volume'] and \
                    measurement not in supported_measurements['weight'] and \
                    measurement not in supported_measurements['standard_portions']:
                return jsonify({
                    "error": f"Unsupported measurement: {measurement}",
                    "supported_measurements": supported_measurements
                }), 400

        # Calculate nutrition with new portion system
        nutrition = calculate_meal_nutrition(data['foodItems'])

        # Calculate suggested insulin with enhanced features
        insulin_calc = calculate_suggested_insulin(
            str(current_user['_id']),
            nutrition,
            data['activities'],
            data.get('bloodSugar'),
            data['mealType']
        )

        # Prepare meal document
        meal_doc = {
            'user_id': str(current_user['_id']),
            'timestamp': datetime.utcnow(),
            'mealType': data['mealType'],
            'foodItems': data['foodItems'],
            'activities': data['activities'],
            'nutrition': nutrition,
            'bloodSugar': data.get('bloodSugar'),
            'intendedInsulin': data.get('intendedInsulin'),
            'suggestedInsulin': insulin_calc['total'],
            'insulinCalculation': insulin_calc['breakdown'],
            'notes': data.get('notes', '')
        }

        # Insert into database
        result = mongo.db.meals.insert_one(meal_doc)

        return jsonify({
            "message": "Meal logged successfully",
            "id": str(result.inserted_id),
            "nutrition": nutrition,
            "insulinCalculation": insulin_calc
        }), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@meal_insulin_bp.route('/api/meals', methods=['GET'])
@token_required
@api_error_handler
def get_meals(current_user):
    try:
        # Parse query parameters
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))

        # Get total count for pagination
        total_meals = mongo.db.meals.count_documents({"user_id": str(current_user['_id'])})

        # Get meals with pagination
        meals = list(mongo.db.meals.find(
            {"user_id": str(current_user['_id'])}
        ).sort("timestamp", -1).skip(skip).limit(limit))

        # Transform ObjectId to string and format datetime for JSON serialization
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": str(meal['_id']),
                "mealType": meal['mealType'],
                "foodItems": meal['foodItems'],
                "activities": meal['activities'],
                "nutrition": meal['nutrition'],
                "bloodSugar": meal.get('bloodSugar'),
                "intendedInsulin": meal.get('intendedInsulin'),
                "suggestedInsulin": meal['suggestedInsulin'],
                "insulinCalculation": meal.get('insulinCalculation', {}),
                "notes": meal.get('notes', ''),
                "timestamp": meal['timestamp'].isoformat()
            }
            formatted_meals.append(formatted_meal)

        return jsonify({
            "meals": formatted_meals,
            "pagination": {
                "total": total_meals,
                "limit": limit,
                "skip": skip
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@meal_insulin_bp.route('/api/doctor/meal-history/<patient_id>', methods=['GET'])
@token_required
@api_error_handler
def get_patient_meal_history(current_user, patient_id):
    if current_user.get('user_type') != 'doctor':
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        # Fetch the meal history for the given patient_id with pagination
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))

        # Get total count for pagination
        total_meals = mongo.db.meals.count_documents({"user_id": patient_id})

        # Get meals with pagination
        meals = list(mongo.db.meals.find(
            {'user_id': patient_id}
        ).sort('timestamp', -1).skip(skip).limit(limit))

        # Transform ObjectId to string and format datetime for JSON serialization
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": str(meal['_id']),
                "mealType": meal['mealType'],
                "foodItems": meal['foodItems'],
                "activities": meal['activities'],
                "nutrition": meal['nutrition'],
                "bloodSugar": meal.get('bloodSugar'),
                "intendedInsulin": meal.get('intendedInsulin'),
                "suggestedInsulin": meal['suggestedInsulin'],
                "insulinCalculation": meal.get('insulinCalculation', {}),
                "notes": meal.get('notes', ''),
                "timestamp": meal['timestamp'].isoformat()
            }
            formatted_meals.append(formatted_meal)

        return jsonify({
            "meals": formatted_meals,
            "pagination": {
                "total": total_meals,
                "limit": limit,
                "skip": skip
            }
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500