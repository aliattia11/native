from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from bson.objectid import ObjectId
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
    try:
        # Get query parameters
        days = int(request.args.get('days', 7))
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Check if we're getting data for a specific patient (doctor access)
        patient_id = request.args.get('patient_id')
        if patient_id and current_user.get('user_type') != 'doctor':
            return jsonify({'error': 'Unauthorized access'}), 403
            
        user_id = patient_id if patient_id else str(current_user['_id'])
        
        # Get insulin logs from medication_logs
        insulin_logs = list(mongo.db.medication_logs.find({
            'patient_id': user_id,
            'is_insulin': True,
            'taken_at': {'$gte': start_date, '$lte': end_date}
        }).sort('taken_at', 1))
        
        # Get blood sugar readings for the same period
        blood_sugar_readings = list(mongo.db.blood_sugar.find({
            'user_id': user_id,
            'timestamp': {'$gte': start_date, '$lte': end_date}
        }).sort('timestamp', 1))
        
        # Get medication factors for insulin types
        from constants import Constants
        constants = Constants(user_id)
        medication_factors = constants.get_constant('medication_factors')
        
        # Process insulin data with pharmacokinetic information
        processed_logs = []
        for log in insulin_logs:
            medication = log.get('medication')
            if not medication or medication not in medication_factors:
                continue
                
            med_factor = medication_factors[medication]
            
            # Create processed log object with pharmacokinetic data
            processed_log = {
                'id': str(log['_id']),
                'medication': medication,
                'dose': log['dose'],
                'taken_at': log['taken_at'].isoformat(),
                'scheduled_time': log['scheduled_time'].isoformat() if 'scheduled_time' in log else None,
                'pharmacokinetics': {
                    'onset_hours': med_factor.get('onset_hours', 0.5),
                    'peak_hours': med_factor.get('peak_hours', 2),
                    'duration_hours': med_factor.get('duration_hours', 5),
                    'type': med_factor.get('type', 'short_acting')
                },
                'notes': log.get('notes', ''),
                'meal_id': str(log['meal_id']) if 'meal_id' in log else None,
                'meal_type': log.get('meal_type'),
                'blood_sugar': log.get('blood_sugar'),
                'blood_sugar_timestamp': log.get('blood_sugar_timestamp')
            }
            
            # Add meal information if available
            if 'meal_id' in log and log['meal_id']:
                try:
                    meal = mongo.db.meals.find_one({'_id': log['meal_id']})
                    if meal:
                        processed_log['meal_nutrition'] = meal.get('nutrition', {})
                        processed_log['food_items'] = meal.get('foodItems', [])
                except Exception as e:
                    logger.error(f"Error fetching meal data: {str(e)}")
            
            processed_logs.append(processed_log)
        
        # Process blood sugar readings
        processed_readings = []
        for reading in blood_sugar_readings:
            processed_reading = {
                'id': str(reading['_id']),
                'blood_sugar': reading['bloodSugar'],
                'timestamp': reading['timestamp'].isoformat(),
                'blood_sugar_timestamp': reading.get('bloodSugarTimestamp', reading['timestamp'].isoformat()),
                'status': reading.get('status', 'unknown'),
                'notes': reading.get('notes', '')
            }
            processed_readings.append(processed_reading)
        
        return jsonify({
            'insulin_logs': processed_logs,
            'blood_sugar_readings': processed_readings,
            'date_range': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            },
            'insulin_types': list(set(log['medication'] for log in processed_logs))
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