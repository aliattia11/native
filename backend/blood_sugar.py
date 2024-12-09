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

@blood_sugar_bp.route('/api/blood-sugar', methods=['POST'])
@token_required
def add_blood_sugar(current_user):
    try:
        user_constants = Constants(str(current_user['_id']))
        blood_sugar = request.json.get('bloodSugar')

        if blood_sugar is None:
            return jsonify({'error': 'Blood sugar value is required'}), 400

        # Validate blood sugar value
        is_valid, error_message = validate_blood_sugar_mgdl(blood_sugar)
        if not is_valid:
            return jsonify({'error': error_message}), 400

        target_glucose = user_constants.get_constant('target_glucose')
        status = get_blood_sugar_status(blood_sugar, target_glucose)

        # Create new reading
        new_reading = {
            'user_id': str(current_user['_id']),
            'bloodSugar': blood_sugar,
            'status': status,
            'target': target_glucose,
            'timestamp': datetime.utcnow()
        }

        result = mongo.db.blood_sugar.insert_one(new_reading)

        return jsonify({
            'message': 'Blood sugar reading recorded successfully',
            'id': str(result.inserted_id),
            'status': status
        }), 201

    except Exception as e:
        logger.error(f"Error recording blood sugar: {str(e)}")
        return jsonify({'error': str(e)}), 500


@blood_sugar_bp.route('/api/blood-sugar', methods=['GET'])
@token_required
def get_blood_sugar(current_user):
    try:
        user_constants = Constants(str(current_user['_id']))
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        unit = request.args.get('unit', 'mg/dL')

        # Convert dates to datetime objects with better error handling
        try:
            if start_date:
                start = datetime.strptime(start_date, '%Y-%m-%d')
            else:
                start = datetime.utcnow() - timedelta(days=30)  # Default to last 30 days

            if end_date:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            else:
                end = datetime.utcnow()
        except ValueError as e:
            logger.error(f"Date parsing error: {str(e)}")
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

        # Build query
        query = {'user_id': str(current_user['_id'])}
        query['timestamp'] = {
            '$gte': start,
            '$lte': end + timedelta(days=1)  # Include the full end date
        }

        readings = list(mongo.db.blood_sugar.find(query).sort('timestamp', -1))
        target_glucose = user_constants.get_constant('target_glucose')

        # Process readings
        for reading in readings:
            reading['_id'] = str(reading['_id'])
            if isinstance(reading.get('timestamp'), datetime):
                reading['timestamp'] = reading['timestamp'].isoformat()

            # Add status if not present
            if 'status' not in reading:
                reading['status'] = get_blood_sugar_status(reading['bloodSugar'], target_glucose)

            # Convert to mmol/L if requested
            if unit == 'mmol/L':
                reading['bloodSugar'] = round(reading['bloodSugar'] / 18, 1)
                if 'target' in reading:
                    reading['target'] = round(reading['target'] / 18, 1)

        return jsonify(readings)
    except Exception as e:
        logger.error(f"Error fetching blood sugar data: {str(e)}")
        return jsonify({'error': str(e)}), 500

@blood_sugar_bp.route('/doctor/patient/<patient_id>/blood-sugar', methods=['GET'])
@token_required
def get_patient_blood_sugar(current_user, patient_id):
    try:
        if current_user.get('user_type') != 'doctor':
            return jsonify({'message': 'Unauthorized access'}), 403

        patient_constants = Constants(patient_id)
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        unit = request.args.get('unit', 'mg/dL')

        # Convert dates to datetime objects with better error handling
        try:
            if start_date:
                start = datetime.strptime(start_date, '%Y-%m-%d')
            else:
                start = datetime.utcnow() - timedelta(days=30)  # Default to last 30 days

            if end_date:
                end = datetime.strptime(end_date, '%Y-%m-%d')
            else:
                end = datetime.utcnow()
        except ValueError as e:
            logger.error(f"Date parsing error: {str(e)}")
            return jsonify({'error': 'Invalid date format. Use YYYY-MM-DD'}), 400

        # Build query
        query = {'user_id': patient_id}
        query['timestamp'] = {
            '$gte': start,
            '$lte': end + timedelta(days=1)  # Include the full end date
        }

        readings = list(mongo.db.blood_sugar.find(query).sort('timestamp', -1))
        target_glucose = patient_constants.get_constant('target_glucose')

        # Process readings
        for reading in readings:
            reading['_id'] = str(reading['_id'])
            if isinstance(reading.get('timestamp'), datetime):
                reading['timestamp'] = reading['timestamp'].isoformat()

            # Add status if not present
            if 'status' not in reading:
                reading['status'] = get_blood_sugar_status(reading['bloodSugar'], target_glucose)

            # Convert to mmol/L if requested
            if unit == 'mmol/L':
                reading['bloodSugar'] = round(reading['bloodSugar'] / 18, 1)
                if 'target' in reading:
                    reading['target'] = round(reading['target'] / 18, 1)

        return jsonify(readings)
    except Exception as e:
        logger.error(f"Error fetching patient blood sugar data: {str(e)}")
        return jsonify({'error': str(e)}), 500


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