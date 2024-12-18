from flask import Blueprint, jsonify, request
from constants import Constants
from utils.auth import token_required
from bson.objectid import ObjectId
from config import mongo

patient_routes = Blueprint('patient_routes', __name__)


@patient_routes.route('/api/patient/constants', methods=['GET', 'OPTIONS'])
def patient_constants():
    if request.method == 'OPTIONS':
        return '', 200

    @token_required
    def get_constants(current_user):
        try:
            user_id = str(current_user['_id'])

            # Get user from database
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
                'insulin_timing_guidelines': user.get('insulin_timing_guidelines'),
                'disease_factors': user.get('disease_factors'),
                'medication_factors': user.get('medication_factors'),
            }

            default_constants = Constants().default_config

            # Merge with defaults, preferring user values when they exist
            for key, value in constants.items():
                if value is None:
                    constants[key] = getattr(default_constants, key)

            return jsonify({'constants': constants}), 200
        except Exception as e:
            return jsonify({'error': str(e)}), 500

    return get_constants()