from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from datetime import datetime, timedelta  # Add timedelta to the import
from config import mongo
from utils.auth import token_required
from utils.error_handler import api_error_handler
from constants import Constants
import logging


logger = logging.getLogger(__name__)
blood_sugar_bp = Blueprint('blood_sugar', __name__)

def validate_blood_sugar_mgdl(value):
    """Validate blood sugar value in mg/dL"""
    if not isinstance(value, (int, float)):
        return False, "Invalid blood sugar value"
    if value < 0:
        return False, "Blood sugar cannot be negative"
    if value > 600:
        return False, "Blood sugar value seems too high"
    return True, None

def get_blood_sugar_status(blood_sugar, target_glucose):
    """Determine blood sugar status based on target glucose"""
    if blood_sugar < target_glucose * 0.7:  # Below 70% of target
        return "low"
    elif blood_sugar > target_glucose * 1.3:  # Above 130% of target
        return "high"
    return "normal"


# Modify the add_blood_sugar function in blood_sugar.py

@blood_sugar_bp.route('/api/blood-sugar', methods=['POST'])
@token_required
def add_blood_sugar(current_user):
    try:
        # Get user constants first to avoid issues
        user_constants = Constants(str(current_user['_id']))

        blood_sugar = request.json.get('bloodSugar')
        blood_sugar_timestamp = request.json.get('bloodSugarTimestamp')
        notes = request.json.get('notes', '')
        source = request.json.get('bloodSugarSource', 'standalone')

        if blood_sugar is None:
            return jsonify({'error': 'Blood sugar value is required'}), 400

        # Validate blood sugar value
        is_valid, error_message = validate_blood_sugar_mgdl(blood_sugar)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        target_glucose = user_constants.get_constant('target_glucose')
        status = get_blood_sugar_status(blood_sugar, target_glucose)

        # Current server time in UTC
        current_time = datetime.utcnow()

        # Use provided timestamp or default to current UTC time
        if not blood_sugar_timestamp:
            blood_sugar_timestamp = current_time.isoformat()

        # Parse the timestamp - the frontend should be sending UTC ISO strings
        try:
            # Remove 'Z' and add UTC timezone if missing
            if blood_sugar_timestamp.endswith('Z'):
                blood_sugar_timestamp = blood_sugar_timestamp[:-1] + '+00:00'
            elif not ('+' in blood_sugar_timestamp or '-' in blood_sugar_timestamp[-6:]):
                blood_sugar_timestamp = blood_sugar_timestamp + '+00:00'

            # Store the timestamp as is - it's already in ISO format from frontend
        except Exception as e:
            logger.error(f"Error parsing blood sugar timestamp: {e}")
            blood_sugar_timestamp = current_time.isoformat()

        logger.info(f"Recording blood sugar: {blood_sugar} mg/dL, timestamp: {blood_sugar_timestamp}")

        # Create new reading
        new_reading = {
            'user_id': str(current_user['_id']),
            'bloodSugar': blood_sugar,
            'status': status,
            'target': target_glucose,
            'timestamp': current_time,  # When the reading was recorded (server UTC time)
            'bloodSugarTimestamp': blood_sugar_timestamp,  # When the reading was taken (from frontend)
            'notes': notes,
            'source': source
        }

        # Insert into blood_sugar collection first
        bs_result = mongo.db.blood_sugar.insert_one(new_reading)
        blood_sugar_id = str(bs_result.inserted_id)
        logger.info(f"Created blood sugar record with ID: {blood_sugar_id}")

        # Also create a corresponding meal record for standalone readings
        meal_doc = {
            'user_id': str(current_user['_id']),
            'timestamp': current_time,
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
            'bloodSugarTimestamp': blood_sugar_timestamp,
            'bloodSugarSource': source,
            'notes': notes,
            'isStandaloneReading': True,
            'suggestedInsulin': 0,  # No insulin for standalone reading
            'insulinCalculation': {},
            # Add reference to the blood sugar record
            'blood_sugar_id': blood_sugar_id
        }

        # Insert into meals collection
        meal_result = mongo.db.meals.insert_one(meal_doc)
        meal_id = str(meal_result.inserted_id)
        logger.info(f"Created standalone blood sugar record in meals collection with ID: {meal_id}")

        # Update the blood sugar record with the meal reference
        mongo.db.blood_sugar.update_one(
            {"_id": bs_result.inserted_id},
            {"$set": {"meal_id": meal_id}}
        )
        logger.info(f"Updated blood sugar record {blood_sugar_id} with meal reference {meal_id}")

        return jsonify({
            'message': 'Blood sugar reading recorded successfully',
            'id': blood_sugar_id,
            'meal_id': meal_id,
            'status': status,
            'bloodSugarTimestamp': blood_sugar_timestamp
        }), 201

    except Exception as e:
        logger.error(f"Error recording blood sugar: {str(e)}")
        return jsonify({'error': str(e)}), 500


