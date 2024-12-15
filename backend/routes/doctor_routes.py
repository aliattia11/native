from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from utils.auth import token_required
from utils.error_handler import api_error_handler
from config import mongo
import logging

logger = logging.getLogger(__name__)
doctor_routes = Blueprint('doctor_routes', __name__)

@doctor_routes.route('/api/doctor/patients', methods=['GET'])
@token_required
@api_error_handler
def get_doctor_patients(current_user):
    logger.debug(f"Attempting to fetch patients for doctor: {current_user.get('_id')}")

    if current_user.get('user_type') != 'doctor':
        logger.warning(f"Unauthorized access attempt by user: {current_user.get('_id')}")
        return jsonify({'message': 'Unauthorized access'}), 403

    patients = list(mongo.db.users.find(
        {"user_type": "patient"},
        {"password": 0}
    ))

    patient_list = []
    for patient in patients:
        try:
            patient_data = {
                'id': str(patient['_id']),
                'firstName': patient.get('first_name', ''),
                'lastName': patient.get('last_name', ''),
                'email': patient.get('email', '')
            }
            patient_list.append(patient_data)
        except Exception as e:
            logger.error(f"Error processing patient data: {str(e)}")
            continue

    return jsonify(patient_list), 200



@doctor_routes.route('/api/doctor/patient/<patient_id>/constants', methods=['GET'])
@token_required
@api_error_handler
def get_patient_constants(current_user, patient_id):
    if current_user.get('user_type') != 'doctor':
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        patient = mongo.db.users.find_one({"_id": ObjectId(patient_id)})
        if not patient:
            return jsonify({'message': 'Patient not found'}), 404

        # Return the full set of constants matching the frontend structure
        constants = {
            'insulin_to_carb_ratio': patient.get('insulin_to_carb_ratio', 10),
            'correction_factor': patient.get('correction_factor', 50),
            'target_glucose': patient.get('target_glucose', 100),
            'protein_factor': patient.get('protein_factor', 0.5),
            'fat_factor': patient.get('fat_factor', 0.2),
            'activity_coefficients': patient.get('activity_coefficients', {
                "-2": 0.2,  # Sleep
                "-1": 0.1,  # Very Low Activity
                "0": 0,     # Normal Activity
                "1": -0.1,  # High Activity
                "2": -0.2   # Vigorous Activity
            }),
            'absorption_modifiers': patient.get('absorption_modifiers', {
                "very_slow": 0.6,
                "slow": 0.8,
                "medium": 1.0,
                "fast": 1.2,
                "very_fast": 1.4
            }),
            'insulin_timing_guidelines': patient.get('insulin_timing_guidelines', {
                "very_slow": {"timing_minutes": 0, "description": "Take insulin at the start of meal"},
                "slow": {"timing_minutes": 5, "description": "Take insulin 5 minutes before meal"},
                "medium": {"timing_minutes": 10, "description": "Take insulin 10 minutes before meal"},
                "fast": {"timing_minutes": 15, "description": "Take insulin 15 minutes before meal"},
                "very_fast": {"timing_minutes": 20, "description": "Take insulin 20 minutes before meal"}
            })
        }
        return jsonify({'constants': constants}), 200
    except Exception as e:
        logger.error(f"Error fetching patient constants: {str(e)}")
        return jsonify({'message': 'Error fetching patient constants'}), 500

@doctor_routes.route('/api/doctor/patient/<patient_id>/constants/reset', methods=['POST'])
@token_required
@api_error_handler
def reset_patient_constants(current_user, patient_id):
    if current_user.get('user_type') != 'doctor':
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        # Get default constants from ConstantConfig
        from constants import ConstantConfig
        default_config = ConstantConfig()
        default_constants = {
            'insulin_to_carb_ratio': default_config.insulin_to_carb_ratio,
            'correction_factor': default_config.correction_factor,
            'target_glucose': default_config.target_glucose,
            'protein_factor': default_config.protein_factor,
            'fat_factor': default_config.fat_factor,
            'activity_coefficients': default_config.activity_coefficients,
            'absorption_modifiers': default_config.absorption_modifiers,
            'insulin_timing_guidelines': default_config.insulin_timing_guidelines
        }

        # Update patient with default constants
        result = mongo.db.users.update_one(
            {"_id": ObjectId(patient_id)},
            {"$set": default_constants}
        )

        if result.matched_count == 0:
            return jsonify({'message': 'Patient not found'}), 404

        return jsonify({
            'message': 'Constants reset to defaults successfully',
            'constants': default_constants
        }), 200
    except Exception as e:
        logger.error(f"Error resetting patient constants: {str(e)}")
        return jsonify({'message': 'Error resetting patient constants'}), 500


@doctor_routes.route('/api/doctor/patient/<patient_id>/constants', methods=['PUT'])
@token_required
@api_error_handler
def update_patient_constants(current_user, patient_id):
    if current_user.get('user_type') != 'doctor':
        return jsonify({'message': 'Unauthorized access'}), 403

    try:
        data = request.json
        constants = data.get('constants')

        if not constants:
            return jsonify({'message': 'Missing required constants data'}), 400

        # Extract medical factors
        medical_condition_factors = constants.get('medical_condition_factors', {})
        medication_factors = constants.get('medication_factors', {})

        # Update document
        update_data = {
            'insulin_to_carb_ratio': constants.get('insulin_to_carb_ratio'),
            'correction_factor': constants.get('correction_factor'),
            'target_glucose': constants.get('target_glucose'),
            'protein_factor': constants.get('protein_factor'),
            'fat_factor': constants.get('fat_factor'),
            'activity_coefficients': constants.get('activity_coefficients'),
            'absorption_modifiers': constants.get('absorption_modifiers'),
            'insulin_timing_guidelines': constants.get('insulin_timing_guidelines'),
            'medical_condition_factors': medical_condition_factors,
            'medication_factors': medication_factors
        }

        # Remove None values
        update_data = {k: v for k, v in update_data.items() if v is not None}

        result = mongo.db.users.update_one(
            {"_id": ObjectId(patient_id)},
            {"$set": update_data}
        )

        if result.matched_count == 0:
            return jsonify({'message': 'Patient not found'}), 404

        # Return updated constants
        updated_user = mongo.db.users.find_one({"_id": ObjectId(patient_id)})
        return jsonify({
            'success': True,
            'message': 'Constants updated successfully',
            'constants': {
                **update_data,
                'medical_condition_factors': updated_user.get('medical_condition_factors', {}),
                'medication_factors': updated_user.get('medication_factors', {})
            }
        }), 200

    except Exception as e:
        logger.error(f"Error updating patient constants: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Error updating patient constants'
        }), 500