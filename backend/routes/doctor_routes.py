from flask import Blueprint, request, jsonify
from bson.objectid import ObjectId
from utils.auth import token_required
from utils.error_handler import api_error_handler
from config import mongo
from constants import Constants, ConstantConfig
import logging
from datetime import datetime  # Add this import for medication logging

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
                'email': patient.get('email', ''),
                # Add active diseases and medications to patient list view
                'activeConditions': patient.get('active_conditions', []),
                'activeMedications': patient.get('active_medications', [])
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

        # Get default constants
        default_constants = Constants.DEFAULT_PATIENT_CONSTANTS

        # Get medication factors ensuring both defaults and patient overrides
        medication_factors = {
            **default_constants['medication_factors'],  # Start with defaults
            **(patient.get('medication_factors', {}))  # Override with patient specifics
        }

        # Return the full set of constants
        constants = {
            'insulin_to_carb_ratio': patient.get('insulin_to_carb_ratio', default_constants['insulin_to_carb_ratio']),
            'correction_factor': patient.get('correction_factor', default_constants['correction_factor']),
            'target_glucose': patient.get('target_glucose', default_constants['target_glucose']),
            'protein_factor': patient.get('protein_factor', default_constants['protein_factor']),
            'fat_factor': patient.get('fat_factor', default_constants['fat_factor']),
            'carb_to_bg_factor': patient.get('carb_to_bg_factor', default_constants['carb_to_bg_factor']),  # Add this line to return carb_to_bg_factor
            'activity_coefficients': patient.get('activity_coefficients', default_constants['activity_coefficients']),
            'absorption_modifiers': patient.get('absorption_modifiers', default_constants['absorption_modifiers']),
            'insulin_timing_guidelines': patient.get('insulin_timing_guidelines', default_constants['insulin_timing_guidelines']),
            'disease_factors': patient.get('disease_factors', default_constants['disease_factors']),
            'medication_factors': medication_factors,  # Use the merged medication factors
            'active_conditions': patient.get('active_conditions', []),
            'active_medications': patient.get('active_medications', [])
        }

        # Add debug logging
        logger.debug(f"Sending medication factors: {medication_factors}")
        logger.debug(f"Full constants being sent: {constants}")

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
        default_config = ConstantConfig()
        default_constants = {
            'insulin_to_carb_ratio': default_config.insulin_to_carb_ratio,
            'correction_factor': default_config.correction_factor,
            'target_glucose': default_config.target_glucose,
            'protein_factor': default_config.protein_factor,
            'fat_factor': default_config.fat_factor,
            'carb_to_bg_factor': default_config.carb_to_bg_factor,  # Add this line for reset function
            'activity_coefficients': default_config.activity_coefficients,
            'absorption_modifiers': default_config.absorption_modifiers,
            'insulin_timing_guidelines': default_config.insulin_timing_guidelines,
            # Add new disease and medication factors
            'disease_factors': default_config.disease_factors,
            'medication_factors': default_config.medication_factors,
            # Reset active conditions and medications to empty lists
            'active_conditions': [],
            'active_medications': []
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

        # Updated required fields to include new factors
        required_fields = [
            'insulin_to_carb_ratio',
            'correction_factor',
            'target_glucose',
            'protein_factor',
            'fat_factor',
            'carb_to_bg_factor',  # Add this line to include carb_to_bg_factor
            'activity_coefficients',
            'absorption_modifiers',
            'insulin_timing_guidelines',
            'disease_factors',
            'medication_factors',
            'active_conditions',
            'active_medications'
        ]

        update_data = {}
        for field in required_fields:
            if field in constants:
                update_data[field] = constants[field]

        if not update_data:
            return jsonify({'message': 'No valid constants provided'}), 400

        # Validate disease factors
        if 'disease_factors' in update_data:
            default_diseases = Constants.DEFAULT_PATIENT_CONSTANTS['disease_factors']
            for disease, data in update_data['disease_factors'].items():
                if disease not in default_diseases:
                    return jsonify({
                        'message': f'Invalid disease type: {disease}',
                        'valid_diseases': list(default_diseases.keys())
                    }), 400

        # Validate medication factors
        if 'medication_factors' in update_data:
            default_medications = Constants.DEFAULT_PATIENT_CONSTANTS['medication_factors']
            for medication, data in update_data['medication_factors'].items():
                if medication not in default_medications:
                    return jsonify({
                        'message': f'Invalid medication type: {medication}',
                        'valid_medications': list(default_medications.keys())
                    }), 400

        result = mongo.db.users.update_one(
            {"_id": ObjectId(patient_id)},
            {"$set": update_data}
        )

        if result.matched_count == 0:
            return jsonify({'message': 'Patient not found'}), 404

        # Return the updated constants
        updated_user = mongo.db.users.find_one({"_id": ObjectId(patient_id)})
        updated_constants = {
            field: updated_user.get(field) for field in required_fields
        }

        return jsonify({
            'message': 'Constants updated successfully',
            'constants': updated_constants
        }), 200
    except Exception as e:
        logger.error(f"Error updating patient constants: {str(e)}")
        return jsonify({'message': 'Error updating patient constants'}), 500

@doctor_routes.route('/api/doctor/patient/<patient_id>/conditions', methods=['PUT'])
@token_required
@api_error_handler
def update_patient_conditions(current_user, patient_id):
        if current_user.get('user_type') != 'doctor':
            return jsonify({'message': 'Unauthorized access'}), 403

        try:
            data = request.json
            conditions = data.get('conditions', [])

            # Validate conditions against available disease factors
            valid_conditions = Constants.DEFAULT_PATIENT_CONSTANTS['disease_factors'].keys()
            invalid_conditions = [c for c in conditions if c not in valid_conditions]

            if invalid_conditions:
                return jsonify({
                    'message': f'Invalid conditions: {invalid_conditions}',
                    'valid_conditions': list(valid_conditions)
                }), 400

            # Update patient's active conditions
            result = mongo.db.users.update_one(
                {"_id": ObjectId(patient_id)},
                {"$set": {"active_conditions": conditions}}
            )

            if result.matched_count == 0:
                return jsonify({'message': 'Patient not found'}), 404

            return jsonify({
                'message': 'Patient conditions updated successfully',
                'active_conditions': conditions
            }), 200
        except Exception as e:
            logger.error(f"Error updating patient conditions: {str(e)}")
            return jsonify({'message': 'Error updating patient conditions'}), 500

@doctor_routes.route('/api/doctor/patient/<patient_id>/medications', methods=['PUT'])
@token_required
@api_error_handler
def update_patient_medications(current_user, patient_id):
        if current_user.get('user_type') != 'doctor':
            return jsonify({'message': 'Unauthorized access'}), 403

        try:
            data = request.json
            medications = data.get('medications', [])

            # Validate medications against available medication factors
            valid_medications = Constants.DEFAULT_PATIENT_CONSTANTS['medication_factors'].keys()
            invalid_medications = [m for m in medications if m not in valid_medications]

            if invalid_medications:
                return jsonify({
                    'message': f'Invalid medications: {invalid_medications}',
                    'valid_medications': list(valid_medications)
                }), 400

            # Update patient's active medications
            result = mongo.db.users.update_one(
                {"_id": ObjectId(patient_id)},
                {"$set": {"active_medications": medications}}
            )

            if result.matched_count == 0:
                return jsonify({'message': 'Patient not found'}), 404

            return jsonify({
                'message': 'Patient medications updated successfully',
                'active_medications': medications
            }), 200
        except Exception as e:
            logger.error(f"Error updating patient medications: {str(e)}")
            return jsonify({'message': 'Error updating patient medications'}), 500

@doctor_routes.route('/api/doctor/patient/<patient_id>/medication-log', methods=['POST'])
@token_required
@api_error_handler
def log_medication(current_user, patient_id):
            if current_user.get('user_type') != 'doctor':
                return jsonify({'message': 'Unauthorized access'}), 403

            try:
                data = request.json
                medication_log = {
                    'patient_id': patient_id,
                    'medication': data.get('medication'),
                    'taken_at': datetime.fromisoformat(data.get('taken_at')),
                    'next_dose': datetime.fromisoformat(data.get('next_dose')),
                    'created_by': str(current_user['_id']),
                    'created_at': datetime.utcnow()
                }

                result = mongo.db.medication_logs.insert_one(medication_log)

                return jsonify({
                    'message': 'Medication log created successfully',
                    'id': str(result.inserted_id)
                }), 201
            except Exception as e:
                logger.error(f"Error logging medication: {str(e)}")
                return jsonify({'message': 'Error logging medication'}), 500

@doctor_routes.route('/api/doctor/patient/<patient_id>/medication-log', methods=['GET'])
@token_required
@api_error_handler
def get_medication_logs(current_user, patient_id):
            if current_user.get('user_type') != 'doctor':
                return jsonify({'message': 'Unauthorized access'}), 403

            try:
                logs = list(mongo.db.medication_logs.find(
                    {'patient_id': patient_id}
                ).sort('taken_at', -1))

                return jsonify({
                    'logs': [{
                        'id': str(log['_id']),
                        'medication': log['medication'],
                        'taken_at': log['taken_at'].isoformat(),
                        'next_dose': log['next_dose'].isoformat()
                    } for log in logs]
                }), 200
            except Exception as e:
                logger.error(f"Error fetching medication logs: {str(e)}")
                return jsonify({'message': 'Error fetching medication logs'}), 500