import React, { useState, useEffect } from 'react';
import { fetchPatientConstants } from './EnhancedPatientConstantsCalc';
import { useConstants } from '../contexts/ConstantsContext';

import styles from './PatientConstants.module.css';

const PatientConstants = () => {
  const [constants, setConstants] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const getConstants = async () => {
      try {
        const fetchedConstants = await fetchPatientConstants();
        setConstants(fetchedConstants);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    getConstants();
  }, []);

  if (loading) return <div>Loading constants...</div>;
  if (error) return <div>Error loading constants: {error}</div>;
  if (!constants) return null;

  return (
    <div className={styles.constantsContainer}>
      <h3>Your Treatment Constants</h3>

      <div className={styles.constantsGrid}>
        <div className={styles.constantGroup}>
          <h4>Basic Constants</h4>
          <p>Insulin to Carb Ratio: {constants.insulin_to_carb_ratio}</p>
          <p>Correction Factor: {constants.correction_factor}</p>
          <p>Target Glucose: {constants.target_glucose} mg/dL</p>
          <p>Protein Factor: {constants.protein_factor}</p>
          <p>Fat Factor: {constants.fat_factor}</p>
        </div>

        <div className={styles.constantGroup}>
          <h4>Activity Impact</h4>
          {Object.entries(constants.activity_coefficients).map(([level, value]) => (
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
          {Object.entries(constants.absorption_modifiers).map(([type, value]) => (
            <p key={type}>
              {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}x
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PatientConstants;