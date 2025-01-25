from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from datetime import datetime
import json  # Add this import

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


def calculate_health_factors(user_id, frontend_health_multiplier=None):
    """
    Calculate combined impact of diseases and medications with timing considerations.

    This function assesses a user's health status by considering active conditions
    and medications, with sophisticated timing and factor calculations.

    Args:
        user_id (str): Unique identifier for the user
        frontend_health_multiplier (float, optional): Pre-calculated health multiplier

    Returns:
        float: A health factor multiplier between 0 and 2, representing overall health status
    """
    # If frontend provides a health multiplier, use it with safety
    if frontend_health_multiplier is not None:
        try:
            return float(frontend_health_multiplier)
        except (ValueError, TypeError):
            logger.warning(f"Invalid frontend health multiplier: {frontend_health_multiplier}")
            # Continue with backend calculation if frontend multiplier is invalid

    def safe_float_conversion(value, default=1.0):
        """
        Safely convert a value to float, with error logging and a default fallback.

        Args:
            value: Value to convert
            default: Default value if conversion fails

        Returns:
            float: Converted value or default
        """
        try:
            return float(value) if value is not None else default
        except (ValueError, TypeError):
            logger.warning(f"Could not convert value: {value}")
            return default

    try:
        # Retrieve user from database
        user = mongo.db.users.find_one({"_id": ObjectId(str(user_id))})
        if not user:
            return 1.0

        # Load patient-specific constants
        constants = Constants(str(user_id))
        patient_constants = constants.get_patient_constants()

        # Calculate disease impact
        disease_multiplier = 1.0
        for condition in user.get('active_conditions', []):
            factor = patient_constants.get('disease_factors', {}).get(condition, {}).get('factor')
            disease_multiplier *= safe_float_conversion(factor)

        # Calculate medication impact
        medication_multiplier = 1.0
        current_time = datetime.utcnow()

        for medication in user.get('active_medications', []):
            med_data = patient_constants.get('medication_factors', {}).get(medication, {})
            med_factor = safe_float_conversion(med_data.get('factor'))

            # Handle duration-based medications
            if med_data.get('duration_based', False):
                schedule = user.get('medication_schedules', {}).get(medication)

                if schedule:
                    try:
                        schedule_start = datetime.fromisoformat(schedule['startDate'].replace('Z', '+00:00'))
                        schedule_end = datetime.fromisoformat(schedule['endDate'].replace('Z', '+00:00'))

                        # Check if current time is within schedule period
                        if schedule_start <= current_time <= schedule_end:
                            daily_times = schedule.get('dailyTimes', [])

                            # Timing-based medication effect calculation logic
                            # (simplified version of original complex calculation)
                            if daily_times:
                                timing_factor = _calculate_medication_timing_factor(
                                    current_time,
                                    daily_times,
                                    med_data,
                                    med_factor
                                )
                                medication_multiplier *= timing_factor

                    except (ValueError, KeyError) as e:
                        logger.warning(f"Invalid schedule for {medication}: {e}")

            # For non-duration based medications, apply factor directly
            else:
                medication_multiplier *= med_factor

        # Combine and return final health factor
        return max(0.1, min(2.0, disease_multiplier * medication_multiplier))

    except Exception as e:
        logger.error(f"Error calculating health factors for user {user_id}: {str(e)}")
        return 1.0


