from flask import Blueprint, request, jsonify, current_app
from bson.objectid import ObjectId
from datetime import datetime
import json  # Add this import
from flask_cors import cross_origin
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
from services.food_service import get_food_details
from config import mongo
from datetime import datetime, timedelta  # Add timedelta import
import logging  # Add this import

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

        # Base calculations
        carb_insulin = nutrition['carbs'] / patient_constants['insulin_to_carb_ratio']
        protein_contribution = (nutrition['protein'] * patient_constants['protein_factor']) / patient_constants[
            'insulin_to_carb_ratio']
        fat_contribution = (nutrition['fat'] * patient_constants['fat_factor']) / patient_constants[
            'insulin_to_carb_ratio']
        base_insulin = carb_insulin + protein_contribution + fat_contribution

        # Get adjustment factors from frontend if available
        if calculation_factors:
            try:
                absorption_factor = float(
                    calculation_factors.get('absorptionFactor', nutrition.get('absorption_factor', 1.0)))
                meal_timing_factor = float(calculation_factors.get('mealTimingFactor', 1.0))
                # Removed time_factor
                activity_coefficient = float(calculation_factors.get('activityImpact', 1.0))

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
            # Removed time_factor
            activity_coefficient = calculate_activity_impact(activities)
            health_multiplier = calculate_health_factors(user_id)

        # Calculate adjusted insulin (removed time_factor)
        adjusted_insulin = base_insulin * absorption_factor * meal_timing_factor * activity_coefficient

        # Calculate correction insulin if needed
        correction_insulin = 0
        if blood_glucose is not None:
            correction_insulin = (blood_glucose - patient_constants['target_glucose']) / patient_constants[
                'correction_factor']

        # Calculate final insulin using the health multiplier
        total_insulin = max(0, (adjusted_insulin + correction_insulin) * health_multiplier)

        result = {
            'total': round(total_insulin, 1),
            'breakdown': {
                'carb_insulin': round(carb_insulin, 2),
                'protein_contribution': round(protein_contribution, 2),
                'fat_contribution': round(fat_contribution, 2),
                'base_insulin': round(base_insulin, 2),
                'adjusted_insulin': round(adjusted_insulin, 2),
                'correction_insulin': round(correction_insulin, 2),
                'activity_coefficient': round(activity_coefficient, 2),
                'health_multiplier': round(health_multiplier, 2),
                'absorption_factor': absorption_factor,
                'meal_timing_factor': meal_timing_factor,
                # Removed time_factor from breakdown
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

        # Calculate nutrition
        nutrition = calculate_meal_nutrition(data['foodItems'])

        # Extract calculation factors from request
        calculation_factors = data.get('calculationFactors')

        logger.debug(f"""
        === Meal Submission Debug ===
        Received meal data:
        Food Items: {json.dumps(data['foodItems'], indent=2)}
        Activities: {json.dumps(data['activities'], indent=2)}
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
            data['activities'],
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

        # Prepare meal document
        meal_doc = {
            'user_id': str(current_user['_id']),
            'timestamp': current_time,  # When the record was created
            'mealType': data['mealType'],
            'foodItems': data['foodItems'],
            'nutrition': nutrition,
            'activities': [{
                'level': activity.get('level'),
                'duration': activity.get('duration'),
                'type': activity.get('type'),
                'impact': activity.get('impact'),
                'startTime': activity.get('startTime'),
                'endTime': activity.get('endTime')
            } for activity in data['activities']],
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
        logger.info(
            f"Meal document created with ID: {result.inserted_id}, including bloodSugarTimestamp: {blood_sugar_timestamp}")

        # Check if we should skip activity duplication
        should_skip_activity_duplication = data.get('skipActivityDuplication', False)

        # Also save activities to the dedicated activities collection
        # Only if not flagged to skip duplication
        if data.get('activities') and not should_skip_activity_duplication:
            activities_collection = mongo.db.activities

            for activity in data['activities']:
                # Create activity record in the format expected by the activities collection
                activity_record = {
                    'user_id': str(current_user['_id']),
                    'timestamp': current_time,
                    'type': activity.get('type', 'expected'),
                    'level': activity.get('level', 0),
                    'impact': activity.get('impact', 1.0),
                    'duration': activity.get('duration', '00:00'),
                    'meal_id': str(result.inserted_id)  # Reference to the meal record
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

                # Insert the activity into the activities collection
                try:
                    activity_result = activities_collection.insert_one(activity_record)
                    logger.info(f"Activity record created with ID: {activity_result.inserted_id}")
                except Exception as e:
                    logger.warning(f"Failed to save activity to activities collection: {e}")
        elif should_skip_activity_duplication and 'activityIds' in data:
            # Link the existing activities to this meal
            activities_collection = mongo.db.activities
            for activity_id in data['activityIds']:
                try:
                    activities_collection.update_one(
                        {'_id': ObjectId(activity_id)},
                        {'$set': {'meal_id': str(result.inserted_id)}}
                    )
                    logger.info(f"Linked existing activity {activity_id} to meal {result.inserted_id}")
                except Exception as e:
                    logger.warning(f"Failed to link existing activity {activity_id}: {e}")

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
                    'meal_id': str(result.inserted_id),  # Reference to the meal record
                    'mealType': data['mealType']  # Include meal type for context
                }

                # Insert into blood_sugar collection
                bs_result = mongo.db.blood_sugar.insert_one(blood_sugar_doc)
                blood_sugar_id = str(bs_result.inserted_id)

                logger.info(
                    f"Blood sugar record created with ID: {blood_sugar_id}, linked to meal ID: {result.inserted_id}")

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
            # Create medication log entry with consistent administration time
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
                'meal_id': str(result.inserted_id),
                'meal_type': data['mealType'],
                'blood_sugar': data.get('bloodSugar'),
                'blood_sugar_timestamp': blood_sugar_timestamp,
                'blood_sugar_id': blood_sugar_id,  # Add reference to blood sugar record if available
                'suggested_dose': insulin_calc['total']
            }

            # Insert medication log
            log_result = mongo.db.medication_logs.insert_one(medication_log)

            try:
                # Find existing schedule but DO NOT MODIFY the schedule times
                existing_schedule = mongo.db.medication_schedules.find_one({
                    'patient_id': str(current_user['_id']),
                    'medication': data['intendedInsulinType'],
                    'endDate': {'$gte': current_time}
                })

                if existing_schedule:
                    # Only update the last_used timestamp, not the dailyTimes
                    mongo.db.medication_schedules.update_one(
                        {'_id': existing_schedule['_id']},
                        {
                            '$set': {
                                'updated_at': current_time,
                                'last_used': administration_time
                            }
                        }
                    )
                    logger.info(f"Updated existing insulin schedule: {existing_schedule['_id']}")
                else:
                    # If no schedule exists, we'll create a record but NOT automatically
                    # create a schedule with the patient's administration time
                    # Create a medication record without dailyTimes
                    medication_record = {
                        'patient_id': str(current_user['_id']),
                        'medication': data['intendedInsulinType'],
                        'created_at': current_time,
                        'updated_at': current_time,
                        'last_used': administration_time,
                        'created_by': str(current_user['_id']),
                        'is_insulin': True,
                        'auto_generated': False,
                        'status': 'active',
                        'needs_schedule': True  # Flag for doctor to create a proper schedule
                    }

                    # Insert medication record
                    med_result = mongo.db.medications.insert_one(medication_record)
                    logger.info(f"Created new medication record: {med_result.inserted_id}")

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

            except Exception as e:
                logger.error(f"Error updating medication records: {str(e)}")
                # Continue with meal submission even if medication record updates fail

            logger.info(
                f"Successfully logged insulin dose: {medication_log['dose']} units of {medication_log['medication']} at {administration_time}")

        return jsonify({
            "message": "Meal logged successfully",
            "id": str(result.inserted_id),
            "blood_sugar_id": blood_sugar_id,  # Include the blood sugar ID if created
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