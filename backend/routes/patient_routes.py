from flask import Blueprint, jsonify, request
from datetime import datetime
from bson.objectid import ObjectId
from utils.auth import token_required
from utils.error_handler import api_error_handler
from config import mongo
import logging
from datetime import datetime

# Set up logging
logger = logging.getLogger(__name__)

patient_routes = Blueprint('patient_routes', __name__)

@patient_routes.route('/api/patient/constants', methods=['GET'])
@token_required
@api_error_handler
def get_constants(current_user):
    try:
        # Ensure current_user exists and has an _id
        if not current_user or '_id' not in current_user:
            logger.error("No valid user found in token")
            return jsonify({'error': 'Invalid user token'}), 401

        user_id = str(current_user['_id'])
        logger.debug(f"Fetching constants for user: {user_id}")

        # Get user from database
        try:
            user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
            if not user:
                logger.error(f"User not found: {user_id}")
                return jsonify({'error': 'User not found'}), 404
        except Exception as e:
            logger.error(f"Database error finding user: {str(e)}")
            return jsonify({'error': 'Database error'}), 500

        try:
            # Get active medication schedules
            active_schedules = list(mongo.db.medication_schedules.find({
                'patient_id': user_id,
                'endDate': {'$gte': datetime.utcnow()}
            }))

            # Format medication schedules
            medication_schedules = {}
            for schedule in active_schedules:
                try:
                    medication_schedules[schedule['medication']] = {
                        'id': str(schedule['_id']),
                        'startDate': schedule['startDate'].isoformat(),
                        'endDate': schedule['endDate'].isoformat(),
                        'dailyTimes': schedule['dailyTimes']
                    }
                except Exception as e:
                    logger.error(f"Error formatting schedule: {str(e)}")
                    continue

            # Get default values from your constants
            from constants import Constants
            default_constants = Constants.DEFAULT_PATIENT_CONSTANTS

            # Build response with defaults for missing values
            constants = {
                'patient_id': user_id,
                'insulin_to_carb_ratio': user.get('insulin_to_carb_ratio', default_constants['insulin_to_carb_ratio']),
                'correction_factor': user.get('correction_factor', default_constants['correction_factor']),
                'target_glucose': user.get('target_glucose', default_constants['target_glucose']),
                'protein_factor': user.get('protein_factor', default_constants['protein_factor']),
                'fat_factor': user.get('fat_factor', default_constants['fat_factor']),
                'carb_to_bg_factor': user.get('carb_to_bg_factor', default_constants['carb_to_bg_factor']),  # Add this line to return carb_to_bg_factor
                'activity_coefficients': user.get('activity_coefficients', default_constants['activity_coefficients']),
                'absorption_modifiers': user.get('absorption_modifiers', default_constants['absorption_modifiers']),
                'insulin_timing_guidelines': user.get('insulin_timing_guidelines', default_constants['insulin_timing_guidelines']),
                'disease_factors': user.get('disease_factors', default_constants['disease_factors']),
                'medication_factors': user.get('medication_factors', default_constants['medication_factors']),
                'active_conditions': user.get('active_conditions', []),
                'active_medications': user.get('active_medications', []),
                'medication_schedules': medication_schedules
            }

            logger.debug("Successfully fetched patient constants")
            return jsonify({'constants': constants}), 200

        except Exception as e:
            logger.error(f"Error processing medication schedules: {str(e)}")
            return jsonify({'error': 'Error processing medication schedules'}), 500

    except Exception as e:
        logger.error(f"Unexpected error in get_constants: {str(e)}")
        return jsonify({'error': str(e)}), 500