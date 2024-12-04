from flask import Blueprint, jsonify, request
from models.user import User
from utils.auth import require_auth, doctor_required
from constants import Constants

patient_routes = Blueprint('patient_routes', __name__)

@patient_routes.route('/api/patients/<patient_id>/constants', methods=['GET'])
@require_auth
def get_patient_constants(patient_id):
    constants = Constants(patient_id)
    return jsonify(constants.constants)

@patient_routes.route('/api/patients/<patient_id>/constants', methods=['PUT'])
@require_auth
@doctor_required
def update_patient_constants(patient_id):
    new_constants = request.json
    constants = Constants(patient_id)
    
    if constants.update_patient_constants(new_constants):
        return jsonify(constants.constants)
    return jsonify({'error': 'Failed to update constants'}), 400

# Example component using the constants
import React from 'react';
import { usePatientConstants } from '../hooks/usePatientConstants';

export const PatientSettings = ({ patientId }) => {
  const { patientConstants, loading, error, updatePatientConstants } = usePatientConstants(patientId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error loading patient settings</div>;

  const handleUpdate = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const newConstants = {
      insulin_to_carb_ratio: parseFloat(formData.get('insulin_to_carb_ratio')),
      correction_factor: parseFloat(formData.get('correction_factor')),
      target_glucose: parseFloat(formData.get('target_glucose')),
      // Add other fields as needed
    };
    
    const success = await updatePatientConstants(newConstants);
    if (success) {
      alert('Settings updated successfully');
    } else {
      alert('Failed to update settings');
    }
  };

  return (
    <form onSubmit={handleUpdate}>
      <div>
        <label>Insulin to Carb Ratio:</label>
        <input
          name="insulin_to_carb_ratio"
          type="number"
          defaultValue={patientConstants.insulin_to_carb_ratio}
        />
      </div>
      {/* Add other fields as needed */}
      <button type="submit">Update Settings</button>
    </form>
  );
};