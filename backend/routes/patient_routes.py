from flask import Blueprint, jsonify, request
from constants import Constants
from utils.auth import token_required

patient_routes = Blueprint('patient_routes', __name__)


@patient_routes.route('/api/patient/constants', methods=['GET'])
@token_required
def get_patient_constants(current_user):
    try:
        print(f"Fetching constants for user: {current_user['_id']}")  # Debug log
        constants = Constants(str(current_user['_id']))
        patient_constants = constants.get_patient_constants()
        print(f"Retrieved constants: {patient_constants}")  # Debug log
        return jsonify({
            'constants': patient_constants
        }), 200
    except Exception as e:
        print(f"Error getting patient constants: {str(e)}")  # Debug log
        return jsonify({'error': str(e)}), 500
