from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from datetime import datetime
import json  # Add this import - it was missing
from json import dumps
from flask_cors import cross_origin
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
from services.food_service import get_food_details
from config import mongo
from datetime import datetime, timedelta
import logging


logger = logging.getLogger(__name__)
meal_insulin_bp = Blueprint('meal_insulin', __name__)



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


def calculate_suggested_insulin(user_id, nutrition, activities, blood_glucose=None, meal_type='normal',
                                calculation_factors=None):
    try:
        constants = Constants(user_id)
        patient_constants = constants.get_patient_constants()

        # Calculate carb equivalents for nutrition components
        total_carbs = nutrition['carbs']
        protein_carb_equiv = nutrition['protein'] * patient_constants['protein_factor']
        fat_carb_equiv = nutrition['fat'] * patient_constants['fat_factor']

        # Calculate total carb equivalent (sum of actual carbs and protein/fat equivalents)
        total_carb_equiv = total_carbs + protein_carb_equiv + fat_carb_equiv

        # Calculate base insulin using total carb equivalents
        base_insulin = total_carb_equiv / patient_constants['insulin_to_carb_ratio']

        # Get adjustment factors from frontend if available
        if calculation_factors:
            try:
                absorption_factor = float(
                    calculation_factors.get('absorptionFactor', nutrition.get('absorption_factor', 1.0)))
                meal_timing_factor = float(calculation_factors.get('mealTimingFactor', 1.0))
                activity_coefficient = float(calculation_factors.get('activityImpact', 1.0))

                # Get active insulin from calculation factors or default to 0
                active_insulin = float(calculation_factors.get('activeInsulin', 0.0))

                # Use the provided health multiplier instead of recalculating
                if 'healthMultiplier' in calculation_factors:
                    health_multiplier = float(calculation_factors['healthMultiplier'])
                    logger.debug(f"Using provided health multiplier from frontend: {health_multiplier}")
                else:
                    # If no health multiplier provided, calculate from medications and conditions
                    health_multiplier = 1.0
                    medications = calculation_factors.get('medications', [])
                    conditions = calculation_factors.get('conditions', [])

                    for med in medications:
                        health_multiplier *= float(med['factor'])
                    for condition in conditions:
                        health_multiplier *= float(condition['factor'])

                    logger.debug(f"Calculated health multiplier from factors: {health_multiplier}")
            except (ValueError, TypeError) as e:
                logger.error(f"Error processing calculation factors: {e}")
                return calculate_default_factors(nutrition, activities, meal_type, user_id)
        else:
            # Use default calculations if no factors provided
            absorption_factor = nutrition.get('absorption_factor', 1.0)
            meal_timing_factor = get_meal_timing_factor(meal_type)
            activity_coefficient = calculate_activity_impact(activities)
            health_multiplier = calculate_health_factors(user_id)
            active_insulin = 0.0  # Default to 0 if not provided

        # Calculate adjusted insulin
        adjusted_insulin = base_insulin * absorption_factor * meal_timing_factor * activity_coefficient

        # Calculate correction insulin if needed
        correction_insulin = 0
        if blood_glucose is not None:
            correction_insulin = (blood_glucose - patient_constants['target_glucose']) / patient_constants[
                'correction_factor']
            if correction_insulin < 0:
                correction_insulin = 0  # Don't provide negative correction

        # Calculate pre-active total (before subtracting active insulin)
        pre_active_total = adjusted_insulin + correction_insulin

        # Apply active insulin adjustment (don't go below 0)
        post_active_total = max(0, pre_active_total - active_insulin)

        # Calculate final insulin using the health multiplier
        final_insulin = post_active_total * health_multiplier

        # Apply minimum threshold (don't recommend less than 0.5 units if there was insulin needed)
        total_insulin = max(0, round(final_insulin, 1))
        if pre_active_total > 0 and total_insulin < 0.5:
            total_insulin = 0.5

        result = {
            'total': total_insulin,
            'breakdown': {
                # Nutrition data - ensure these are never None
                'carbs': round(total_carbs, 2) if total_carbs is not None else 0,
                'protein_carb_equiv': round(protein_carb_equiv, 2) if protein_carb_equiv is not None else 0,
                'fat_carb_equiv': round(fat_carb_equiv, 2) if fat_carb_equiv is not None else 0,
                'total_carb_equiv': round(total_carb_equiv, 2) if total_carb_equiv is not None else 0,

                # Insulin calculation data
                'base_insulin': round(base_insulin, 2),
                'adjusted_insulin': round(adjusted_insulin, 2),
                'correction_insulin': round(correction_insulin, 2),
                'pre_active_total': round(pre_active_total, 2),
                'active_insulin': round(active_insulin, 2),
                'post_active_total': round(post_active_total, 2),

                # Adjustment factors
                'activity_coefficient': round(activity_coefficient, 2),
                'health_multiplier': round(health_multiplier, 2),
                'absorption_factor': absorption_factor,
                'meal_timing_factor': meal_timing_factor,
            }
        }

        logger.debug(f"Final calculation result: {result}")
        return result

    except Exception as e:
        logger.error(f"Error in calculate_suggested_insulin: {str(e)}")
        raise

