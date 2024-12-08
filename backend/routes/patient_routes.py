from flask import Blueprint, jsonify, request
from constants import Constants
from utils.auth import token_required
from bson.objectid import ObjectId
from config import mongo

patient_routes = Blueprint('patient_routes', __name__)


@patient_routes.route('/api/patient/constants', methods=['GET'])
@token_required
def get_patient_constants(current_user):
    try:
        user_id = str(current_user['_id'])
        print(f"Fetching constants for user: {user_id}")

        # Get user from database to ensure we have latest constants
        user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # Get patient constants from user document
        constants = {
            'insulin_to_carb_ratio': user.get('insulin_to_carb_ratio'),
            'correction_factor': user.get('correction_factor'),
            'target_glucose': user.get('target_glucose'),
            'protein_factor': user.get('protein_factor'),
            'fat_factor': user.get('fat_factor'),
            'activity_coefficients': user.get('activity_coefficients'),
            'absorption_modifiers': user.get('absorption_modifiers'),
            'insulin_timing_guidelines': user.get('insulin_timing_guidelines')
        }

        # Get default constants
        default_constants = Constants().default_config

        # Merge with defaults, preferring user values when they exist
        for key, value in constants.items():
            if value is None:
                constants[key] = getattr(default_constants, key)

        print(f"Retrieved constants: {constants}")
        return jsonify({'constants': constants}), 200
    except Exception as e:
        print(f"Error getting patient constants: {str(e)}")
        return jsonify({'error': str(e)}), 500