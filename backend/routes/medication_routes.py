from flask import Blueprint, request, jsonify
from datetime import datetime, time, timedelta
from bson.objectid import ObjectId
from utils.auth import token_required
from utils.error_handler import api_error_handler
from config import mongo
import logging

logger = logging.getLogger(__name__)
medication_routes = Blueprint('medication_routes', __name__)

# Helper function to validate time format
def validate_time_format(time_str):
    try:
        datetime.strptime(time_str, '%H:%M')
        return True
    except ValueError:
        return False

def format_schedule(schedule):
    """Helper function to format schedule for JSON response"""
    return {
        'id': str(schedule['_id']),
        'medication': schedule['medication'],
        'startDate': schedule['startDate'].isoformat(),
        'endDate': schedule['endDate'].isoformat(),
        'dailyTimes': schedule['dailyTimes'],
        'created_at': schedule['created_at'].isoformat(),
        'updated_at': schedule.get('updated_at', '').isoformat() if schedule.get('updated_at') else None
    }



@medication_routes.route('/api/medication-schedule/<patient_id>/<medication>', methods=['GET'])
@token_required
@api_error_handler
def get_medication_schedule(current_user, patient_id, medication):
    if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        schedule = mongo.db.medication_schedules.find_one({
            'patient_id': patient_id,
            'medication': medication,
            'endDate': {'$gte': datetime.utcnow()}
        })

        if not schedule:
            return jsonify({'message': 'No active schedule found', 'schedule': None}), 200

        return jsonify({'schedule': format_schedule(schedule)}), 200
    except Exception as e:
        logger.error(f"Error fetching medication schedule: {str(e)}")
        return jsonify({'message': 'Error fetching medication schedule'}), 500


