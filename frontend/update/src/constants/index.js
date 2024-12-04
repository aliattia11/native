import React, { useState, useEffect } from 'react';
import styles from './PatientConstants.module.css';

const activityLevels = [
  { value: -2, label: 'Sleep' },
  { value: -1, label: 'Very Low Activity' },
  { value: 0, label: 'Normal Activity' },
  { value: 1, label: 'High Activity' },
  { value: 2, label: 'Vigorous Activity' }
];

const PatientConstants = ({ constants, onUpdate }) => {
  const [localConstants, setLocalConstants] = useState(constants);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    setLocalConstants(constants);
    if (constants?.last_updated) {
      setLastUpdated(new Date(constants.last_updated));
    }
  }, [constants]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLocalConstants(prev => ({
      ...prev,
      [name]: parseFloat(value)
    }));
  };

  const handleActivityChange = (value, activityValue) => {
    setLocalConstants(prev => ({
      ...prev,
      ACTIVITY_COEFFICIENTS: {
        ...prev.ACTIVITY_COEFFICIENTS,
        [activityValue.toString()]: parseFloat(value)
      }
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdate(localConstants);
  };

  if (!localConstants) return <p>Loading patient constants...</p>;

  return (
    <div className={styles.patientConstants}>
      <h3 className={styles.sectionTitle}>Patient Settings</h3>
      {lastUpdated && (
        <p className={styles.lastUpdated}>
          Last updated: {lastUpdated.toLocaleDateString()} {lastUpdated.toLocaleTimeString()}
        </p>
      )}

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.constantsWrapper}>
          <div className={styles.constantsSection}>
            <h4 className={styles.subsectionTitle}>Basic Constants</h4>
            <div className={styles.formGroup}>
              <label htmlFor="insulin_to_carb_ratio">Insulin to Carb Ratio:</label>
              <input
                type="number"
                id="insulin_to_carb_ratio"
                name="insulin_to_carb_ratio"
                value={localConstants.insulin_to_carb_ratio}
                onChange={handleChange}
                step="0.01"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="correction_factor">Correction Factor:</label>
              <input
                type="number"
                id="correction_factor"
                name="correction_factor"
                value={localConstants.correction_factor}
                onChange={handleChange}
                step="1"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="target_glucose">Target Glucose:</label>
              <input
                type="number"
                id="target_glucose"
                name="target_glucose"
                value={localConstants.target_glucose}
                onChange={handleChange}
                step="1"
              />
            </div>
          </div>

          <div className={styles.constantsSection}>
            <h4 className={styles.subsectionTitle}>Activity Coefficients</h4>
            {activityLevels.map(({ value, label }) => (
              <div key={value} className={styles.formGroup}>
                <label htmlFor={`activity-${value}`}>{label}:</label>
                <input
                  type="number"
                  id={`activity-${value}`}
                  value={localConstants.ACTIVITY_COEFFICIENTS?.[value.toString()] || 0}
                  onChange={(e) => handleActivityChange(e.target.value, value)}
                  step="0.1"
                />
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className={styles.updateButton}>
          Update All Settings
        </button>
      </form>
    </div>
  );
};

export default PatientConstants;