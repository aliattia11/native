from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from datetime import datetime, timedelta
import pymongo
from utils.auth import token_required
from utils.error_handler import api_error_handler
from config import mongo
import logging

logger = logging.getLogger(__name__)
insulin_routes = Blueprint('insulin_routes', __name__)


@insulin_routes.route('/api/insulin-data', methods=['GET'])
@token_required
@api_error_handler
def get_insulin_data(current_user):
    """
    Endpoint to retrieve insulin data for visualization.

    Query Parameters:
    - days: Number of days to look back (default 30)
    - end_date: End date for the query (default today)
    - patient_id: If doctor is viewing patient data (optional)
    """
    try:
        # Parse query parameters
        days = int(request.args.get('days', 30))
        end_date_str = request.args.get('end_date', datetime.now().strftime('%Y-%m-%d'))
        patient_id = request.args.get('patient_id')

        # Parse end_date to datetime object
        try:
            if 'T' in end_date_str:  # Check if time component is included
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            else:
                end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
                # Set to end of day
                end_date = end_date.replace(hour=23, minute=59, second=59)
        except ValueError:
            # Fallback to current date if parsing fails
            logger.warning(f"Invalid date format: {end_date_str}, using current date")
            end_date = datetime.now()

        # Calculate start date
        start_date = end_date - timedelta(days=days)

        # Determine which user's data to query
        target_user_id = patient_id if patient_id else str(current_user['_id'])

        # Check permissions if requesting patient data
        if patient_id and current_user.get('role') != 'doctor':
            return jsonify({'error': 'Unauthorized access to patient data'}), 403

        # Query medication logs for insulin
        insulin_logs = list(mongo.db.medication_logs.find({
            'patient_id': target_user_id,
            'is_insulin': True,
            'taken_at': {
                '$gte': start_date,
                '$lte': end_date
            }
        }).sort('taken_at', pymongo.DESCENDING))

        # Query medication events from meals collection for comprehensive insulin data
        meal_insulin = list(mongo.db.meals.find({
            'patient_id': target_user_id,
            'intended_insulin': {'$exists': True, '$ne': None},
            'timestamp': {
                '$gte': start_date,
                '$lte': end_date
            }
        }).sort('timestamp', pymongo.DESCENDING))

        # Combine and format insulin data
        combined_logs = []

        # Process standalone insulin logs
        for log in insulin_logs:
            insulin_log = {
                'id': str(log['_id']),
                'medication': log['medication'],
                'dose': log['dose'],
                'taken_at': log['taken_at'].isoformat() + 'Z' if isinstance(log['taken_at'], datetime) else log[
                    'taken_at'],
                'scheduled_time': log.get('scheduled_time', log['taken_at']).isoformat() + 'Z' if isinstance(
                    log.get('scheduled_time', log['taken_at']), datetime) else log.get('scheduled_time',
                                                                                       log['taken_at']),
                'notes': log.get('notes', ''),
                'status': log.get('status', 'completed'),
                'meal_type': log.get('meal_type', 'insulin_only'),
                'is_insulin': True,
                'blood_sugar': log.get('blood_sugar')
            }

            # Add insulin parameters
            try:
                # Get patient constants for insulin parameters
                patient_constants = mongo.db.patient_constants.find_one({'patient_id': target_user_id})
                if patient_constants and 'medication_factors' in patient_constants:
                    insulin_type = log['medication']
                    if insulin_type in patient_constants['medication_factors']:
                        insulin_log['pharmacokinetics'] = patient_constants['medication_factors'][insulin_type]
            except Exception as e:
                logger.warning(f"Error fetching insulin parameters: {str(e)}")

            combined_logs.append(insulin_log)

        # Process meal-related insulin
        for meal in meal_insulin:
            # Skip if there's no insulin data in this meal record
            if not meal.get('intended_insulin'):
                continue

            # Check if this is already in the logs to avoid duplication
            meal_id = str(meal['_id'])
            if any(log.get('meal_id') == meal_id for log in combined_logs):
                continue

            insulin_log = {
                'id': f"meal-{meal_id}",
                'meal_id': meal_id,
                'medication': meal.get('intended_insulin_type', 'rapid_acting'),
                'dose': meal['intended_insulin'],
                'taken_at': meal['timestamp'].isoformat() + 'Z' if isinstance(meal['timestamp'], datetime) else meal[
                    'timestamp'],
                'scheduled_time': meal['timestamp'].isoformat() + 'Z' if isinstance(meal['timestamp'], datetime) else
                meal['timestamp'],
                'notes': meal.get('notes', ''),
                'status': 'completed',
                'meal_type': meal.get('meal_type', 'other'),
                'is_insulin': True,
                'blood_sugar': meal.get('blood_sugar'),
                'suggested_dose': meal.get('suggested_insulin')
            }

            # Add food items summary if available
            if meal.get('food_items') and len(meal['food_items']) > 0:
                food_names = [item.get('name', 'Unknown food') for item in meal['food_items']]
                insulin_log['notes'] += f" Meal: {', '.join(food_names[:3])}"
                if len(food_names) > 3:
                    insulin_log['notes'] += f" and {len(food_names) - 3} more"

            combined_logs.append(insulin_log)

        # Sort again by taken_at timestamp to ensure chronological order
        combined_logs.sort(key=lambda x: x['taken_at'], reverse=True)

        return jsonify({
            'insulin_logs': combined_logs,
            'meta': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat(),
                'count': len(combined_logs)
            }
        })

    except Exception as e:
        logger.error(f"Error retrieving insulin data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@insulin_routes.route('/api/insulin-analytics', methods=['GET'])
@token_required
@api_error_handler
def get_insulin_analytics(current_user):
    """Get insulin analytics including timing patterns and effectiveness"""
    try:
        # Get query parameters
        days = int(request.args.get('days', 30))
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Check if we're getting data for a specific patient (doctor access)
        patient_id = request.args.get('patient_id')
        if patient_id and current_user.get('user_type') != 'doctor':
            return jsonify({'error': 'Unauthorized access'}), 403

        user_id = patient_id if patient_id else str(current_user['_id'])

        # Get insulin logs with blood sugar readings
        pipeline = [
            # Match insulin logs in date range
            {
                '$match': {
                    'patient_id': user_id,
                    'is_insulin': True,
                    'taken_at': {'$gte': start_date, '$lte': end_date}
                }
            },
            # Group by medication type
            {
                '$group': {
                    '_id': '$medication',
                    'total_doses': {'$sum': 1},
                    'avg_dose': {'$avg': '$dose'},
                    'doses': {'$push': {
                        'dose': '$dose',
                        'taken_at': '$taken_at',
                        'blood_sugar': '$blood_sugar',
                        'meal_type': '$meal_type',
                        'meal_id': '$meal_id'
                    }}
                }
            }
        ]

        insulin_analytics = list(mongo.db.medication_logs.aggregate(pipeline))

        # Enhance with meal timing analysis
        for insulin_type in insulin_analytics:
            medication = insulin_type['_id']
            doses = insulin_type['doses']

            meal_timing_analysis = {'before_meal': 0, 'with_meal': 0, 'after_meal': 0, 'unknown': 0}
            meal_types = {'breakfast': 0, 'lunch': 0, 'dinner': 0, 'snack': 0, 'other': 0}
            blood_sugar_changes = []

            for dose in doses:
                # Count meal types
                meal_type = dose.get('meal_type')
                if meal_type in meal_types:
                    meal_types[meal_type] += 1
                else:
                    meal_types['other'] += 1

                # If the dose has a meal ID, analyze timing
                if dose.get('meal_id'):
                    try:
                        meal = mongo.db.meals.find_one({'_id': ObjectId(dose['meal_id'])})
                        if meal:
                            # Determine timing: before, with, or after meal
                            meal_time = meal.get('timestamp')
                            dose_time = dose['taken_at']

                            if not meal_time or not dose_time:
                                meal_timing_analysis['unknown'] += 1
                            else:
                                diff_minutes = (dose_time - meal_time).total_seconds() / 60

                                if diff_minutes < -15:  # More than 15 min before meal
                                    meal_timing_analysis['before_meal'] += 1
                                elif diff_minutes > 15:  # More than 15 min after meal
                                    meal_timing_analysis['after_meal'] += 1
                                else:  # Within 15 min of meal
                                    meal_timing_analysis['with_meal'] += 1

                            # If there's a blood sugar reading in the meal, track the change
                            if meal.get('bloodSugar') and dose.get('blood_sugar'):
                                blood_sugar_changes.append({
                                    'before': dose['blood_sugar'],
                                    'after': meal['bloodSugar'],
                                    'change': meal['bloodSugar'] - dose['blood_sugar'],
                                    'meal_type': meal.get('mealType')
                                })
                    except Exception as e:
                        logger.error(f"Error analyzing meal timing: {str(e)}")
                else:
                    meal_timing_analysis['unknown'] += 1

            # Add analysis to the response
            insulin_type['meal_timing_analysis'] = meal_timing_analysis
            insulin_type['meal_types'] = meal_types
            insulin_type['blood_sugar_changes'] = blood_sugar_changes

        return jsonify({
            'insulin_analytics': insulin_analytics,
            'date_range': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            }
        })

    except Exception as e:
        logger.error(f"Error retrieving insulin analytics: {str(e)}")
        return jsonify({'error': str(e)}), 500