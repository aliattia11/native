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
          {/* Basic Constants Section */}
          <div className={styles.constantGroup}>
            <h4>Basic Constants</h4>
            <p>Insulin to Carb Ratio: {patientConstants.insulin_to_carb_ratio}</p>
            <p>Correction Factor: {patientConstants.correction_factor}</p>
            <p>Target Glucose: {patientConstants.target_glucose} mg/dL</p>
            <p>Protein Factor: {patientConstants.protein_factor}</p>
            <p>Fat Factor: {patientConstants.fat_factor}</p>
          </div>

          {/* Activity Impact Section */}
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

          {/* Absorption Modifiers Section */}
          <div className={styles.constantGroup}>
            <h4>Absorption Modifiers</h4>
            {Object.entries(patientConstants.absorption_modifiers || {}).map(([type, value]) => (
                <p key={type}>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}: {value}x
                </p>
            ))}
          </div>

          {/* Active Health Conditions Section */}
          <div className={styles.constantGroup}>
            <h4>Active Health Conditions</h4>
            {patientConstants.active_conditions?.length > 0 ? (
                patientConstants.active_conditions.map(condition => {
                  const conditionData = patientConstants.disease_factors?.[condition] || {};
                  return (
                      <p key={condition}>
                        <strong>
                          {condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </strong>
                        <br/>
                        Impact Factor: {conditionData.factor}x
                        <br/>
                        <span className={styles.description}>{conditionData.description}</span>
                      </p>
                  );
                })
            ) : (
                <p>No active health conditions</p>
            )}
          </div>

          {/* Active Medications Section */}
          <div className={styles.constantGroup}>
            <h4>Active Medications</h4>
            {patientConstants.active_medications?.length > 0 ? (
                patientConstants.active_medications.map(medication => {
                  const medData = patientConstants.medication_factors?.[medication] || {};
                  return (
                      <p key={medication}>
                        <strong>
                          {medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </strong>
                        <br/>
                        Impact Factor: {medData.factor}x
                        <br/>
                        <span className={styles.description}>{medData.description}</span>
                        {medData.duration_based && (
                            <span className={styles.durationInfo}>
                      <br/>
                      Onset: {medData.onset_hours}h
                      <br/>
                      Peak: {medData.peak_hours}h
                      <br/>
                      Duration: {medData.duration_hours}h
                    </span>
                        )}
                      </p>
                  );
                })
            ) : (
                <p>No active medications</p>
            )}
          </div>
        </div>
        <div className={styles.constantGroup}>
          <h4>Medication Schedules</h4>
          {Object.entries(patientConstants.medication_schedules || {}).map(([medication, schedule]) => (
              <div key={medication} className={styles.medicationSchedule}>
                <h5>{medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>
                <p>Start Date: {new Date(schedule.startDate).toLocaleDateString()}</p>
                <p>End Date: {new Date(schedule.endDate).toLocaleDateString()}</p>
                <p>Daily Times: {schedule.dailyTimes.join(', ')}</p>
              </div>
          ))}
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