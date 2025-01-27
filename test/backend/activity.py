from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from datetime import datetime
from config import mongo
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
import logging

logger = logging.getLogger(__name__)
activity_bp = Blueprint('activity', __name__)


def validate_activity_level(level):
    """Validate activity level against Constants"""
    valid_levels = [level['value'] for level in Constants.ACTIVITY_LEVELS]
    if level not in valid_levels:
        return False, f"Invalid activity level. Must be one of {valid_levels}"
    return True, None


def get_activity_impact(level):
    """Get activity impact coefficient from Constants"""
    for activity in Constants.ACTIVITY_LEVELS:
        if activity['value'] == level:
            return activity['impact']
    return 0


def parse_duration(duration):
    if isinstance(duration, str):
        hours, minutes = map(int, duration.split(':'))
        return hours + minutes / 60
    elif isinstance(duration, (int, float)):
        return duration
    else:
        raise ValueError("Invalid duration format")


def format_duration(duration):
    hours = int(duration)
    minutes = int((duration - hours) * 60)
    return f"{hours:02d}:{minutes:02d}"


@activity_bp.route('/api/record-activities', methods=['POST'])
@token_required
def record_activities(current_user):
    data = request.json
    expected_activities = data.get('expectedActivities', [])
    completed_activities = data.get('completedActivities', [])

    user_id = str(current_user['_id'])
    timestamp = datetime.utcnow()

    # Initialize Constants for this user
    user_constants = Constants(user_id)
    activities = mongo.db.activities

    def process_activity(activity, activity_type):
        # Validate activity level
        is_valid, error_message = validate_activity_level(activity['level'])
        if not is_valid:
            raise ValueError(error_message)

        activity_record = {
            'user_id': user_id,
            'timestamp': timestamp,
            'type': activity_type,
            'level': activity['level'],
            'impact': get_activity_impact(activity['level']),
            'duration': format_duration(parse_duration(activity['duration']))
        }

        if activity_type == 'expected':
            activity_record['expectedTime'] = datetime.fromisoformat(activity['expectedTime'])
        else:
            activity_record['completedTime'] = datetime.fromisoformat(activity['completedTime'])

        return activity_record

    try:
        # Process expected activities
        for activity in expected_activities:
            record = process_activity(activity, 'expected')
            activities.insert_one(record)

        # Process completed activities
        for activity in completed_activities:
            record = process_activity(activity, 'completed')
            activities.insert_one(record)

        return jsonify({"message": "Activities recorded successfully"}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Error recording activities: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@activity_bp.route('/api/activity-history', methods=['GET'])
@token_required
def get_activity_history(current_user):
    try:
        user_id = str(current_user['_id'])
        user_activities = list(mongo.db.activities.find({"user_id": user_id}).sort("timestamp", -1))

        # Initialize Constants for activity level labels
        activity_level_map = {level['value']: level['label'] for level in Constants.ACTIVITY_LEVELS}

        def format_time(time_value):
            if isinstance(time_value, str):
                return time_value
            elif isinstance(time_value, datetime):
                return time_value.isoformat()
            else:
                return None

        formatted_activities = [{
            "id": str(activity['_id']),
            "type": activity['type'],
            "level": activity['level'],
            "levelLabel": activity_level_map.get(activity['level'], "Unknown"),
            "impact": activity.get('impact', get_activity_impact(activity['level'])),
            "duration": activity['duration'],
            "expectedTime": format_time(activity.get('expectedTime')),
            "completedTime": format_time(activity.get('completedTime')),
            "timestamp": activity['timestamp'].isoformat()
        } for activity in user_activities]

        return jsonify(formatted_activities), 200
    except Exception as e:
        logger.error(f"Error fetching activity history: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@activity_bp.route('/api/patient/<patient_id>/activity-history', methods=['GET'])
@token_required
def get_patient_activity_history(current_user, patient_id):
    if current_user['user_type'] != 'doctor':
        return jsonify({"error": "Unauthorized access"}), 403

    try:
        patient_activities = list(mongo.db.activities.find({"user_id": patient_id}).sort("timestamp", -1))
        activity_level_map = {level['value']: level['label'] for level in Constants.ACTIVITY_LEVELS}

        def format_time(time_value):
            if isinstance(time_value, str):
                return time_value
            elif isinstance(time_value, datetime):
                return time_value.isoformat()
            else:
                return None

        formatted_activities = [{
            "id": str(activity['_id']),
            "type": activity['type'],
            "level": activity['level'],
            "levelLabel": activity_level_map.get(activity['level'], "Unknown"),
            "impact": activity.get('impact', get_activity_impact(activity['level'])),
            "duration": activity['duration'],
            "expectedTime": format_time(activity.get('expectedTime')),
            "completedTime": format_time(activity.get('completedTime')),
            "timestamp": activity['timestamp'].isoformat()
        } for activity in patient_activities]

        return jsonify(formatted_activities), 200
    except Exception as e:
        logger.error(f"Error fetching patient activity history: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500