import React, { useState, useEffect, useCallback } from 'react';
import styles from './EnhancedPatientConstants.module.css';
import { DEFAULT_PATIENT_CONSTANTS, DISEASE_FACTORS, MEDICATION_FACTORS } from '../constants';

const EnhancedPatientConstantsUI = ({ patientId }) => {
  const [constants, setConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    activity: true,
    absorption: true,
    diseases: true,
    medications: true
  });

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

  const handleBasicConstantChange = (key, value) => {
    setConstants(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

  // New handlers for disease and medication factors
  const handleDiseaseFactorChange = (disease, value) => {
    setConstants(prev => ({
      ...prev,
      disease_factors: {
        ...prev.disease_factors,
        [disease]: {
          ...prev.disease_factors[disease],
          factor: parseFloat(value) || 1.0
        }
      }
    }));
  };

  const handleMedicationFactorChange = (medication, value) => {
    setConstants(prev => ({
      ...prev,
      medication_factors: {
        ...prev.medication_factors,
        [medication]: {
          ...prev.medication_factors[medication],
          factor: parseFloat(value) || 1.0
        }
      }
    }));
  };

  const handleActiveConditionToggle = (condition) => {
    setConstants(prev => ({
      ...prev,
      active_conditions: prev.active_conditions.includes(condition)
        ? prev.active_conditions.filter(c => c !== condition)
        : [...prev.active_conditions, condition]
    }));
  };

  const handleActiveMedicationToggle = (medication) => {
    setConstants(prev => ({
      ...prev,
      active_medications: prev.active_medications.includes(medication)
        ? prev.active_medications.filter(m => m !== medication)
        : [...prev.active_medications, medication]
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
 {/* Health Conditions Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('diseases')}>
            Health Conditions
            <span style={{ float: 'right' }}>{expandedSections.diseases ? '▼' : '▶'}</span>
          </h3>
          {expandedSections.diseases && (
            <div className={styles.constantsWrapper}>
              {Object.entries(constants.disease_factors || {}).map(([disease, data]) => (
                <div key={disease} className={styles.formGroup}>
                  <div className={styles.factorHeader}>
                    <input
                      type="checkbox"
                      checked={constants.active_conditions?.includes(disease)}
                      onChange={() => handleActiveConditionToggle(disease)}
                    />
                    <label>{disease.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                  </div>
                  <div className={styles.factorInputs}>
                    <input
                      type="number"
                      value={data.factor}
                      onChange={(e) => handleDiseaseFactorChange(disease, e.target.value)}
                      step="0.1"
                      disabled={!constants.active_conditions?.includes(disease)}
                    />
                    <span className={styles.factorDescription}>{data.description}</span>
                  </div>
                </div>
              ))}
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
              {Object.entries(constants.medication_factors || {}).map(([medication, data]) => (
                <div key={medication} className={styles.formGroup}>
                  <div className={styles.factorHeader}>
                    <input
                      type="checkbox"
                      checked={constants.active_medications?.includes(medication)}
                      onChange={() => handleActiveMedicationToggle(medication)}
                    />
                    <label>{medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</label>
                  </div>
                  <div className={styles.factorInputs}>
                    <input
                      type="number"
                      value={data.factor}
                      onChange={(e) => handleMedicationFactorChange(medication, e.target.value)}
                      step="0.1"
                      disabled={!constants.active_medications?.includes(medication)}
                    />
                    <span className={styles.factorDescription}>
                      {data.description}
                      {data.duration_based && (
                        <span className={styles.durationBased}>
                          (Duration: {data.onset_hours}h onset, {data.peak_hours}h peak, {data.duration_hours}h total)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
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