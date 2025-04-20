from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from datetime import datetime, timedelta  # Make sure timedelta is imported
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
    try:
        if isinstance(duration, str):
            hours, minutes = map(int, duration.split(':'))
            return hours + minutes / 60
        elif isinstance(duration, (int, float)):
            return duration
        else:
            return 1.0  # Default to 1 hour
    except Exception as e:
        logger.warning(f"Error parsing duration {duration}: {e}")
        return 1.0  # Default to 1 hour


def format_duration(duration):
    try:
        hours = int(duration)
        minutes = int((duration - hours) * 60)
        return f"{hours:02d}:{minutes:02d}"
    except Exception as e:
        logger.warning(f"Error formatting duration {duration}: {e}")
        return "01:00"  # Default to 1 hour


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
    activities_collection = mongo.db.activities

    def process_activity(activity, activity_type):
        try:
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
            }

            # Ensure startTime and endTime are included
            if 'startTime' in activity:
                activity_record['startTime'] = activity['startTime']
            if 'endTime' in activity:
                activity_record['endTime'] = activity['endTime']

            # Handle duration formats
            if 'duration' in activity:
                activity_record['duration'] = activity['duration']
            elif 'startTime' in activity and 'endTime' in activity:
                # Calculate and add duration if possible
                try:
                    activity_record['duration'] = format_duration(
                        parse_duration(activity.get('duration', '01:00'))
                    )
                except Exception as e:
                    logger.warning(f"Failed to format duration: {e}")
                    activity_record['duration'] = '01:00'
            else:
                # Default duration if no format provided
                activity_record['duration'] = '01:00'

            # Handle time fields based on activity type
            if activity_type == 'expected':
                expected_time = activity.get('expectedTime', activity.get('startTime'))
                if expected_time:
                    activity_record['expectedTime'] = expected_time
            else:
                completed_time = activity.get('completedTime', activity.get('startTime'))
                if completed_time:
                    activity_record['completedTime'] = completed_time

            # Add notes field if present
            if 'notes' in activity:
                activity_record['notes'] = activity['notes']

            return activity_record
        except Exception as e:
            logger.error(f"Error processing activity: {str(e)}")
            raise

    try:
        # Process expected activities
        expected_ids = []
        for activity in expected_activities:
            record = process_activity(activity, 'expected')
            result = activities_collection.insert_one(record)
            expected_ids.append(str(result.inserted_id))

        # Process completed activities
        completed_ids = []
        for activity in completed_activities:
            record = process_activity(activity, 'completed')
            result = activities_collection.insert_one(record)
            completed_ids.append(str(result.inserted_id))

        # Combine all activity IDs
        all_activity_ids = expected_ids + completed_ids

        return jsonify({
            "message": "Activities recorded successfully",
            "expected_activity_ids": expected_ids,
            "completed_activity_ids": completed_ids,
            "activity_ids": all_activity_ids  # Add this to return all IDs
        }), 201
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
        logger.info(f"Fetching activity history for user {user_id}")

        # Parse query parameters for date filtering
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        logger.debug(f"Date range: {start_date_str} to {end_date_str}")

        # Build the query
        query = {"user_id": user_id}

        # Add date range if provided
        if start_date_str or end_date_str:
            query['timestamp'] = {}
            if start_date_str:
                try:
                    start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
                    query['timestamp']['$gte'] = start_date
                    logger.debug(f"Start date: {start_date}")
                except Exception as e:
                    logger.error(f"Error parsing start date '{start_date_str}': {e}")
                    return jsonify({"error": f"Invalid start date format: {start_date_str}"}), 400

            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
                    # Add one day to include the entire end date
                    end_date = end_date + timedelta(days=1)
                    query['timestamp']['$lt'] = end_date
                    logger.debug(f"End date: {end_date}")
                except Exception as e:
                    logger.error(f"Error parsing end date '{end_date_str}': {e}")
                    return jsonify({"error": f"Invalid end date format: {end_date_str}"}), 400

        logger.debug(f"Final query: {query}")

        # Execute the query
        user_activities = list(mongo.db.activities.find(query).sort("timestamp", -1))
        logger.debug(f"Found {len(user_activities)} activities")

        # Initialize Constants for activity level labels
        activity_level_map = {level['value']: level['label'] for level in Constants.ACTIVITY_LEVELS}

        def format_time(time_value):
            try:
                if isinstance(time_value, str):
                    return time_value
                elif isinstance(time_value, datetime):
                    return time_value.isoformat()
                else:
                    return None
            except Exception as e:
                logger.warning(f"Error formatting time value: {time_value}, {e}")
                return None

        formatted_activities = []
        for activity in user_activities:
            try:
                formatted_activity = {
                    "id": str(activity['_id']),
                    "type": activity.get('type', 'unknown'),
                    "level": activity.get('level', 0),
                    "levelLabel": activity_level_map.get(activity.get('level', 0), "Unknown"),
                    "impact": activity.get('impact', get_activity_impact(activity.get('level', 0))),
                    "duration": activity.get('duration', '01:00'),
                    "timestamp": format_time(activity.get('timestamp', datetime.utcnow())),
                }

                # Add optional fields if present
                if 'startTime' in activity:
                    formatted_activity["startTime"] = format_time(activity['startTime'])
                if 'endTime' in activity:
                    formatted_activity["endTime"] = format_time(activity['endTime'])
                if 'expectedTime' in activity:
                    formatted_activity["expectedTime"] = format_time(activity['expectedTime'])
                if 'completedTime' in activity:
                    formatted_activity["completedTime"] = format_time(activity['completedTime'])
                if 'meal_id' in activity:
                    formatted_activity["meal_id"] = activity['meal_id']
                if 'notes' in activity:
                    formatted_activity["notes"] = activity['notes']

                formatted_activities.append(formatted_activity)
            except Exception as e:
                logger.error(f"Error formatting activity {activity.get('_id', 'unknown')}: {e}")
                # Continue processing other activities even if one fails

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
        logger.info(f"Doctor {str(current_user['_id'])} fetching activity history for patient {patient_id}")

        # Parse query parameters for date filtering
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        # Build the query
        query = {"user_id": patient_id}

        # Add date range if provided
        if start_date_str or end_date_str:
            query['timestamp'] = {}
            if start_date_str:
                try:
                    start_date = datetime.strptime(start_date_str, '%Y-%m-%d')
                    query['timestamp']['$gte'] = start_date
                except Exception as e:
                    logger.error(f"Error parsing start date '{start_date_str}': {e}")
                    return jsonify({"error": f"Invalid start date format: {start_date_str}"}), 400

            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d')
                    # Add one day to include the entire end date
                    end_date = end_date + timedelta(days=1)
                    query['timestamp']['$lt'] = end_date
                except Exception as e:
                    logger.error(f"Error parsing end date '{end_date_str}': {e}")
                    return jsonify({"error": f"Invalid end date format: {end_date_str}"}), 400

        # Execute the query
        patient_activities = list(mongo.db.activities.find(query).sort("timestamp", -1))
        logger.debug(f"Found {len(patient_activities)} activities for patient {patient_id}")

        activity_level_map = {level['value']: level['label'] for level in Constants.ACTIVITY_LEVELS}

        def format_time(time_value):
            try:
                if isinstance(time_value, str):
                    return time_value
                elif isinstance(time_value, datetime):
                    return time_value.isoformat()
                else:
                    return None
            except Exception as e:
                logger.warning(f"Error formatting time value: {time_value}, {e}")
                return None

        formatted_activities = []
        for activity in patient_activities:
            try:
                formatted_activity = {
                    "id": str(activity['_id']),
                    "type": activity.get('type', 'unknown'),
                    "level": activity.get('level', 0),
                    "levelLabel": activity_level_map.get(activity.get('level', 0), "Unknown"),
                    "impact": activity.get('impact', get_activity_impact(activity.get('level', 0))),
                    "duration": activity.get('duration', '01:00'),
                    "timestamp": format_time(activity.get('timestamp', datetime.utcnow())),
                }

                # Add optional fields if present
                if 'startTime' in activity:
                    formatted_activity["startTime"] = format_time(activity['startTime'])
                if 'endTime' in activity:
                    formatted_activity["endTime"] = format_time(activity['endTime'])
                if 'expectedTime' in activity:
                    formatted_activity["expectedTime"] = format_time(activity['expectedTime'])
                if 'completedTime' in activity:
                    formatted_activity["completedTime"] = format_time(activity['completedTime'])
                if 'meal_id' in activity:
                    formatted_activity["meal_id"] = activity['meal_id']
                if 'notes' in activity:
                    formatted_activity["notes"] = activity.get('notes', '')

                formatted_activities.append(formatted_activity)
            except Exception as e:
                logger.error(f"Error formatting patient activity {activity.get('_id', 'unknown')}: {e}")

        return jsonify(formatted_activities), 200
    except Exception as e:
        logger.error(f"Error fetching patient activity history: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500