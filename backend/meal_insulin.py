from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from datetime import datetime

# Updated imports
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
from services.food_service import get_food_details
from config import mongo
from datetime import datetime, timedelta  # Add timedelta import
import logging  # Add this import

logger = logging.getLogger(__name__)
meal_insulin_bp = Blueprint('meal_insulin', __name__)


def calculate_health_factors(user_id):
    """Calculate combined impact of diseases and medications with timing considerations"""
    try:
        # Get user from database
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return 1.0

        constants = Constants(user_id)
        patient_constants = constants.get_patient_constants()

        # Get active conditions and medications
        active_conditions = user.get('active_conditions', [])
        active_medications = user.get('active_medications', [])
        medication_schedules = user.get('medication_schedules', {})

        # Calculate disease impact
        disease_multiplier = 1.0
        for condition in active_conditions:
            if condition in patient_constants.get('disease_factors', {}):
                disease_multiplier *= patient_constants['disease_factors'][condition].get('factor', 1.0)

        # Calculate medication impact with timing
        medication_multiplier = 1.0
        current_time = datetime.utcnow()

        for medication in active_medications:
            if medication not in patient_constants.get('medication_factors', {}):
                continue

            med_data = patient_constants['medication_factors'][medication]
            med_factor = med_data.get('factor', 1.0)

            # Handle duration-based medications
            if med_data.get('duration_based', False):
                schedule = medication_schedules.get(medication)

                if schedule:
                    # Convert schedule times to datetime
                    schedule_start = datetime.fromisoformat(schedule['startDate'].replace('Z', '+00:00'))
                    schedule_end = datetime.fromisoformat(schedule['endDate'].replace('Z', '+00:00'))

                    # Check if current time is within schedule period
                    if schedule_start <= current_time <= schedule_end:
                        # Calculate time since last dose
                        daily_times = schedule.get('dailyTimes', [])
                        if daily_times:
                            # Convert daily times to current date
                            today_doses = []
                            for time_str in daily_times:
                                hour, minute = map(int, time_str.split(':'))
                                dose_time = current_time.replace(hour=hour, minute=minute)
                                if dose_time > current_time:
                                    # If time hasn't occurred today, check yesterday's dose
                                    dose_time -= timedelta(days=1)
                                today_doses.append(dose_time)

                            if today_doses:
                                # Find most recent dose
                                last_dose = max(today_doses)
                                hours_since_dose = (current_time - last_dose).total_seconds() / 3600

                                # Apply timing-based factor
                                onset_hours = med_data.get('onset_hours', 0)
                                peak_hours = med_data.get('peak_hours', 0)
                                duration_hours = med_data.get('duration_hours', 24)

                                if hours_since_dose < onset_hours:
                                    # Ramping up phase
                                    timing_factor = (hours_since_dose / onset_hours) * med_factor
                                elif hours_since_dose < peak_hours:
                                    # Peak phase
                                    timing_factor = med_factor
                                elif hours_since_dose < duration_hours:
                                    # Tapering phase
                                    remaining_effect = (duration_hours - hours_since_dose) / (
                                                duration_hours - peak_hours)
                                    timing_factor = max(1.0, med_factor * remaining_effect)
                                else:
                                    # Outside duration window
                                    timing_factor = 1.0

                                medication_multiplier *= timing_factor
                                continue

            # For non-duration based or no schedule, apply factor directly
            medication_multiplier *= med_factor

        return disease_multiplier * medication_multiplier

    except Exception as e:
        logger.error(f"Error calculating health factors: {str(e)}")
        return 1.0


    except Exception as e:
        logger.error(f"Error calculating health factors: {str(e)}")
        return 1.0  # Default multiplier in case of error


def calculate_activity_impact(activities):
    """
    Calculate the total activity impact coefficient using multiplicative factors.

    Returns:
    - float: Activity multiplier where:
        1.0 means no impact
        <1.0 means reduced insulin needs (e.g., 0.8 = 20% reduction)
        >1.0 means increased insulin needs (e.g., 1.2 = 20% increase)
    """
    if not activities:
        return 1.0  # No activities means no adjustment

    total_impact = 1.0  # Start with neutral multiplier

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
        impact_factor = activity_coefficients.get(str(level), 1.0)

        # Apply duration factor (capped at 2 hours)
        duration_weight = min(duration / 2, 1)

        # Calculate weighted impact for this activity
        # Formula: 1.0 + (impact_factor - 1.0) * duration_weight
        # This gives a smooth transition from 1.0 to the full impact_factor
        weighted_impact = 1.0 + ((impact_factor - 1.0) * duration_weight)

        # Multiply into total impact
        total_impact *= weighted_impact

    return total_impact


