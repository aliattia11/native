import React, { useState, useEffect, useCallback } from 'react';
import MedicationSchedule from './MedicationSchedule';
import styles from './EnhancedPatientConstants.module.css';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';
import { ACTIVITY_LEVELS } from '../constants';
import { useConstants } from '../contexts/ConstantsContext';
import axios from 'axios';

const EnhancedPatientConstantsUI = ({ patientId }) => {
  const { refreshConstants, fetchMedicationSchedules } = useConstants();
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

      // Fetch constants and medication schedules in parallel
      const [constantsResponse, schedulesResponse] = await Promise.all([
        axios.get(`http://localhost:5000/api/doctor/patient/${patientId}/constants`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`http://localhost:5000/api/medication-schedule/${patientId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const constantsData = constantsResponse.data.constants;
      const schedulesData = schedulesResponse.data.schedules;

      // Merge medication schedules into constants
      const mergedConstants = {
        ...constantsData,
        medication_schedules: schedulesData.reduce((acc, schedule) => {
          acc[schedule.medication] = schedule;
          return acc;
        }, {})
      };

      setConstants(mergedConstants);
      setError(null);

    } catch (err) {
      console.error('Error fetching patient data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatientConstants();

    // Set up event listener for medication schedule updates
    const handleScheduleUpdate = () => {
      fetchPatientConstants();
    };

    window.addEventListener('medicationScheduleUpdated', handleScheduleUpdate);

    // Cleanup
    return () => {
      window.removeEventListener('medicationScheduleUpdated', handleScheduleUpdate);
    };
  }, [fetchPatientConstants]);

  const handleBasicConstantChange = (key, value) => {
    setConstants(prev => ({
      ...prev,
      [key]: parseFloat(value) || 0
    }));
  };

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

  const handleMedicationScheduleUpdate = async () => {
    try {
      await Promise.all([
        refreshConstants(),
        fetchMedicationSchedules(patientId)
      ]);
      await fetchPatientConstants();
    } catch (error) {
      console.error('Error updating medication schedules:', error);
      setError('Failed to update medication schedules');
    }
  };

  const resetToDefaults = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:5000/api/doctor/patient/${patientId}/constants/reset`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setConstants(response.data.constants);
      setMessage('Patient constants reset to defaults successfully');
      setTimeout(() => setMessage(''), 3000);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      await axios.put(
        `http://localhost:5000/api/doctor/patient/${patientId}/constants`,
        { constants },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      await Promise.all([
        refreshConstants(),
        fetchMedicationSchedules(patientId),
        fetchPatientConstants()
      ]);

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

  if (loading) return <div className={styles.loading}>Loading...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;


return (
    <div className={styles.patientConstants}>
      {message && (
        <div className={styles.message}>
          {message}
        </div>
      )}

      <div className={styles.form}>
        {/* Basic Constants Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('basic')}>
            Basic Constants
            <span>{expandedSections.basic ? '▼' : '▶'}</span>
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
              {/* New field for Carb-to-BG Factor */}
              <div className={styles.formGroup}>
                <label>
                  Carb-to-BG Factor
                  <span className={styles.tooltipIcon} title="How much 1g of carbohydrate raises blood glucose in mg/dL">ⓘ</span>
                </label>
                <input
                  type="number"
                  value={constants.carb_to_bg_factor || 4.0}
                  onChange={(e) => handleBasicConstantChange('carb_to_bg_factor', e.target.value)}
                  min="1.0"
                  max="10.0"
                  step="0.1"
                />
                <small className={styles.inputHint}>mg/dL per gram of carbs (typically 4-5)</small>
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

<div className={styles.constantsSection}>
  <h3 className={styles.subsectionTitle} onClick={() => toggleSection('activity')}>
    Activity Coefficients
    <span>{expandedSections.activity ? '▼' : '▶'}</span>
  </h3>
  {expandedSections.activity && (
    <div className={styles.constantsWrapper}>
      {ACTIVITY_LEVELS.map(activityLevel => {
        const level = activityLevel.value.toString();
        const currentValue = constants.activity_coefficients[level] || activityLevel.impact;

        return (
          <div key={level} className={styles.formGroup}>
            <label>
              {activityLevel.label}
              {currentValue !== activityLevel.impact && (
                <span className={styles.defaultValue}>
                  (Default: {activityLevel.impact.toFixed(2)}x)
                </span>
              )}
            </label>
            <input
              type="number"
              value={currentValue}
              onChange={(e) => handleActivityCoefficientChange(level, e.target.value)}
              step="0.1"
              min="0"
              className={styles.numberInput}
            />
          </div>
        );
      })}
    </div>
  )}
</div>
        {/* Absorption Modifiers Section */}
        <div className={styles.constantsSection}>
          <h3 className={styles.subsectionTitle} onClick={() => toggleSection('absorption')}>
            Absorption Modifiers
            <span>{expandedSections.absorption ? '▼' : '▶'}</span>
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
            <span>{expandedSections.diseases ? '▼' : '▶'}</span>
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
    <span>{expandedSections.medications ? '▼' : '▶'}</span>
  </h3>
  {expandedSections.medications && (
    <div className={styles.constantsWrapper}>
      {/* Medication Selection Listbox */}
      <div className={styles.medicationSelector}>
        <label className={styles.selectorLabel}>Select Medications</label>
        <div className={styles.multiSelectContainer}>
          {Object.entries(constants.medication_factors || {}).map(([medication, data]) => (
            <div key={medication} className={styles.checkboxItem}>
              <input
                type="checkbox"
                id={`med-${medication}`}
                checked={constants.active_medications?.includes(medication)}
                onChange={() => handleActiveMedicationToggle(medication)}
              />
              <label htmlFor={`med-${medication}`}>
                {medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                <span className={styles.medicationDescription}>{data.description}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Active Medications Cards */}
      <div className={styles.activeMedicationsGrid}>
        {Object.entries(constants.medication_factors || {})
          .filter(([medication]) => constants.active_medications?.includes(medication))
          .map(([medication, data]) => (
            <MedicationSchedule
              key={medication}
              medication={medication}
              medicationData={data}
              patientId={patientId}
              onScheduleUpdate={handleMedicationScheduleUpdate}
              isActive={true}
              onActiveMedicationToggle={handleActiveMedicationToggle}
              onMedicationFactorChange={handleMedicationFactorChange}
              className={styles.medicationCard}
            />
          ))}
      </div>
    </div>
  )}
</div>
        {/* Action Buttons */}
        <div className={styles.buttonGroup}>
          <button
            onClick={resetToDefaults}
            className={styles.resetButton}
            disabled={loading}
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSubmit}
            className={styles.submitButton}
            disabled={loading}
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedPatientConstantsUI;