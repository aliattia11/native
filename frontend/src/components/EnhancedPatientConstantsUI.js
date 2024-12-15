import React, { useState, useEffect, useCallback } from 'react';
import styles from './EnhancedPatientConstants.module.css';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';

const EnhancedPatientConstantsUI = ({ patientId }) => {
const [constants, setConstants] = useState({
  ...DEFAULT_PATIENT_CONSTANTS,
  medical_condition_factors: {},
  medication_factors: {}
});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [expandedSections, setExpandedSections] = useState({
  basic: true,
  activity: true,
  absorption: true,
  medical: true,  // Add this
  medications: true  // Add this
});
  const addNewMedicalCondition = () => {
    const newId = `condition_${Date.now()}`;
    setConstants(prev => ({
      ...prev,
      medical_condition_factors: {
        ...prev.medical_condition_factors,
        [newId]: {
          name: '',
          factor: 1.0,
          description: '',
          active: false
        }
      }
    }));
  };

  const addNewMedication = () => {
    const newId = `medication_${Date.now()}`;
    setConstants(prev => ({
      ...prev,
      medication_factors: {
        ...prev.medication_factors,
        [newId]: {
          name: '',
          factor: 1.0,
          description: '',
          active: false
        }
      }
    }));
  };
  const fetchPatientConstants = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/doctor/patient/${patientId}/constants`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch patient constants');

      const data = await response.json();
      setConstants(data.constants);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatientConstants();
  }, [fetchPatientConstants]);
const handleMedicalConditionChange = (conditionId, field, value) => {
  setConstants(prev => ({
    ...prev,
    medical_condition_factors: {
      ...prev.medical_condition_factors,
      [conditionId]: {
        ...prev.medical_condition_factors[conditionId],
        [field]: field === 'factor' ? parseFloat(value) || 0 : value,
        active: field === 'active' ? value : prev.medical_condition_factors[conditionId]?.active || false
      }
    }
  }));
};

const handleMedicationChange = (medicationId, field, value) => {
  setConstants(prev => ({
    ...prev,
    medication_factors: {
      ...prev.medication_factors,
      [medicationId]: {
        ...prev.medication_factors[medicationId],
        [field]: field === 'factor' ? parseFloat(value) || 0 : value,
        active: field === 'active' ? value : prev.medication_factors[medicationId]?.active || false
      }
    }
  }));
};
  const handleBasicConstantChange = (key, value) => {
    setConstants(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };
const resetToDefaults = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/doctor/patient/${patientId}/constants/reset`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to reset patient constants');

      const data = await response.json();
      setConstants(data.constants);

      // Emit an event to notify other components
      const event = new CustomEvent('patientConstantsUpdated', {
        detail: { patientId, constants: data.constants }
      });
      window.dispatchEvent(event);

      setMessage('Patient constants reset to defaults successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleActivityCoefficientChange = (level, value) => {
    setConstants(prev => ({
      ...prev,
      activity_coefficients: {
        ...prev.activity_coefficients,
        [level]: parseFloat(value) || 0
      }
    }));
  };

  const handleAbsorptionModifierChange = (type, value) => {
    setConstants(prev => ({
      ...prev,
      absorption_modifiers: {
        ...prev.absorption_modifiers,
        [type]: parseFloat(value) || 0
      }
    }));
  };

const handleSubmit = async () => {
    try {
        setLoading(true);
        const token = localStorage.getItem('token');
        const response = await fetch(`http://localhost:5000/api/doctor/patient/${patientId}/constants`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                constants: constants // Remove the nesting
            })
        });

        if (!response.ok) throw new Error('Failed to update patient constants');

        // Emit an event to notify other components
        const event = new CustomEvent('patientConstantsUpdated', {
            detail: { patientId, constants }
        });
        window.dispatchEvent(event);

        setMessage('Patient constants updated successfully');
        setTimeout(() => setMessage(''), 3000);
    } catch (err) {
        setError(err.message);
    } finally {
        setLoading(false);
    }
};

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (loading) return <div className={styles.patientConstants}>Loading...</div>;
  if (error) return <div className={styles.patientConstants}>Error: {error}</div>;

  return (
    <div className={styles.patientConstants}>
      <div className={styles.form}>
        {/* Basic Constants Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('basic')}>
            Basic Constants
            <span style={{ float: 'right' }}>{expandedSections.basic ? '▼' : '▶'}</span>
          </h3>
          {expandedSections.basic && (
            <div className={styles.constantsWrapper}>
              <div className={styles.formGroup}>
                <label>Insulin to Carb Ratio</label>
                <input
                  type="number"
                  value={constants.insulin_to_carb_ratio}
                  onChange={(e) => handleBasicConstantChange('insulin_to_carb_ratio', e.target.value)}
                  step="0.1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Correction Factor</label>
                <input
                  type="number"
                  value={constants.correction_factor}
                  onChange={(e) => handleBasicConstantChange('correction_factor', e.target.value)}
                  step="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Target Glucose</label>
                <input
                  type="number"
                  value={constants.target_glucose}
                  onChange={(e) => handleBasicConstantChange('target_glucose', e.target.value)}
                  step="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Protein Factor</label>
                <input
                  type="number"
                  value={constants.protein_factor}
                  onChange={(e) => handleBasicConstantChange('protein_factor', e.target.value)}
                  step="0.1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Fat Factor</label>
                <input
                  type="number"
                  value={constants.fat_factor}
                  onChange={(e) => handleBasicConstantChange('fat_factor', e.target.value)}
                  step="0.1"
                />
              </div>
            </div>
          )}
        </div>

        {/* Activity Coefficients Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('activity')}>
            Activity Coefficients
            <span style={{ float: 'right' }}>{expandedSections.activity ? '▼' : '▶'}</span>
          </h3>
          {expandedSections.activity && (
            <div className={styles.constantsWrapper}>
              {Object.entries(constants.activity_coefficients).map(([level, value]) => (
                <div key={level} className={styles.formGroup}>
                  <label>
                    {level === "-2" ? "Sleep" :
                     level === "-1" ? "Very Low Activity" :
                     level === "0" ? "Normal Activity" :
                     level === "1" ? "High Activity" :
                     "Vigorous Activity"}
                  </label>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => handleActivityCoefficientChange(level, e.target.value)}
                    step="0.1"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Absorption Modifiers Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('absorption')}>
            Absorption Modifiers
            <span style={{ float: 'right' }}>{expandedSections.absorption ? '▼' : '▶'}</span>
          </h3>
          {expandedSections.absorption && (
            <div className={styles.constantsWrapper}>
              {Object.entries(constants.absorption_modifiers).map(([type, value]) => (
                <div key={type} className={styles.formGroup}>
                  <label>{type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                  <input
                    type="number"
                    value={value}
                    onChange={(e) => handleAbsorptionModifierChange(type, e.target.value)}
                    step="0.1"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
 {/* Medical Conditions Section */}
    <div className={styles.constantsSection}>
      <h3 className={styles.subsectionTitle} onClick={() => toggleSection('medical')}>
        Medical Conditions
        <span style={{ float: 'right' }}>{expandedSections.medical ? '▼' : '▶'}</span>
      </h3>
      {expandedSections.medical && (
        <div className={styles.constantsWrapper}>
          {Object.entries(constants.medical_condition_factors || {}).map(([id, condition]) => (
            <div key={id} className={styles.medicalFactorGroup}>
              <div className={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id={`condition-${id}`}
                  checked={condition.active || false}
                  onChange={(e) => handleMedicalConditionChange(id, 'active', e.target.checked)}
                />
                <input
                  type="text"
                  value={condition.name || ''}
                  onChange={(e) => handleMedicalConditionChange(id, 'name', e.target.value)}
                  placeholder="Condition name"
                />
              </div>
              <div className={styles.factorInputGroup}>
                <input
                  type="number"
                  value={condition.factor || 1.0}
                  onChange={(e) => handleMedicalConditionChange(id, 'factor', e.target.value)}
                  step="0.1"
                  min="0"
                />
                <input
                  type="text"
                  value={condition.description || ''}
                  onChange={(e) => handleMedicalConditionChange(id, 'description', e.target.value)}
                  placeholder="Description"
                />
              </div>
            </div>
          ))}
          <button className={styles.addButton} onClick={addNewMedicalCondition}>
            Add New Medical Condition
          </button>
        </div>
      )}
    </div>

    {/* Medications Section */}
    <div className={styles.constantsSection}>
      <h3 className={styles.subsectionTitle} onClick={() => toggleSection('medications')}>
        Medications
        <span style={{ float: 'right' }}>{expandedSections.medications ? '▼' : '▶'}</span>
      </h3>
      {expandedSections.medications && (
        <div className={styles.constantsWrapper}>
          {Object.entries(constants.medication_factors || {}).map(([id, medication]) => (
            <div key={id} className={styles.medicalFactorGroup}>
              <div className={styles.checkboxGroup}>
                <input
                  type="checkbox"
                  id={`medication-${id}`}
                  checked={medication.active || false}
                  onChange={(e) => handleMedicationChange(id, 'active', e.target.checked)}
                />
                <input
                  type="text"
                  value={medication.name || ''}
                  onChange={(e) => handleMedicationChange(id, 'name', e.target.value)}
                  placeholder="Medication name"
                />
              </div>
              <div className={styles.factorInputGroup}>
                <input
                  type="number"
                  value={medication.factor || 1.0}
                  onChange={(e) => handleMedicationChange(id, 'factor', e.target.value)}
                  step="0.1"
                  min="0"
                />
                <input
                  type="text"
                  value={medication.description || ''}
                  onChange={(e) => handleMedicationChange(id, 'description', e.target.value)}
                  placeholder="Description"
                />
              </div>
            </div>
          ))}
          <button className={styles.addButton} onClick={addNewMedication}>
            Add New Medication
          </button>
        </div>
      )}
    </div>

        {message && (
          <div className={styles.message}>
            {message}
          </div>
        )}

          <div className={styles.buttonGroup}>
              <button
                  onClick={resetToDefaults}  // Changed from fetchPatientConstants to resetToDefaults
                  className={styles.resetButton}
              >
                  Reset to Defaults
              </button>
              <button
                  onClick={handleSubmit}
                  className={styles.submitButton}
                  disabled={loading}
              >
                  Save Changes
              </button>
          </div>
      </div>
    </div>
  );
};

export default EnhancedPatientConstantsUI;