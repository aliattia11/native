import React from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './PatientConstants.module.css';

const PatientConstants = () => {
  const { patientConstants, loading, error, refreshConstants } = useConstants();

  if (loading) return <div>Loading constants...</div>;
  if (error) return <div>Error loading constants: {error}</div>;
  if (!patientConstants) return null;

  return (
    <div className={styles.constantsContainer}>
      <h3>Your Treatment Constants</h3>

      <div className={styles.constantsGrid}>
        <div className={styles.constantGroup}>
          <h4>Basic Constants</h4>
          <p>Insulin to Carb Ratio: {patientConstants.insulin_to_carb_ratio}</p>
          <p>Correction Factor: {patientConstants.correction_factor}</p>
          <p>Target Glucose: {patientConstants.target_glucose} mg/dL</p>
          <p>Protein Factor: {patientConstants.protein_factor}</p>
          <p>Fat Factor: {patientConstants.fat_factor}</p>
        </div>

        <div className={styles.constantGroup}>
          <h4>Activity Impact</h4>
          {Object.entries(patientConstants.activity_coefficients || {}).map(([level, value]) => (
            <p key={level}>
              {level === "-2" ? "Sleep" :
               level === "-1" ? "Very Low Activity" :
               level === "0" ? "Normal Activity" :
               level === "1" ? "High Activity" :
               "Vigorous Activity"}: {value}
            </p>
          ))}
        </div>

        <div className={styles.constantGroup}>
          <h4>Absorption Modifiers</h4>
          {Object.entries(patientConstants.absorption_modifiers || {}).map(([type, value]) => (
            <p key={type}>
              {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}x
            </p>
          ))}
        </div>
      </div>

      <button
        className={styles.refreshButton}
        onClick={refreshConstants}
      >
        Refresh Constants
      </button>
    </div>
  );
};

export default PatientConstants;