def get_meal_timing_factor(meal_type, time=None):
    """
    Get timing factor based on meal type and time of day using Constants class

    Args:
        meal_type (str): Type of meal (breakfast, lunch, dinner, snack)
        time (datetime, optional): Time of meal, defaults to current time
    """
    if time is None:
        time = datetime.now()

    hour = time.hour

    # Get timing factors from Constants instance instead of class
    constants = current_app.constants
    meal_timing_factors = constants.get_constant('meal_timing_factors')
    time_of_day_factors = constants.get_constant('time_of_day_factors')

    # Get base factor for meal type
    base_factor = meal_timing_factors.get(meal_type, 1.0)

    # Apply time-based adjustments
    for period, data in time_of_day_factors.items():
        start_hour, end_hour = data['hours']
        if start_hour <= hour < end_hour:
            return base_factor * data['factor']

    # Default to daytime factor if no specific period matches
    return base_factor * time_of_day_factors['daytime']['factor']


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

        # Extract portion information from the new structure
        portion_data = food.get('portion', {})
        amount = portion_data.get('amount', 1)
        unit = portion_data.get('unit', 'serving')
        measurement_type = portion_data.get('measurement_type', 'volume')
        details = food.get('details', {})

        # Convert to standard units using Constants class methods
        standard_amount = constants.convert_to_standard(amount, unit)
        if standard_amount is None:
            continue

        # Calculate ratio based on serving size
        serving_size = details.get('serving_size', {})
        base_amount = constants.convert_to_standard(
            serving_size.get('amount', 1),
            serving_size.get('unit', 'serving')
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
    constants = Constants(user_id)
    patient_constants = constants.get_patient_constants()

    # Get user-specific constants with fallbacks
    insulin_to_carb_ratio = patient_constants['insulin_to_carb_ratio']
    correction_factor = patient_constants['correction_factor']
    target_glucose = patient_constants['target_glucose']
    protein_factor = patient_constants['protein_factor']
    fat_factor = patient_constants['fat_factor']

    # Base insulin calculation
    carb_insulin = nutrition['carbs'] / insulin_to_carb_ratio
    protein_contribution = (nutrition['protein'] * protein_factor) / insulin_to_carb_ratio
    fat_contribution = (nutrition['fat'] * fat_factor) / insulin_to_carb_ratio
    base_insulin = carb_insulin + protein_contribution + fat_contribution

    # Get adjustment factors
    absorption_factor = nutrition.get('absorption_factor', 1.0)
    meal_timing_factor = get_meal_timing_factor(meal_type)
    time_factor = get_time_of_day_factor()
    activity_coefficient = calculate_activity_impact(activities)

    # Calculate adjusted insulin
    adjusted_insulin = base_insulin * absorption_factor * meal_timing_factor * time_factor * (1 + activity_coefficient)

    # Calculate correction insulin if needed
    correction_insulin = 0
    if blood_glucose is not None:
        correction_insulin = (blood_glucose - target_glucose) / correction_factor

    # Calculate health factors impact
    health_multiplier = calculate_health_factors(user_id)

    # Calculate total insulin
    total_insulin = max(0, (adjusted_insulin + correction_insulin) * health_multiplier)

    return {
        'total': round(total_insulin, 1),
        'breakdown': {
            'carb_insulin': round(carb_insulin, 2),
            'protein_contribution': round(protein_contribution, 2),
            'fat_contribution': round(fat_contribution, 2),
            'base_insulin': round(base_insulin, 2),
            'correction_insulin': round(correction_insulin, 2),
            'activity_coefficient': round(activity_coefficient, 2),
            'health_multiplier': round(health_multiplier, 2),
            'absorption_factor': absorption_factor,
            'meal_timing_factor': meal_timing_factor,
            'time_factor': time_factor
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
            portion = item.get('portion', {})
            unit = portion.get('unit')
            measurement_type = portion.get('measurement_type', 'volume')

            # Skip validation if portion structure is missing
            if not portion or not unit:
                continue

            # Check measurement type and corresponding unit
            if measurement_type == 'weight':
                if unit not in supported_measurements['weight']:
                    return jsonify({
                        "error": f"Unsupported weight measurement: {unit}",
                        "supported_measurements": supported_measurements
                    }), 400
            elif measurement_type == 'volume':
                if unit not in supported_measurements['volume']:
                    return jsonify({
                        "error": f"Unsupported volume measurement: {unit}",
                        "supported_measurements": supported_measurements
                    }), 400
            else:
                if unit not in supported_measurements['standard_portions']:
                    return jsonify({
                        "error": f"Unsupported standard portion: {unit}",
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

        # Get active conditions and medications for the meal record
        user = mongo.db.users.find_one({"_id": current_user['_id']})
        active_conditions = user.get('active_conditions', [])
        active_medications = user.get('active_medications', [])

        # Prepare meal document with health factors
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
            'notes': data.get('notes', ''),
            'activeConditions': active_conditions,  # NEW
            'activeMedications': active_medications,  # NEW
            'healthMultiplier': insulin_calc['breakdown']['health_multiplier']  # NEW
        }

        # Insert into database
        result = mongo.db.meals.insert_one(meal_doc)

        return jsonify({
            "message": "Meal logged successfully",
            "id": str(result.inserted_id),
            "nutrition": nutrition,
            "insulinCalculation": insulin_calc,
            "healthFactors": {  # NEW
                "activeConditions": active_conditions,
                "activeMedications": active_medications,
                "healthMultiplier": insulin_calc['breakdown']['health_multiplier']
            }
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