@blood_sugar_bp.route('/api/blood-sugar', methods=['GET'])
@token_required
@api_error_handler
def get_blood_sugar_data(current_user):
    try:
        # Get query parameters
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        # Precise time parameters
        start_time = request.args.get('start_time')
        end_time = request.args.get('end_time')
        # Check if we should filter by reading time instead of record timestamp
        filter_by = request.args.get('filter_by', 'timestamp')

        # Determine user ID (allow doctors to view patient data)
        patient_id = request.args.get('patient_id')
        if patient_id and current_user.get('user_type') != 'doctor':
            return jsonify({"error": "Unauthorized to view patient data"}), 403

        user_id = patient_id if patient_id else str(current_user['_id'])

        # Base query - always filter by user
        query = {"user_id": user_id}

        # Handle filtering based on time parameters
        if start_time or end_time or start_date_str or end_date_str:
            # Parse the provided time parameters
            start_datetime = None
            end_datetime = None

            # Process exact timestamps if provided
            if start_time:
                try:
                    start_datetime = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                    logger.debug(f"Using exact start time: {start_datetime}")
                except ValueError:
                    return jsonify({"error": "Invalid start_time format"}), 400

            if end_time:
                try:
                    end_datetime = datetime.fromisoformat(end_time.replace('Z', '+00:00'))
                    logger.debug(f"Using exact end time: {end_datetime}")
                except ValueError:
                    return jsonify({"error": "Invalid end_time format"}), 400

            # Fall back to date strings if no exact times
            if not start_datetime and start_date_str:
                try:
                    start_datetime = datetime.strptime(start_date_str, '%Y-%m-%d')
                    logger.debug(f"Using start date: {start_datetime}")
                except ValueError:
                    return jsonify({"error": "Invalid start_date format"}), 400

            if not end_datetime and end_date_str:
                try:
                    # Add one day to include full end date
                    end_datetime = datetime.strptime(end_date_str, '%Y-%m-%d') + timedelta(days=1)
                    logger.debug(f"Using end date: {end_datetime}")
                except ValueError:
                    return jsonify({"error": "Invalid end_date format"}), 400

            # Build time filter based on the specified field
            time_filter = {}
            if start_datetime:
                time_filter["$gte"] = start_datetime
            if end_datetime:
                time_filter["$lt"] = end_datetime

            if time_filter:
                if filter_by == 'reading_time':
                    # Filter by when blood sugar was measured (bloodSugarTimestamp)
                    query["bloodSugarTimestamp"] = time_filter
                else:
                    # Default filter by record creation time
                    query["timestamp"] = time_filter

        logger.debug(f"Blood sugar query: {query}")

        # Execute the query
        blood_sugar_readings = list(mongo.db.blood_sugar.find(query).sort("timestamp", -1))
        logger.debug(f"Found {len(blood_sugar_readings)} blood sugar readings")

        # Format the response data
        formatted_readings = []
        for reading in blood_sugar_readings:
            formatted_reading = {
                "_id": str(reading["_id"]),
                "bloodSugar": reading["bloodSugar"],
                "timestamp": reading["timestamp"].isoformat() + "Z",
                "status": reading.get("status", "unknown"),
                "notes": reading.get("notes", "")
            }

            # Include reading time if available (when blood sugar was actually measured)
            if "bloodSugarTimestamp" in reading:
                formatted_reading["bloodSugarTimestamp"] = reading[
                                                               "bloodSugarTimestamp"].isoformat() + "Z" if isinstance(
                    reading["bloodSugarTimestamp"], datetime) else reading["bloodSugarTimestamp"]

            formatted_readings.append(formatted_reading)

        return jsonify(formatted_readings), 200

    except Exception as e:
        logger.error(f"Error retrieving blood sugar data: {str(e)}")
        return jsonify({"error": str(e)}), 500


@blood_sugar_bp.route('/api/blood-sugar/<patient_id>')
def get_blood_sugar_data(patient_id):
    range_param = request.args.get('range', 'week')
    # Calculate date range based on parameter
    if range_param == 'day':
        start_date = datetime.now() - timedelta(days=1)
    elif range_param == 'week':
        start_date = datetime.now() - timedelta(weeks=1)
    else:
        start_date = datetime.now() - timedelta(days=30)

    # Fetch and return blood sugar data
    data = mongo.db.blood_sugar.find({
        'patient_id': patient_id,
        'timestamp': {'$gte': start_date}
    }).sort('timestamp', 1)

    return jsonify(list(data))