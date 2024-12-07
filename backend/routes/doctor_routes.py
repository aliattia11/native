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

        # Update using single field
        result = mongo.db.users.update_one(
            {"_id": ObjectId(patient_id)},
            {"$set": {'patient_constants': constants}}
        )

        if result.matched_count == 0:
            return jsonify({'message': 'Patient not found'}), 404

        return jsonify({'message': 'Constants updated successfully'}), 200
    except Exception as e:
        logger.error(f"Error updating patient constants: {str(e)}")
        return jsonify({'message': 'Error updating patient constants'}), 500