@medication_routes.route('/api/medication-schedule/<patient_id>', methods=['POST'])
@token_required
@api_error_handler
def create_or_update_schedule(current_user, patient_id):
    try:
        logger.info(f"Received schedule update request for patient {patient_id}")
        logger.debug(f"Request data: {request.json}")

        data = request.json
        if not data:
            logger.error("No data provided in request")
            return jsonify({'message': 'No data provided'}), 400

        # Modified permission check to allow both doctors and the patient themselves
        if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
            logger.error(f"Unauthorized access attempt by user {current_user['_id']}")
            return jsonify({'message': 'Unauthorized access'}), 403

        medication = data.get('medication')
        schedule_data = data.get('schedule')


        # Validate required fields
        if not all([medication, schedule_data, schedule_data.get('startDate'),
                    schedule_data.get('endDate'), schedule_data.get('dailyTimes')]):
            return jsonify({'message': 'Missing required fields'}), 400

        try:
            start_date = datetime.fromisoformat(schedule_data['startDate'].replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(schedule_data['endDate'].replace('Z', '+00:00'))

            if end_date < start_date:
                return jsonify({'message': 'End date must be after start date'}), 400

        except ValueError as e:
            logger.error(f"Date validation error: {str(e)}")
            return jsonify({'message': 'Invalid date format'}), 400

        # Validate times format
        daily_times = schedule_data['dailyTimes']
        if not all(isinstance(t, str) and len(t.split(':')) == 2 for t in daily_times):
            return jsonify({'message': 'Invalid time format'}), 400

        # Sort daily times
        daily_times.sort()

        # Create schedule document
        schedule = {
            'patient_id': patient_id,
            'medication': medication,
            'startDate': start_date,
            'endDate': end_date,
            'dailyTimes': daily_times,
            'updated_at': datetime.utcnow(),
            'updated_by': str(current_user['_id'])
        }

        # Update in medication_schedules collection
        result = mongo.db.medication_schedules.update_one(
            {
                'patient_id': patient_id,
                'medication': medication,
                'endDate': {'$gte': datetime.utcnow()}
            },
            {
                '$set': schedule,
                '$setOnInsert': {
                    'created_at': datetime.utcnow(),
                    'created_by': str(current_user['_id'])
                }
            },
            upsert=True
        )

        # Update in user's document
        user_update_result = mongo.db.users.update_one(
            {'_id': ObjectId(patient_id)},
            {
                '$set': {
                    f'medication_schedules.{medication}': {
                        'id': str(result.upserted_id) if result.upserted_id else None,
                        'startDate': start_date,
                        'endDate': end_date,
                        'dailyTimes': daily_times,
                        'updated_at': datetime.utcnow()
                    }
                }
            }
        )

        if result.upserted_id:
            # Create initial medication logs for new schedule
            create_initial_medication_logs(patient_id, medication, schedule)

        # Get the updated/created schedule
        updated_schedule = mongo.db.medication_schedules.find_one({
            'patient_id': patient_id,
            'medication': medication,
            'endDate': {'$gte': datetime.utcnow()}
        })

        if not updated_schedule:
            logger.error("Failed to retrieve updated schedule")
            return jsonify({'message': 'Error retrieving updated schedule'}), 500

        # Format response
        response_data = {
            'message': 'Medication schedule updated successfully',
            'schedule': format_schedule(updated_schedule)
        }

        # Log success
        logger.info(f"Successfully updated medication schedule for patient {patient_id}, medication {medication}")

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Error updating medication schedule: {str(e)}", exc_info=True)
        return jsonify({'message': f'Error updating medication schedule: {str(e)}'}), 500


def create_initial_medication_logs(patient_id, medication, schedule):
    """Create initial medication logs for the next occurrence of each daily time."""
    try:
        current_date = datetime.utcnow().date()
        current_datetime = datetime.utcnow()

        for daily_time in schedule['dailyTimes']:
            try:
                # Parse the time string
                time_parts = daily_time.split(':')
                hour = int(time_parts[0])
                minute = int(time_parts[1])

                # Create datetime for the scheduled time
                time_obj = datetime.strptime(daily_time, '%H:%M').time()
                next_dose_datetime = datetime.combine(current_date, time_obj)

                # If the time has passed today, schedule for tomorrow
                if next_dose_datetime < current_datetime:
                    next_dose_datetime += timedelta(days=1)

                # Create the medication log
                mongo.db.medication_logs.insert_one({
                    'patient_id': patient_id,
                    'medication': medication,
                    'scheduled_time': next_dose_datetime,
                    'taken_at': None,
                    'status': 'scheduled',
                    'created_at': current_datetime
                })

            except ValueError as e:
                logger.error(f"Error processing time {daily_time}: {str(e)}")
                continue

    except Exception as e:
        logger.error(f"Error creating initial medication logs: {str(e)}")
        raise


def format_schedule(schedule):
    """Helper function to format schedule for JSON response"""
    try:
        return {
            'id': str(schedule['_id']),
            'medication': schedule['medication'],
            'startDate': schedule['startDate'].isoformat(),
            'endDate': schedule['endDate'].isoformat(),
            'dailyTimes': schedule['dailyTimes'],
            'created_at': schedule['created_at'].isoformat(),
            'updated_at': schedule.get('updated_at', '').isoformat() if schedule.get('updated_at') else None
        }
    except Exception as e:
        logger.error(f"Error formatting schedule: {str(e)}")
        return None

@medication_routes.route('/api/my-medication-schedule', methods=['GET'])
@token_required
@api_error_handler
def get_my_schedules(current_user):
    try:
        # Find all active schedules for the current user
        schedules = list(mongo.db.medication_schedules.find({
            'patient_id': str(current_user['_id']),
            'endDate': {'$gte': datetime.utcnow()}
        }))

        formatted_schedules = [format_schedule(schedule) for schedule in schedules]
        return jsonify({'schedules': formatted_schedules}), 200

    except Exception as e:
        logger.error(f"Error fetching medication schedules: {str(e)}")
        return jsonify({'message': 'Error fetching medication schedules'}), 500

@medication_routes.route('/api/medication-schedule/<patient_id>/<schedule_id>', methods=['DELETE'])
@token_required
@api_error_handler
def delete_medication_schedule(current_user, patient_id, schedule_id):
    if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        # Find the schedule first
        schedule = mongo.db.medication_schedules.find_one({
            '_id': ObjectId(schedule_id),
            'patient_id': patient_id
        })

        if not schedule:
            return jsonify({'message': 'Schedule not found'}), 404

        # Delete the schedule
        mongo.db.medication_schedules.delete_one({
            '_id': ObjectId(schedule_id),
            'patient_id': patient_id
        })

        # Delete associated future logs
        mongo.db.medication_logs.delete_many({
            'patient_id': patient_id,
            'medication': schedule['medication'],
            'scheduled_time': {'$gte': datetime.utcnow()},
            'status': 'scheduled'
        })

        return jsonify({
            'message': 'Medication schedule deleted successfully',
            'deleted_schedule_id': schedule_id
        }), 200
    except Exception as e:
        logger.error(f"Error deleting medication schedule: {str(e)}")
        return jsonify({'message': f'Error deleting medication schedule: {str(e)}'}), 500


@medication_routes.route('/api/medication-log/<patient_id>', methods=['POST'])
@token_required
@api_error_handler
def log_medication_dose(current_user, patient_id):
    try:
        # Check authorization
        if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
            return jsonify({'message': 'Unauthorized access'}), 403

        data = request.json
        if not data:
            return jsonify({'message': 'No data provided'}), 400

        # Validate required fields
        required_fields = ['medication', 'dose', 'scheduled_time']
        if not all(field in data for field in required_fields):
            return jsonify({"error": "Missing required fields"}), 400

        try:
            scheduled_time = datetime.fromisoformat(data['scheduled_time'].replace('Z', '+00:00'))
        except ValueError as e:
            return jsonify({"error": "Invalid date format"}), 400

        # Create medication log document
        log_doc = {
            'patient_id': patient_id,
            'medication': data['medication'],
            'dose': float(data['dose']),
            'scheduled_time': scheduled_time,
            'taken_at': datetime.utcnow(),
            'status': 'taken',
            'created_at': datetime.utcnow(),
            'created_by': str(current_user['_id']),
            'notes': data.get('notes', ''),
            'is_insulin': data.get('is_insulin', False)
        }

        # Insert into medication_logs collection
        result = mongo.db.medication_logs.insert_one(log_doc)

        # If it's insulin, also record in meals collection
        if data.get('is_insulin', False):
            meal_doc = {
                'user_id': patient_id,
                'timestamp': scheduled_time,
                'mealType': 'insulin_only',
                'foodItems': [],
                'activities': [],
                'nutrition': {
                    'calories': 0,
                    'carbs': 0,
                    'protein': 0,
                    'fat': 0,
                    'absorption_factor': 1.0
                },
                'intendedInsulin': float(data['dose']),
                'intendedInsulinType': data['medication'],
                'notes': data.get('notes', ''),
                'medication_log_id': str(result.inserted_id)
            }
            mongo.db.meals.insert_one(meal_doc)

        return jsonify({
            "message": "Medication dose logged successfully",
            "id": str(result.inserted_id)
        }), 201

    except Exception as e:
        logger.error(f"Error logging medication dose: {str(e)}")
        return jsonify({"error": str(e)}), 500


@medication_routes.route('/api/medication-logs/recent', methods=['GET'])
@token_required
@api_error_handler
def get_recent_medication_logs(current_user):
    try:
        medication_type = request.args.get('medication_type')
        medication = request.args.get('medication')
        limit = int(request.args.get('limit', 10))
        days = int(request.args.get('days', 7))  # Default to last 7 days

        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Build query
        query = {
            'patient_id': str(current_user['_id']),
            'taken_at': {'$gte': start_date, '$lte': end_date}
        }

        if medication_type == 'insulin':
            query['is_insulin'] = True
        if medication:
            query['medication'] = medication

        # Get recent logs
        logs = list(mongo.db.medication_logs.find(
            query,
            {
                'medication': 1,
                'dose': 1,
                'scheduled_time': 1,
                'taken_at': 1,
                'notes': 1,
                'is_insulin': 1,
                'meal_id': 1,
                'meal_type': 1,
                'blood_sugar': 1,
                'suggested_dose': 1
            }
        ).sort('taken_at', -1).limit(limit))

        # Format logs
        formatted_logs = []
        for log in logs:
            formatted_log = {
                'medication': log['medication'],
                'dose': log['dose'],
                'scheduled_time': log['scheduled_time'].isoformat(),
                'taken_at': log['taken_at'].isoformat(),
                'notes': log.get('notes', ''),
                'is_insulin': log.get('is_insulin', False)
            }

            # Add insulin-specific fields if present
            if log.get('is_insulin'):
                formatted_log.update({
                    'meal_id': str(log.get('meal_id')) if log.get('meal_id') else None,
                    'meal_type': log.get('meal_type'),
                    'blood_sugar': log.get('blood_sugar'),
                    'suggested_dose': log.get('suggested_dose')
                })

            formatted_logs.append(formatted_log)

        return jsonify({
            "logs": formatted_logs,
            "pagination": {
                "total": len(formatted_logs),
                "limit": limit
            }
        }), 200

    except Exception as e:
        logger.error(f"Error fetching recent medication logs: {str(e)}")
        return jsonify({"error": str(e)}), 500


@medication_routes.route('/api/medication-schedule/<patient_id>', methods=['GET'])
@token_required
@api_error_handler
def get_patient_schedules(current_user, patient_id):
    if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        # Find all active schedules for the patient
        schedules = list(mongo.db.medication_schedules.find({
            'patient_id': patient_id,
            'endDate': {'$gte': datetime.utcnow()}
        }))

        # Format schedules and add insulin-specific information
        formatted_schedules = []
        for schedule in schedules:
            formatted_schedule = format_schedule(schedule)

            # Add insulin-specific information if it's an insulin schedule
            if schedule.get('is_insulin'):
                # Get recent insulin doses
                recent_doses = list(mongo.db.medication_logs.find({
                    'patient_id': patient_id,
                    'medication': schedule['medication'],
                    'is_insulin': True,
                    'taken_at': {'$gte': datetime.utcnow() - timedelta(days=7)}
                }).sort('taken_at', -1).limit(5))

                formatted_schedule['recent_doses'] = [{
                    'dose': dose['dose'],
                    'taken_at': dose['taken_at'].isoformat(),
                    'meal_type': dose.get('meal_type'),
                    'blood_sugar': dose.get('blood_sugar')
                } for dose in recent_doses]

            formatted_schedules.append(formatted_schedule)

        return jsonify({'schedules': formatted_schedules}), 200

    except Exception as e:
        logger.error(f"Error fetching medication schedules: {str(e)}")
        return jsonify({'message': 'Error fetching medication schedules'}), 500


# ... (keep other existing routes and functions) ...

@medication_routes.route('/api/insulin-schedule/summary', methods=['GET'])
@token_required
@api_error_handler
def get_insulin_schedule_summary(current_user):
    try:
        # Get date range parameters
        days = int(request.args.get('days', 7))
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)

        # Get all insulin doses in the date range
        doses = list(mongo.db.medication_logs.find({
            'patient_id': str(current_user['_id']),
            'is_insulin': True,
            'taken_at': {'$gte': start_date, '$lte': end_date}
        }).sort('taken_at', 1))

        # Organize doses by medication type and time
        summary = {}
        for dose in doses:
            med_type = dose['medication']
            if med_type not in summary:
                summary[med_type] = {
                    'total_doses': 0,
                    'avg_dose': 0,
                    'dose_times': {},
                    'meal_types': {}
                }

            time_str = dose['taken_at'].strftime('%H:%M')
            meal_type = dose.get('meal_type', 'other')

            # Update summary statistics
            summary[med_type]['total_doses'] += 1
            summary[med_type]['avg_dose'] = (
                    (summary[med_type]['avg_dose'] * (summary[med_type]['total_doses'] - 1) +
                     dose['dose']) / summary[med_type]['total_doses']
            )

            # Update time distribution
            if time_str not in summary[med_type]['dose_times']:
                summary[med_type]['dose_times'][time_str] = 0
            summary[med_type]['dose_times'][time_str] += 1

            # Update meal type distribution
            if meal_type not in summary[med_type]['meal_types']:
                summary[med_type]['meal_types'][meal_type] = 0
            summary[med_type]['meal_types'][meal_type] += 1

        return jsonify({
            'summary': summary,
            'date_range': {
                'start': start_date.isoformat(),
                'end': end_date.isoformat()
            }
        }), 200

    except Exception as e:
        logger.error(f"Error generating insulin schedule summary: {str(e)}")
        return jsonify({"error": str(e)}), 500