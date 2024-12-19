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

@medication_routes.route('/api/medication-schedule/<patient_id>', methods=['GET'])
@token_required
@api_error_handler
def get_all_medication_schedules(current_user, patient_id):
    """Get all active medication schedules for a patient"""
    if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        schedules = list(mongo.db.medication_schedules.find({
            'patient_id': patient_id,
            'endDate': {'$gte': datetime.utcnow()}
        }))

        return jsonify({
            'schedules': [format_schedule(schedule) for schedule in schedules]
        }), 200
    except Exception as e:
        logger.error(f"Error fetching medication schedules: {str(e)}")
        return jsonify({'message': 'Error fetching medication schedules'}), 500

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
        # Log incoming request
        logger.info(f"Received schedule update request for patient {patient_id}")
        logger.debug(f"Request data: {request.json}")

        data = request.json
        if not data:
            logger.error("No data provided in request")
            return jsonify({'message': 'No data provided'}), 400

        # Validate user permissions
        if current_user.get('user_type') != 'doctor' and str(current_user['_id']) != patient_id:
            logger.error(f"Unauthorized access attempt by user {current_user['_id']}")
            return jsonify({'message': 'Unauthorized access'}), 403

        medication = data.get('medication')
        schedule_data = data.get('schedule')

        # Validate required fields
        if not all([medication, schedule_data, schedule_data.get('startDate'),
                   schedule_data.get('endDate'), schedule_data.get('dailyTimes')]):
            return jsonify({'message': 'Missing required fields'}), 400

        # Validate dates
        try:
            start_date = datetime.fromisoformat(schedule_data['startDate'])
            end_date = datetime.fromisoformat(schedule_data['endDate'])
            if end_date < start_date:
                return jsonify({'message': 'End date must be after start date'}), 400
        except ValueError as e:
            logger.error(f"Date validation error: {str(e)}")
            return jsonify({'message': 'Invalid date format'}), 400

        # Validate times
        daily_times = schedule_data['dailyTimes']
        if not all(validate_time_format(t) for t in daily_times):
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

        # Update existing or create new schedule
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

        if result.upserted_id:
            create_initial_medication_logs(patient_id, medication, schedule)

        # Get the updated/created schedule
        updated_schedule = mongo.db.medication_schedules.find_one({
            'patient_id': patient_id,
            'medication': medication,
            'endDate': {'$gte': datetime.utcnow()}
        })

        return jsonify({
            'message': 'Medication schedule updated successfully',
            'schedule': format_schedule(updated_schedule)
        }), 200

    except Exception as e:
        logger.error(f"Error updating medication schedule: {str(e)}", exc_info=True)
        return jsonify({'message': f'Error updating medication schedule: {str(e)}'}), 500

def create_initial_medication_logs(patient_id, medication, schedule):
    """Create initial medication logs for the next occurrence of each daily time."""
    try:
        current_date = datetime.utcnow().date()
        current_datetime = datetime.utcnow()

        for daily_time in schedule['dailyTimes']:
            time_obj = datetime.strptime(daily_time, '%H:%M').time()
            next_dose_datetime = datetime.combine(current_date, time_obj)

            # If the time has passed today, schedule for tomorrow
            if next_dose_datetime < current_datetime:
                next_dose_datetime += timedelta(days=1)

            mongo.db.medication_logs.insert_one({
                'patient_id': patient_id,
                'medication': medication,
                'scheduled_time': next_dose_datetime,
                'taken_at': None,
                'status': 'scheduled',
                'created_at': current_datetime
            })
    except Exception as e:
        logger.error(f"Error creating initial medication logs: {str(e)}")
        raise

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