@meal_insulin_bp.route('/api/meal', methods=['POST'])
@token_required
def submit_meal(current_user):
    try:
        data = request.json
        required_fields = ['mealType', 'foodItems']
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

        # Calculate nutrition
        nutrition = calculate_meal_nutrition(data['foodItems'])

        # Extract calculation factors from request
        calculation_factors = data.get('calculationFactors')

        logger.debug(f"""
        === Meal Submission Debug ===
        Received meal data:
        Food Items: {json.dumps(data['foodItems'], indent=2)}
        Activities: {json.dumps(data.get('activities', []), indent=2)}
        Blood Sugar: {data.get('bloodSugar')}
        Blood Sugar Timestamp: {data.get('bloodSugarTimestamp')}
        Meal Type: {data['mealType']}
        Calculation Factors: {json.dumps(data.get('calculationFactors'), indent=2)}
        ============================
        """)

        # Calculate suggested insulin
        insulin_calc = calculate_suggested_insulin(
            str(current_user['_id']),
            nutrition,
            data.get('activities', []),
            data.get('bloodSugar'),
            data['mealType'],
            calculation_factors
        )

        # Get active conditions and medications
        user = mongo.db.users.find_one({"_id": current_user['_id']})
        active_conditions = user.get('active_conditions', [])
        active_medications = user.get('active_medications', [])

        # Current server time for record-keeping
        current_time = datetime.utcnow()

        # Parse administration time for insulin if provided
        administration_time = current_time
        if data.get('medicationLog', {}).get('scheduled_time'):
            try:
                # Parse the ISO format string from frontend into a datetime object
                time_str = data['medicationLog']['scheduled_time'].replace('Z', '+00:00')
                administration_time = datetime.fromisoformat(time_str)
                logger.debug(f"Using provided administration time: {administration_time}")
            except (ValueError, TypeError) as e:
                logger.warning(f"Error parsing administration time: {e}. Using current time instead.")

        # Process blood sugar timestamp if provided
        blood_sugar_timestamp = None
        if data.get('bloodSugarTimestamp'):
            try:
                # Use the timestamp directly - frontend now sends proper UTC ISO strings
                blood_sugar_timestamp = data['bloodSugarTimestamp']

                # Ensure it has proper timezone information
                if blood_sugar_timestamp.endswith('Z'):
                    blood_sugar_timestamp = blood_sugar_timestamp[:-1] + '+00:00'
                elif not ('+' in blood_sugar_timestamp or '-' in blood_sugar_timestamp[-6:]):
                    blood_sugar_timestamp = blood_sugar_timestamp + '+00:00'

                logger.debug(f"Using provided blood sugar reading time: {blood_sugar_timestamp}")
            except (ValueError, TypeError) as e:
                logger.warning(f"Error parsing blood sugar timestamp: {e}. Using current time instead.")
                blood_sugar_timestamp = current_time.isoformat()
        else:
            # If no timestamp provided, use the current time
            blood_sugar_timestamp = current_time.isoformat()

        # Prepare meal document - NOW WITHOUT EMBEDDED ACTIVITIES
        meal_doc = {
            'user_id': str(current_user['_id']),
            'timestamp': current_time,  # When the record was created
            'mealType': data['mealType'],
            'foodItems': data['foodItems'],
            'nutrition': nutrition,
            'activity_ids': [],  # Initialize empty array for activity references
            'bloodSugar': data.get('bloodSugar'),
            'bloodSugarTimestamp': blood_sugar_timestamp,
            'bloodSugarSource': data.get('bloodSugarSource', 'direct'),
            'intendedInsulin': data.get('intendedInsulin'),
            'intendedInsulinType': data.get('intendedInsulinType'),
            'suggestedInsulin': insulin_calc['total'],
            'suggestedInsulinType': data.get('suggestedInsulinType', 'regular_insulin'),
            'insulinCalculation': insulin_calc['breakdown'],
            'notes': data.get('notes', ''),
            'activeConditions': active_conditions,
            'activeMedications': active_medications,
            'healthMultiplier': insulin_calc['breakdown']['health_multiplier'],
            'calculationFactors': calculation_factors
        }

        # Add the insulin administration time to the meal document if insulin was taken
        if data.get('intendedInsulin') and data.get('intendedInsulinType'):
            meal_doc['insulinAdministrationTime'] = administration_time

        # Insert meal document
        result = mongo.db.meals.insert_one(meal_doc)
        meal_id = str(result.inserted_id)
        logger.info(f"Meal document created with ID: {meal_id}")

        # Get the core insulin calculation factors we need for meals-only
        base_insulin = insulin_calc['breakdown'].get('base_insulin', 0)
        absorption_factor = insulin_calc['breakdown'].get('absorption_factor', 1.0)
        meal_timing_factor = insulin_calc['breakdown'].get('meal_timing_factor', 1.0)

        # Calculate suggested insulin without health multipliers
        # This only uses base insulin × absorption factor × meal timing factor
        meal_only_suggested_insulin = base_insulin * absorption_factor * meal_timing_factor

        # Extract only the requested calculation factors
        calculation_summary = {
            'base_insulin': base_insulin,  # Total Base Units
            'adjustment_factors': {
                'absorption_rate': absorption_factor,
                'meal_timing': meal_timing_factor
            },
            'meal_only_suggested_insulin': round(meal_only_suggested_insulin, 1)  # Meal only suggested insulin
        }

        # Only create meals_only document for actual meal submissions
        if data.get('foodItems') and len(data.get('foodItems')) > 0 and data.get('mealType') not in ['blood_sugar_only', 'activity_only', 'insulin_only']:
            # Create and insert meals_only document with ONLY meal-related data
            meals_only_doc = {
                'user_id': str(current_user['_id']),
                'timestamp': current_time,
                'mealType': data['mealType'],
                'foodItems': data['foodItems'],
                'nutrition': nutrition,
                'notes': data.get('notes', ''),
                'meal_id': meal_id,  # Reference to the full meal record
                'source': 'meal_submission',
                'calculation_summary': calculation_summary
            }

            # Insert into meals_only collection
            meals_only_result = mongo.db.meals_only.insert_one(meals_only_doc)
            meals_only_id = str(meals_only_result.inserted_id)
            logger.info(f"Meals-only document created with ID: {meals_only_id}")

            # Update the main meal document with reference to meals_only
            mongo.db.meals.update_one(
                {"_id": result.inserted_id},
                {"$set": {"meals_only_id": meals_only_id}}
            )

        # Process activities - MODIFIED FOR TRUE BIDIRECTIONAL REFERENCES
        activity_ids = []
        activities_collection = mongo.db.activities

        if 'activityIds' in data:  # Use existing activities
            # Link existing activities to this meal
            for activity_id in data['activityIds']:
                try:
                    # Update existing activity with meal reference
                    activities_collection.update_one(
                        {'_id': ObjectId(activity_id)},
                        {'$set': {'meal_id': meal_id}}
                    )
                    activity_ids.append(activity_id)
                    logger.info(f"Linked existing activity {activity_id} to meal {meal_id}")
                except Exception as e:
                    logger.warning(f"Failed to link existing activity {activity_id}: {e}")

        elif data.get('activities'):  # Create new activities
            for activity in data['activities']:
                try:
                    # Create activity record
                    activity_record = {
                        'user_id': str(current_user['_id']),
                        'timestamp': current_time,
                        'type': activity.get('type', 'expected'),
                        'level': activity.get('level', 0),
                        'impact': activity.get('impact', 1.0),
                        'duration': activity.get('duration', '00:00'),
                        'meal_id': meal_id  # Reference to the meal record
                    }

                    # Handle time fields based on the activity's structure
                    if activity.get('startTime') and activity.get('endTime'):
                        # Add start and end times
                        activity_record['startTime'] = activity['startTime']
                        activity_record['endTime'] = activity['endTime']

                        # Also store in the format expected by activity.py
                        if activity.get('type') == 'expected':
                            activity_record['expectedTime'] = activity['startTime']
                        else:
                            activity_record['completedTime'] = activity['startTime']

                    if 'notes' in activity:
                        activity_record['notes'] = activity['notes']

                    # Insert the activity into the activities collection
                    activity_result = activities_collection.insert_one(activity_record)
                    activity_id = str(activity_result.inserted_id)
                    activity_ids.append(activity_id)
                    logger.info(f"Activity record created with ID: {activity_id}")
                except Exception as e:
                    logger.warning(f"Failed to save activity: {e}")

        # Update meal with activity IDs (completing bidirectional reference)
        if activity_ids:
            mongo.db.meals.update_one(
                {"_id": result.inserted_id},
                {"$set": {"activity_ids": activity_ids}}
            )
            logger.info(f"Updated meal {meal_id} with activity references: {activity_ids}")

        # If blood sugar data is present, also save it to the blood_sugar collection
        blood_sugar_id = None
        if data.get('bloodSugar') is not None:
            try:
                # Get user constants for target glucose
                user_constants = Constants(str(current_user['_id']))
                target_glucose = user_constants.get_constant('target_glucose')

                # Determine blood sugar status
                blood_sugar_value = data.get('bloodSugar')
                if blood_sugar_value < target_glucose * 0.7:  # Below 70% of target
                    status = "low"
                elif blood_sugar_value > target_glucose * 1.3:  # Above 130% of target
                    status = "high"
                else:
                    status = "normal"

                # Create blood sugar document
                blood_sugar_doc = {
                    'user_id': str(current_user['_id']),
                    'bloodSugar': blood_sugar_value,
                    'status': status,
                    'target': target_glucose,
                    'timestamp': current_time,  # When the record was created
                    'bloodSugarTimestamp': blood_sugar_timestamp,  # When the reading was taken
                    'notes': data.get('notes', ''),
                    'source': 'meal_record',  # Note that this came from a meal record
                    'meal_id': meal_id,  # Reference to the meal record
                    'mealType': data['mealType']  # Include meal type for context
                }

                # Insert into blood_sugar collection
                bs_result = mongo.db.blood_sugar.insert_one(blood_sugar_doc)
                blood_sugar_id = str(bs_result.inserted_id)

                logger.info(
                    f"Blood sugar record created with ID: {blood_sugar_id}, linked to meal ID: {meal_id}")

                # Update the meal document with the blood sugar ID reference
                mongo.db.meals.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"blood_sugar_id": blood_sugar_id}}
                )
            except Exception as e:
                logger.warning(f"Error saving blood sugar to separate collection: {e}")
                # Continue even if this fails - we still have the data in the meal record

        # Handle insulin logging in medication system
        if data.get('intendedInsulin') and data.get('intendedInsulinType'):
            try:
                # Get insulin profile data based on patient constants
                insulin_type = data['intendedInsulinType']
                patient_constants = current_app.constants.get_patient_constants()
                insulin_profile = patient_constants.get('medication_factors', {}).get(insulin_type, {})

                # Get duration parameters with fallbacks
                onset_hours = insulin_profile.get('onset_hours', 0.5)  # Default 30 min onset
                duration_hours = insulin_profile.get('duration_hours', 4.0)  # Default 4 hour duration

                # Check if this is a peakless insulin and handle specially
                is_peakless = insulin_profile.get('is_peakless', False)
                peak_hours = insulin_profile.get('peak_hours')

                # For peakless insulins or when peak_hours is null, use a default calculated value
                if peak_hours is None or is_peakless:
                    # Use middle of duration as nominal "peak" for timing calculations
                    peak_hours = duration_hours / 2

                # Create medication log entry with all necessary fields
                medication_log = {
                    'patient_id': str(current_user['_id']),
                    'medication': data['intendedInsulinType'],
                    'dose': float(data['intendedInsulin']),
                    'scheduled_time': administration_time,  # When insulin was scheduled to be taken
                    'taken_at': administration_time,  # When insulin was actually taken
                    'status': 'taken',  # Status is 'taken' as we're logging a dose that was administered
                    'created_at': current_time,  # Record creation time (server time)
                    'created_by': str(current_user['_id']),
                    'notes': data.get('notes', ''),
                    'is_insulin': True,
                    'meal_id': meal_id,
                    'meal_type': data['mealType'],
                    'blood_sugar': data.get('bloodSugar'),
                    'blood_sugar_timestamp': blood_sugar_timestamp,
                    'blood_sugar_id': blood_sugar_id,
                    'suggested_dose': insulin_calc['total'],

                    # Include insulin effect timing fields
                    'effect_start_time': administration_time,
                    'onset_time': administration_time + timedelta(hours=onset_hours),
                    'peak_time': administration_time + timedelta(hours=peak_hours),
                    'effect_end_time': administration_time + timedelta(hours=duration_hours),
                    'effect_profile': {
                        'onset_hours': onset_hours,
                        'peak_hours': peak_hours,
                        'duration_hours': duration_hours,
                        'is_peakless': is_peakless  # Include the is_peakless flag in the effect profile
                    }
                }

                # Insert medication log
                log_result = mongo.db.medication_logs.insert_one(medication_log)
                medication_log_id = str(log_result.inserted_id)

                # Update meal with medication log reference
                mongo.db.meals.update_one(
                    {"_id": result.inserted_id},
                    {"$set": {"medication_log_id": medication_log_id}}
                )

                # Update user's active medications if needed
                if data['intendedInsulinType'] not in user.get('active_medications', []):
                    mongo.db.users.update_one(
                        {'_id': current_user['_id']},
                        {
                            '$addToSet': {
                                'active_medications': data['intendedInsulinType']
                            }
                        }
                    )
                    logger.info(f"Added {data['intendedInsulinType']} to user's active medications")

                logger.info(
                    f"Successfully logged insulin dose: {medication_log['dose']} units of {medication_log['medication']} at {administration_time}")

            except Exception as e:
                logger.error(f"Error updating medication records: {str(e)}")

                # Continue with meal submission even if medication record updates fail
        return jsonify({
            "message": "Meal logged successfully",
            "id": meal_id,
            "meals_only_id": meals_only_id if 'meals_only_id' in locals() else None,  # Use None if meals_only_id is not defined
            "blood_sugar_id": blood_sugar_id,  # Include the blood sugar ID if created
            "activity_ids": activity_ids,  # Include activity IDs in response
            "nutrition": nutrition,
            "insulinCalculation": insulin_calc,
            "bloodSugarTimestamp": blood_sugar_timestamp,  # Return the timestamp in the response
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

        # Add logging for debugging
        logger.info(f"Fetching meals for user {current_user['_id']} with limit {limit} and skip {skip}")

        # Get total count for pagination
        total_meals = mongo.db.meals.count_documents({"user_id": str(current_user['_id'])})

        logger.info(f"Found {total_meals} total meals for user {current_user['_id']}")

        # Get meals with pagination
        meals = list(mongo.db.meals.find(
            {"user_id": str(current_user['_id'])}
        ).sort("timestamp", -1).skip(skip).limit(limit))

        logger.info(f"Retrieved {len(meals)} meals after pagination")

        # Transform ObjectId to string and format datetime for JSON serialization
        formatted_meals = []
        for meal in meals:
            try:
                # Check if the meal has all necessary fields
                logger.debug(f"Processing meal {meal.get('_id')}, type: {meal.get('mealType')}")

                formatted_meal = {
                    "id": str(meal.get('_id')),
                    "mealType": meal.get('mealType', 'unknown'),
                    "foodItems": meal.get('foodItems', []),
                    "nutrition": meal.get('nutrition', {}),
                    "activities": meal.get('activities', []),
                    "bloodSugar": meal.get('bloodSugar'),
                    "bloodSugarTimestamp": meal.get('bloodSugarTimestamp'),
                    "bloodSugarSource": meal.get('bloodSugarSource', 'direct'),
                    "intendedInsulin": meal.get('intendedInsulin'),
                    "intendedInsulinType": meal.get('intendedInsulinType'),
                    "suggestedInsulin": meal.get('suggestedInsulin', 0),  # Default to 0 if missing
                    "suggestedInsulinType": meal.get('suggestedInsulinType', 'regular_insulin'),
                    "insulinCalculation": meal.get('insulinCalculation', {}),
                    "notes": meal.get('notes', ''),
                    "timestamp": meal['timestamp'].isoformat()
                }

                # Add imported_at field if it exists
                if 'imported_at' in meal:
                    formatted_meal["imported_at"] = meal['imported_at'].isoformat()

                formatted_meals.append(formatted_meal)
            except Exception as e:
                logger.error(f"Error processing meal {meal.get('_id')}: {str(e)}")
                # Continue with the next meal instead of failing the entire request

        return jsonify({
            "meals": formatted_meals,
            "pagination": {
                "total": total_meals,
                "limit": limit,
                "skip": skip
            }
        }), 200

    except Exception as e:
        logger.error(f"Error in get_meals: {str(e)}")
        return jsonify({"error": str(e)}), 400


@meal_insulin_bp.route('/api/repair-imported-meals', methods=['POST'])
@token_required
@api_error_handler
def repair_imported_meals(current_user):
    """
    Repair imported meal records by adding missing required fields
    """
    try:
        # Only allow admin or doctor to run this
        if current_user.get('user_type') not in ['doctor', 'admin']:
            return jsonify({"error": "Unauthorized"}), 403

        # Get patient ID from request or use current user
        patient_id = request.json.get('patient_id', str(current_user['_id']))

        # Find all imported meals (those with imported_at field)
        imported_meals = mongo.db.meals.find({"user_id": patient_id, "imported_at": {"$exists": True}})
        count = 0

        for meal in imported_meals:
            updates = {}

            # Check and add missing fields
            if 'suggestedInsulin' not in meal:
                updates['suggestedInsulin'] = 0

            if 'suggestedInsulinType' not in meal:
                updates['suggestedInsulinType'] = 'regular_insulin'

            if 'insulinCalculation' not in meal:
                updates['insulinCalculation'] = {}

            if 'activities' not in meal:
                updates['activities'] = []

            if updates:
                mongo.db.meals.update_one(
                    {"_id": meal['_id']},
                    {"$set": updates}
                )
                count += 1

        return jsonify({
            "message": f"Repaired {count} imported meal records",
            "patient_id": patient_id
        }), 200

    except Exception as e:
        logger.error(f"Error in repair_imported_meals: {str(e)}")
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

def calculate_health_factors(user_id):
    try:
        # Get user from database
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            logger.warning(f"User {user_id} not found, using default health multiplier")
            return 1.0

        constants = Constants(user_id)
        patient_constants = constants.get_patient_constants()

        # Calculate disease impact
        disease_multiplier = 1.0
        active_conditions = user.get('active_conditions', [])
        for condition in active_conditions:
            condition_data = patient_constants.get('disease_factors', {}).get(condition, {})
            if condition_data and 'factor' in condition_data:
                try:
                    disease_multiplier *= float(condition_data['factor'])
                except (ValueError, TypeError) as e:
                    logger.error(f"Invalid disease factor for condition {condition}: {e}")

        # Calculate medication impact
        medication_multiplier = 1.0
        active_medications = user.get('active_medications', [])
        for medication in active_medications:
            med_data = patient_constants.get('medication_factors', {}).get(medication, {})
            if med_data and 'factor' in med_data:
                try:
                    medication_multiplier *= float(med_data['factor'])
                except (ValueError, TypeError) as e:
                    logger.error(f"Invalid medication factor for medication {medication}: {e}")

        return disease_multiplier * medication_multiplier

    except Exception as e:
        logger.error(f"Error calculating health factors: {str(e)}")
        return 1.0


@meal_insulin_bp.route('/api/blood-sugar', methods=['POST'])
@token_required
def submit_blood_sugar(current_user):
    try:
        data = request.json
        blood_sugar = data.get('bloodSugar')

        if blood_sugar is None:
            return jsonify({"error": "Blood sugar value is required"}), 400

        # Create a meal document for standalone blood sugar reading
        meal_doc = {
            'user_id': str(current_user['_id']),
            'timestamp': datetime.utcnow(),
            'mealType': 'blood_sugar_only',
            'foodItems': [],
            'activities': [],
            'nutrition': {
                'calories': 0,
                'carbs': 0,
                'protein': 0,
                'fat': 0,
                'absorption_factor': 1.0
            },
            'bloodSugar': blood_sugar,
            'bloodSugarTimestamp': data.get('bloodSugarTimestamp') or datetime.utcnow().isoformat(),
            'notes': data.get('notes', ''),
            'isStandaloneReading': True
        }

        # Insert into meals collection
        result = mongo.db.meals.insert_one(meal_doc)

        return jsonify({
            "message": "Blood sugar level recorded successfully",
            "id": str(result.inserted_id)
        }), 201

    except Exception as e:
        logger.error(f"Error in submit_blood_sugar: {str(e)}")
        return jsonify({"error": str(e)}), 400

@meal_insulin_bp.route('/api/import-meals', methods=['POST', 'OPTIONS'])
@cross_origin(origins=["http://localhost:3000"], methods=['POST', 'OPTIONS'],
              allow_headers=['Authorization', 'Content-Type'])
@token_required
@api_error_handler
def import_meals(current_user):
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    try:
        data = request.json
        meals = data.get('meals', [])

        if not meals:
            return jsonify({"error": "No meals provided"}), 400

        # Insert meals in bulk
        result = mongo.db.meals.insert_many(meals)

        return jsonify({
            "message": "Successfully imported meals",
            "count": len(result.inserted_ids)
        }), 201

    except Exception as e:
        logger.error(f"Error importing meals: {str(e)}")
        return jsonify({"error": str(e)}), 500


@meal_insulin_bp.route('/api/meals-only', methods=['GET'])
@token_required
@api_error_handler
def get_meals_only(current_user):
    try:
        # Parse query parameters
        limit = int(request.args.get('limit', 10))
        skip = int(request.args.get('skip', 0))
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        filter_by = request.args.get('filter_by', 'timestamp')

        # Determine user ID (allow doctors to view patient data)
        patient_id = request.args.get('patient_id')
        if patient_id and current_user.get('user_type') != 'doctor':
            return jsonify({"error": "Unauthorized to view patient data"}), 403

        user_id = patient_id if patient_id else str(current_user['_id'])

        # Base query - always filter by user
        query = {"user_id": user_id}

        # Handle filtering based on time parameters
        if start_date_str or end_date_str:
            # Parse the provided time parameters
            start_datetime = None
            end_datetime = None

            if start_date_str:
                try:
                    start_datetime = datetime.strptime(start_date_str, '%Y-%m-%d')
                    logger.debug(f"Using start date: {start_datetime}")
                except Exception as e:
                    logger.error(f"Error parsing start date '{start_date_str}': {e}")
                    return jsonify({"error": f"Invalid start_date format: {start_date_str}"}), 400

            if end_date_str:
                try:
                    # Add one day to include full end date
                    end_datetime = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
                    logger.debug(f"Using end date: {end_datetime}")
                except Exception as e:
                    logger.error(f"Error parsing end date '{end_date_str}': {e}")
                    return jsonify({"error": f"Invalid end_date format: {end_date_str}"}), 400

            # Add date range to query
            time_filter = {}
            if start_datetime:
                time_filter["$gte"] = start_datetime
            if end_datetime:
                time_filter["$lt"] = end_datetime

            if time_filter:
                query[filter_by] = time_filter

        # Get total count for pagination
        total_meals = mongo.db.meals_only.count_documents(query)

        # Execute the query with pagination
        meals = list(mongo.db.meals_only.find(query).sort("timestamp", -1).skip(skip).limit(limit))

        # Format results
        formatted_meals = []
        for meal in meals:
            formatted_meal = {
                "id": str(meal["_id"]),
                "timestamp": meal["timestamp"].isoformat(),
                "mealType": meal.get("mealType", "normal"),
                "foodItems": meal.get("foodItems", []),
                "nutrition": meal.get("nutrition", {}),
                "notes": meal.get("notes", "")
            }

            # Include related IDs if present
            if "meal_id" in meal:
                formatted_meal["meal_id"] = meal["meal_id"]

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
        logger.error(f"Error retrieving meals-only data: {str(e)}")
        return jsonify({"error": str(e)}), 500


@meal_insulin_bp.route('/api/meal/<meal_id>', methods=['DELETE'])
@token_required
def delete_meal(current_user, meal_id):
    """
    Delete a meal record and its related data (activities, blood sugar, insulin)
    """
    try:
        # Convert string ID to ObjectId
        try:
            meal_obj_id = ObjectId(meal_id)
        except:
            return jsonify({"error": "Invalid meal ID format"}), 400

        # Find the meal
        meal = mongo.db.meals.find_one({"_id": meal_obj_id})
        if not meal:
            return jsonify({"error": "Meal not found"}), 404

        # Check if the user owns this meal
        if meal.get('user_id') != str(current_user['_id']):
            if current_user.get('user_type') != 'doctor':  # Allow doctors to delete patient records
                return jsonify({"error": "Unauthorized - you do not have permission to delete this record"}), 403

        # Start tracking what we delete
        deletion_results = {"meal": None, "activities": 0, "blood_sugar": None, "medication_log": None}

        # 1. Delete associated activities first
        if 'activity_ids' in meal and meal['activity_ids']:
            # Convert activity IDs to ObjectIds
            activity_obj_ids = [ObjectId(aid) for aid in meal['activity_ids']]

            # Delete the activities
            activities_result = mongo.db.activities.delete_many({"_id": {"$in": activity_obj_ids}})
            deletion_results["activities"] = activities_result.deleted_count

        # 2. Delete blood sugar record if it exists
        if 'blood_sugar_id' in meal and meal['blood_sugar_id']:
            try:
                bs_result = mongo.db.blood_sugar.delete_one({"_id": ObjectId(meal['blood_sugar_id'])})
                deletion_results["blood_sugar"] = bs_result.deleted_count
            except Exception as e:
                logger.warning(f"Error deleting blood sugar record: {e}")

        # 3. Delete medication log if it exists
        if 'medication_log_id' in meal and meal['medication_log_id']:
            try:
                med_result = mongo.db.medication_logs.delete_one({"_id": ObjectId(meal['medication_log_id'])})
                deletion_results["medication_log"] = med_result.deleted_count
            except Exception as e:
                logger.warning(f"Error deleting medication log: {e}")

        # 4. Delete meals_only record if it exists
        if 'meals_only_id' in meal and meal['meals_only_id']:
            try:
                mongo.db.meals_only.delete_one({"_id": ObjectId(meal['meals_only_id'])})
            except Exception as e:
                logger.warning(f"Error deleting meals_only record: {e}")

        # 5. Finally delete the meal record itself
        meal_result = mongo.db.meals.delete_one({"_id": meal_obj_id})
        deletion_results["meal"] = meal_result.deleted_count

        logger.info(f"Deleted meal {meal_id} and related records: {deletion_results}")

        return jsonify({
            "message": "Record deleted successfully",
            "deleted": deletion_results
        }), 200

    except Exception as e:
        logger.error(f"Error deleting meal: {str(e)}")
        return jsonify({"error": f"Failed to delete record: {str(e)}"}), 500


