import React, { useState, useEffect } from 'react';
import { usePatientConstants } from '../constants/EnhancedConstants';
import styles from './EnhancedPatientConstants.module.css';

const EnhancedPatientConstants = ({ patientId }) => {
  const { patientConstants, loading, error, updatePatientConstants } = usePatientConstants();
  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    activity: true,
    absorption: true
  });
  const [message, setMessage] = useState('');

  const handleBasicConstantChange = (key, value) => {
    updatePatientConstants({
      ...patientConstants,
      [key]: parseFloat(value) || 0
    });
  };

  const handleActivityCoefficientChange = (level, value) => {
    updatePatientConstants({
      ...patientConstants,
      activity_coefficients: {
        ...patientConstants.activity_coefficients,
        [level]: parseFloat(value) || 0
      }
    });
  };

  const handleAbsorptionModifierChange = (type, value) => {
    updatePatientConstants({
      ...patientConstants,
      absorption_modifiers: {
        ...patientConstants.absorption_modifiers,
        [type]: parseFloat(value) || 0
      }
    });
  };

  const handleSubmit = async () => {
    const success = await updatePatientConstants(patientConstants);
    if (success) {
      setMessage('Patient constants updated successfully');
      setTimeout(() => setMessage(''), 3000);
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
                  value={patientConstants.insulin_to_carb_ratio}
                  onChange={(e) => handleBasicConstantChange('insulin_to_carb_ratio', e.target.value)}
                  step="0.1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Correction Factor</label>
                <input
                  type="number"
                  value={patientConstants.correction_factor}
                  onChange={(e) => handleBasicConstantChange('correction_factor', e.target.value)}
                  step="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Target Glucose</label>
                <input
                  type="number"
                  value={patientConstants.target_glucose}
                  onChange={(e) => handleBasicConstantChange('target_glucose', e.target.value)}
                  step="1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Protein Factor</label>
                <input
                  type="number"
                  value={patientConstants.protein_factor}
                  onChange={(e) => handleBasicConstantChange('protein_factor', e.target.value)}
                  step="0.1"
                />
              </div>
              <div className={styles.formGroup}>
                <label>Fat Factor</label>
                <input
                  type="number"
                  value={patientConstants.fat_factor}
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
              {Object.entries(patientConstants.activity_coefficients).map(([level, value]) => (
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
              {Object.entries(patientConstants.absorption_modifiers).map(([type, value]) => (
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

        {message && (
          <div className={styles.message}>
            {message}
          </div>
        )}

        <div className={styles.buttonGroup}>
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

export default EnhancedPatientConstants;