def _calculate_medication_timing_factor(current_time, daily_times, med_data, med_factor):
    """
    Helper function to calculate medication timing factor.

    This is a simplified version of the original complex timing calculation.

    Args:
        current_time (datetime): Current time
        daily_times (list): List of daily medication times
        med_data (dict): Medication-specific data
        med_factor (float): Base medication factor

    Returns:
        float: Timing-based medication factor
    """
    try:
        # Convert daily times and find last dose
        today_doses = [
            current_time.replace(hour=int(time_str.split(':')[0]),
                                 minute=int(time_str.split(':')[1]))
            for time_str in daily_times
        ]
        today_doses = [dose if dose <= current_time else dose - timedelta(days=1)
                       for dose in today_doses]

        if not today_doses:
            return med_factor

        last_dose = max(today_doses)
        hours_since_dose = (current_time - last_dose).total_seconds() / 3600

        # Basic timing factor calculation
        onset_hours = safe_float_conversion(med_data.get('onset_hours'), 1)
        peak_hours = safe_float_conversion(med_data.get('peak_hours'), 2)
        duration_hours = safe_float_conversion(med_data.get('duration_hours'), 24)

        if hours_since_dose < onset_hours:
            return med_factor * (hours_since_dose / onset_hours)
        elif hours_since_dose < peak_hours:
            return med_factor
        elif hours_since_dose < duration_hours:
            remaining_effect = max(0, (duration_hours - hours_since_dose) / (duration_hours - peak_hours))
            return max(1.0, med_factor * remaining_effect)

        return 1.0

    except Exception as e:
        logger.warning(f"Error in timing factor calculation: {e}")
        return med_factor

def get_time_of_day_factor(time=None):
    """Get time of day factor based on current hour"""
    if time is None:
        time = datetime.now()

    hour = time.hour

    # Get time of day factors from Constants
    time_of_day_factors = current_app.constants.get_constant('time_of_day_factors')

    # Find matching time period
    for period, data in time_of_day_factors.items():
        start_hour, end_hour = data['hours']
        if start_hour <= hour < end_hour:
            return data['factor']

    # Default to daytime factor if no period matches
    return time_of_day_factors['daytime']['factor']


def calculate_activity_impact(activities):
    """Calculate the total activity impact coefficient."""
    if not activities:
        return 1.0  # No activities means no adjustment

    total_impact = 1.0

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

        # Get activity coefficient (default to 1.0 for normal activity)
        activity_coefficients = current_app.constants.get_constant('activity_coefficients')
        coefficient = activity_coefficients.get(str(level), 1.0)

        # Calculate duration weight (capped at 2 hours)
        duration_weight = min(duration / 2, 1)

        # Calculate weighted impact for this activity
        # For normal activity (coefficient = 1.0), this will result in no change
        weighted_impact = 1.0 + ((coefficient - 1.0) * duration_weight)

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
        details = food.get('details', {})
        measurement_type = portion_data.get('measurement_type', 'volume')

        # Handle weight-based measurements
        if measurement_type == 'weight':
            amount = portion_data.get('amount', 1)
            unit = portion_data.get('unit', 'g')

            # Get serving size in weight units
            serving_size = details.get('serving_size', {})
            base_w_amount = serving_size.get('w_amount', 200)  # Default to 200g if not specified
            base_w_unit = serving_size.get('w_unit', 'g')

            # Convert both to grams for comparison
            portion_in_grams = constants.convert_to_standard(amount, unit)
            base_in_grams = constants.convert_to_standard(base_w_amount, base_w_unit)

            if base_in_grams and base_in_grams > 0:
                ratio = portion_in_grams / base_in_grams
            else:
                continue

        else:  # Handle volume-based measurements
            amount = portion_data.get('amount', 1)
            unit = portion_data.get('unit', 'serving')

            # Get serving size
            serving_size = details.get('serving_size', {})
            base_amount = constants.convert_to_standard(
                serving_size.get('amount', 1),
                serving_size.get('unit', 'serving')
            )

            # Convert to standard units
            standard_amount = constants.convert_to_standard(amount, unit)
            if standard_amount is None or base_amount is None or base_amount == 0:
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


def calculate_suggested_insulin(user_id, nutrition, activities, blood_glucose=None, meal_type='normal', calculation_factors=None):
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

    # Get adjustment factors, using provided factors if available
    if calculation_factors:
        absorption_factor = calculation_factors.get('absorptionFactor', nutrition.get('absorption_factor', 1.0))
        time_factor = calculation_factors.get('timeOfDayFactor', get_time_of_day_factor())
        meal_timing_factor = calculation_factors.get('mealTimingFactor', get_meal_timing_factor(meal_type))
        activity_coefficient = calculation_factors.get('activityImpact', calculate_activity_impact(activities))
    else:
        absorption_factor = nutrition.get('absorption_factor', 1.0)
        meal_timing_factor = get_meal_timing_factor(meal_type)
        time_factor = get_time_of_day_factor()
        activity_coefficient = calculate_activity_impact(activities)

    # Calculate adjusted insulin
    adjusted_insulin = base_insulin * absorption_factor * meal_timing_factor * time_factor * activity_coefficient

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

        # Extract calculation factors from request
        calculation_factors = data.get('calculationFactors')

        logger.debug(f"""
        === Meal Submission Debug ===
        Received meal data:
        Food Items: {json.dumps(data['foodItems'], indent=2)}
        Activities: {json.dumps(data['activities'], indent=2)}
        Blood Sugar: {data.get('bloodSugar')}
        Meal Type: {data['mealType']}
        Calculation Factors: {json.dumps(data.get('calculationFactors'), indent=2)}
        ============================
        """)

        # Calculate suggested insulin with enhanced features and calculation factors
        insulin_calc = calculate_suggested_insulin(
            str(current_user['_id']),
            nutrition,
            data['activities'],
            data.get('bloodSugar'),
            data['mealType'],
            calculation_factors
        )

        # Get active conditions and medications for the meal record
        user = mongo.db.users.find_one({"_id": current_user['_id']})
        active_conditions = user.get('active_conditions', [])
        active_medications = user.get('active_medications', [])

        # Add logging to debug calculations
        logger.debug(f"Frontend calculation factors: {calculation_factors}")
        logger.debug(f"Backend insulin calculation: {insulin_calc}")

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
            'activeConditions': active_conditions,
            'activeMedications': active_medications,
            'healthMultiplier': insulin_calc['breakdown']['health_multiplier'],
            'calculationFactors': calculation_factors  # Store the frontend calculation factors
        }

        # Insert into database
        result = mongo.db.meals.insert_one(meal_doc)

        return jsonify({
            "message": "Meal logged successfully",
            "id": str(result.inserted_id),
            "nutrition": nutrition,
            "insulinCalculation": insulin_calc,
            "healthFactors": {
                "activeConditions": active_conditions,
                "activeMedications": active_medications,
                "healthMultiplier": insulin_calc['breakdown']['health_multiplier']
            }
        }), 201

    except Exception as e:
        logger.error(f"Error in submit_meal: {str(e)}")
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


@meal_insulin_bp.route('/api/meal/calculate', methods=['POST'])
@token_required
def calculate_meal(current_user):
    try:
        data = request.json
        nutrition = calculate_meal_nutrition(data['foodItems'])

        insulin_calc = calculate_suggested_insulin(
            str(current_user['_id']),
            nutrition,
            data['activities'],
            data.get('bloodSugar'),
            data['mealType'],
            data.get('calculationFactors')
        )

        # Get debug information
        user = mongo.db.users.find_one({"_id": current_user['_id']})
        constants = Constants(str(current_user['_id']))
        patient_constants = constants.get_patient_constants()

        return jsonify({
            "calculations": {
                "nutrition": nutrition,
                "insulin": insulin_calc,
                "constants": {
                    "insulin_to_carb_ratio": patient_constants['insulin_to_carb_ratio'],
                    "correction_factor": patient_constants['correction_factor'],
                    "target_glucose": patient_constants['target_glucose'],
                    "protein_factor": patient_constants['protein_factor'],
                    "fat_factor": patient_constants['fat_factor']
                },
                "conditions": user.get('active_conditions', []),
                "medications": user.get('active_medications', [])
            }
        })

    except Exception as e:
        logger.error(f"Error in calculate_meal: {str(e)}")
        return jsonify({"error": str(e)}), 400