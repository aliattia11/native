import React, { useEffect, useState } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import { ACTIVITY_LEVELS } from '../constants'; // Import from index.js
import axios from 'axios';
import styles from './PatientConstants.module.css';

const PatientConstants = () => {
  const { patientConstants, loading, error, refreshConstants } = useConstants();
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempSchedule, setTempSchedule] = useState(null);

    const renderActivitySection = () => {
    if (loading) {
      return (
        <div className={styles.constantGroup}>
          <h4>Activity Impact</h4>
          <div className={styles.loading}>Loading activity impacts...</div>
        </div>
      );
    }

    if (error) {
      return (
        <div className={styles.constantGroup}>
          <h4>Activity Impact</h4>
          <div className={styles.error}>Error loading activity impacts: {error}</div>
        </div>
      );
    }

    const coefficients = patientConstants.activity_coefficients || {};

    return (
      <div className={styles.constantGroup}>
        <h4>Activity Impact</h4>
        {ACTIVITY_LEVELS.map(level => {
          const value = coefficients[level.value] || level.impact;
          return (
            <div key={level.value} className={styles.activityRow}>
              <span className={styles.activityLabel}>{level.label}</span>
              <span className={styles.activityValue}>
                {value.toFixed(2)}x
                {level.impact !== value && (
                  <span className={styles.defaultValue}>
                    (Default: {level.impact.toFixed(2)}x)
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    console.log('Current user ID:', localStorage.getItem('userId'));
    console.log('Current token:', localStorage.getItem('token'));
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      refreshConstants();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [refreshConstants]);

  const handleScheduleUpdate = async (medication, updatedSchedule) => {
    try {
      setIsSubmitting(true);
      setScheduleError(null);

      const token = localStorage.getItem('token');
      const userId = patientConstants.patient_id;

      const response = await axios.post(
        `http://localhost:5000/api/medication-schedule/${userId}`,
        {
          medication,
          schedule: {
            startDate: new Date(updatedSchedule.startDate).toISOString(),
            endDate: new Date(updatedSchedule.endDate).toISOString(),
            dailyTimes: updatedSchedule.dailyTimes.filter(time => time).sort()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.schedule) {
        await refreshConstants();
        setEditingSchedule(null);
        setTempSchedule(null);
      }
    } catch (error) {
      console.error('Error updating schedule:', error.response?.data || error);
      setScheduleError(error.response?.data?.message || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

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
         {renderActivitySection()}

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
                  <br />
                  Impact Factor: {conditionData.factor}x
                  <br />
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
                  <br />
                  Impact Factor: {medData.factor}x
                  <br />
                  <span className={styles.description}>{medData.description}</span>
                  {medData.duration_based && (
                    <span className={styles.durationInfo}>
                      <br />
                      Onset: {medData.onset_hours}h
                      <br />
                      Peak: {medData.peak_hours}h
                      <br />
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

      {/* Medication Schedules Section - Continued in Part 2 */}
      {/* Medication Schedules Section */}
      <div className={styles.constantGroup}>
        <h4>Medication Schedules</h4>
        {patientConstants.active_medications?.length > 0 ? (
          patientConstants.active_medications.map(medication => {
            const schedule = patientConstants.medication_schedules?.[medication] || {
              startDate: new Date().toISOString(),
              endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              dailyTimes: ['']
            };
            const medData = patientConstants.medication_factors?.[medication] || {};
            const isEditing = editingSchedule === medication;

            return (
              <div key={medication} className={styles.medicationSchedule}>
                <h5>{medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>

                {isEditing ? (
                  <div className={styles.scheduleEditor}>
                    <div className={styles.dateInputs}>
                      <div className={styles.inputGroup}>
                        <label>Start Date:</label>
                        <input
                          type="date"
                          value={tempSchedule?.startDate.slice(0, 10) || schedule.startDate.slice(0, 10)}
                          onChange={(e) => {
                            setTempSchedule(prev => ({
                              ...prev || schedule,
                              startDate: e.target.value
                            }));
                          }}
                          min={new Date().toISOString().slice(0, 10)}
                        />
                      </div>
                      <div className={styles.inputGroup}>
                        <label>End Date:</label>
                        <input
                          type="date"
                          value={tempSchedule?.endDate.slice(0, 10) || schedule.endDate.slice(0, 10)}
                          onChange={(e) => {
                            setTempSchedule(prev => ({
                              ...prev || schedule,
                              endDate: e.target.value
                            }));
                          }}
                          min={tempSchedule?.startDate.slice(0, 10) || schedule.startDate.slice(0, 10)}
                        />
                      </div>
                    </div>

                    <div className={styles.timeInputs}>
                      <label>Daily Times:</label>
                      {(tempSchedule?.dailyTimes || schedule.dailyTimes).map((time, index) => (
                        <div key={index} className={styles.timeInput}>
                          <input
                            type="time"
                            value={time}
                            onChange={(e) => {
                              const newTimes = [...(tempSchedule?.dailyTimes || schedule.dailyTimes)];
                              newTimes[index] = e.target.value;
                              setTempSchedule(prev => ({
                                ...prev || schedule,
                                dailyTimes: newTimes.sort()
                              }));
                            }}
                          />
                          {(tempSchedule?.dailyTimes || schedule.dailyTimes).length > 1 && (
                            <button
                              onClick={() => {
                                const newTimes = (tempSchedule?.dailyTimes || schedule.dailyTimes)
                                  .filter((_, i) => i !== index);
                                setTempSchedule(prev => ({
                                  ...prev || schedule,
                                  dailyTimes: newTimes
                                }));
                              }}
                              className={styles.removeTimeButton}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setTempSchedule(prev => ({
                            ...prev || schedule,
                            dailyTimes: [...(prev?.dailyTimes || schedule.dailyTimes), '']
                          }));
                        }}
                        className={styles.addTimeButton}
                      >
                        Add Time
                      </button>
                    </div>

                    {scheduleError && (
                      <div className={styles.error}>{scheduleError}</div>
                    )}

                    <div className={styles.buttonGroup}>
                      <button
                        onClick={async () => {
                          if (tempSchedule) {
                            await handleScheduleUpdate(medication, tempSchedule);
                          }
                        }}
                        className={styles.saveButton}
                        disabled={isSubmitting}
                      >
                        Save Changes
                      </button>
                      <button
                        onClick={() => {
                          setTempSchedule(null);
                          setEditingSchedule(null);
                        }}
                        className={styles.cancelButton}
                        disabled={isSubmitting}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.scheduleView}>
                    <p>Start Date: {new Date(schedule.startDate).toLocaleDateString()}</p>
                    <p>End Date: {new Date(schedule.endDate).toLocaleDateString()}</p>
                    <p>Daily Times: {schedule.dailyTimes.join(', ')}</p>
                    {medData.duration_based && (
                      <div className={styles.medicationInfo}>
                        <p>Onset: {medData.onset_hours}h</p>
                        <p>Peak: {medData.peak_hours}h</p>
                        <p>Duration: {medData.duration_hours}h</p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setEditingSchedule(medication);
                        setTempSchedule(null);
                      }}
                      className={styles.editButton}
                    >
                      Edit Schedule
                    </button>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <p>No active medications</p>
        )}
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