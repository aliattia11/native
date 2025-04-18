import React, { useEffect, useState } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import { ACTIVITY_LEVELS } from '../constants';
import axios from 'axios';
import styles from './PatientConstants.module.css';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';
import TimeEffect from '../utils/TimeEffect';

const PatientConstants = () => {
  const { patientConstants, loading, error, refreshConstants } = useConstants();
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleError, setScheduleError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempSchedule, setTempSchedule] = useState(null);
  const [medicationEffects, setMedicationEffects] = useState({});

  // Simple date formatting function since TimeManager might not have it
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString();
    } catch (e) {
      return dateString;
    }
  };

  // Simple datetime formatting function
  const formatDateTime = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return dateString;
    }
  };

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
    // Initial constants load
    refreshConstants();

    // Set up interval to refresh constants and calculate medication effects
    const intervalId = setInterval(() => {
      refreshConstants();
      calculateMedicationEffects();
    }, 60000);

    return () => clearInterval(intervalId);
  }, [refreshConstants]);

  // Calculate medication effects when constants change
  useEffect(() => {
    if (patientConstants && !loading) {
      calculateMedicationEffects();
    }
  }, [patientConstants, loading]);

  // Calculate current effects for all medications
  const calculateMedicationEffects = () => {
    if (!patientConstants?.active_medications) return;

    const effects = {};
    patientConstants.active_medications.forEach(medication => {
      const medData = patientConstants.medication_factors?.[medication];
      const schedule = patientConstants.medication_schedules?.[medication];

      if (medData && schedule && medData.duration_based) {
        const effect = TimeEffect.calculateMedicationEffect(medication, medData, schedule);
        if (effect) {
          effects[medication] = effect;
        }
      }
    });

    setMedicationEffects(effects);
  };

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
        calculateMedicationEffects();
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

  // Calculate next dose time for a medication
  const getNextDoseInfo = (medication) => {
    const schedule = patientConstants?.medication_schedules?.[medication];
    if (!schedule?.dailyTimes?.length) return null;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Find the next dose time
    const sortedTimes = [...schedule.dailyTimes].sort();
    let nextDose = null;

    // Check if there's a dose time later today
    for (const timeStr of sortedTimes) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (hours > currentHour || (hours === currentHour && minutes > currentMinute)) {
        nextDose = {
          time: timeStr,
          date: today,
          isToday: true
        };
        break;
      }
    }

    // If no dose time later today, find first dose tomorrow
    if (!nextDose && sortedTimes.length > 0) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      nextDose = {
        time: sortedTimes[0],
        date: tomorrowStr,
        isToday: false
      };
    }

    return nextDose;
  };

  // Format time until next dose
  const formatTimeUntilNextDose = (nextDose) => {
    if (!nextDose) return "No scheduled doses";

    const now = new Date();
    const nextDoseDate = new Date(`${nextDose.date}T${nextDose.time}`);
    const diffMs = nextDoseDate - now;

    if (diffMs < 0) return "Past due";

    const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHrs === 0) {
      return `In ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
    }
    return `In ${diffHrs} hour${diffHrs !== 1 ? 's' : ''} and ${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
  };

  if (loading) return <div className={styles.loading}>Loading constants...</div>;
  if (error) return <div className={styles.error}>Error loading constants: {error}</div>;
  if (!patientConstants) return null;

  return (
    <div className={styles.constantsContainer}>
      <h3>Your Treatment Constants</h3>

      <div className={styles.constantsGrid}>
        {/* Basic Constants Section */}
        <div className={styles.constantGroup}>
          <h4>Basic Constants</h4>
          <p>ICR: <span className={styles.constantValue}>{patientConstants.insulin_to_carb_ratio}</span></p>
          <p>CF: <span className={styles.constantValue}>{patientConstants.correction_factor}</span></p>
          <p>Target: <span className={styles.constantValue}>{patientConstants.target_glucose}</span> mg/dL</p>
          <p>Protein: <span className={styles.constantValue}>{patientConstants.protein_factor}</span></p>
          <p>Fat: <span className={styles.constantValue}>{patientConstants.fat_factor}</span></p>
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
              const effect = medicationEffects[medication];
              const effectPercentage = effect ? ((effect.factor - 1) * 100).toFixed(1) : 0;

              return (
                <div key={medication} className={styles.medicationItem}>
                  <strong>
                    {medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </strong>
                  <br />
                  Impact Factor: {medData.factor}x
                  <br />
                  <span className={styles.description}>{medData.description}</span>

                  {medData.duration_based && (
                    <div className={styles.durationInfo}>
                      <div className={styles.pharmacokinetics}>
                        <span>Onset: {medData.onset_hours}h</span>
                        <span>Peak: {medData.peak_hours}h</span>
                        <span>Duration: {medData.duration_hours}h</span>
                      </div>

                      {effect && (
                        <div className={styles.currentEffect}>
                          <div className={styles.effectHeader}>
                            <span>Current Effect:</span>
                            <span className={
                              parseFloat(effectPercentage) > 5 ? styles.strongEffect :
                              parseFloat(effectPercentage) > 0 ? styles.moderateEffect :
                              parseFloat(effectPercentage) < -5 ? styles.strongNegativeEffect :
                              parseFloat(effectPercentage) < 0 ? styles.moderateNegativeEffect :
                              ''
                            }>
                              {effectPercentage > 0 ? '+' : ''}{effectPercentage}%
                            </span>
                          </div>

                          {effect.lastDose && (
                            <div className={styles.effectDetail}>
                              <span>Last dose:</span>
                              <span>{formatDateTime(effect.lastDose)}</span>
                              <span>({effect.hoursSinceLastDose?.toFixed(1)}h ago)</span>
                            </div>
                          )}

                          <div className={styles.effectDetail}>
                            <span>Status:</span>
                            <span>{effect.status}</span>
                          </div>

                          <div className={styles.effectBar}>
                            <div
                              className={styles.effectBarFill}
                              style={{
                                width: `${Math.min(100, Math.abs(effectPercentage))}%`,
                                backgroundColor: parseFloat(effectPercentage) >= 0 ?
                                  '#4caf50' : '#f44336'
                              }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <p>No active medications</p>
          )}
        </div>
      </div>

      {/* Medication Schedules Section */}
      <div className={`${styles.constantGroup} ${styles.fullWidth}`}>
        <h4>Medication Schedules</h4>
        <div className={styles.medicationSchedulesGrid}>
          {patientConstants.active_medications?.length > 0 ? (
            patientConstants.active_medications.map(medication => {
              const schedule = patientConstants.medication_schedules?.[medication] || {
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                dailyTimes: ['']
              };
              const medData = patientConstants.medication_factors?.[medication] || {};
              const isEditing = editingSchedule === medication;
              const nextDose = getNextDoseInfo(medication);

              return (
                <div key={medication} className={styles.medicationSchedule}>
                  <h5>{medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>

                  {isEditing ? (
                    <div className={styles.scheduleEditor}>
                      <div className={styles.dateInputs}>
                        <div className={styles.inputGroup}>
                          <label>Start Date:</label>
                          <TimeInput
                            mode="timepoint"
                            value={tempSchedule?.startDate || schedule.startDate}
                            onChange={(value) => {
                              setTempSchedule(prev => ({
                                ...prev || schedule,
                                startDate: value
                              }));
                            }}
                            dateOnly={true}
                            minDate={TimeManager.getCurrentTimeISOString()}
                            className={styles.dateTimeInput}
                          />
                        </div>

                        <div className={styles.inputGroup}>
                          <label>End Date:</label>
                          <TimeInput
                            mode="timepoint"
                            value={tempSchedule?.endDate || schedule.endDate}
                            onChange={(value) => {
                              setTempSchedule(prev => ({
                                ...prev || schedule,
                                endDate: value
                              }));
                            }}
                            dateOnly={true}
                            minDate={tempSchedule?.startDate || schedule.startDate}
                            className={styles.dateTimeInput}
                          />
                        </div>
                      </div>

                      <div className={styles.timeInputs}>
                        <h6>Medication Times</h6>
                        {(tempSchedule?.dailyTimes || schedule.dailyTimes).map((time, index) => (
                          <div key={index} className={styles.timeInputRow}>
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
                              className={styles.timeInputField}
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
                                title="Remove this time"
                              >
                                ×
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
                          + Add Time
                        </button>
                      </div>

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
                          Save Schedule
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

                      {scheduleError && (
                        <div className={styles.error}>{scheduleError}</div>
                      )}
                    </div>
                  ) : (
                    <div className={styles.scheduleView}>
                      <div className={styles.scheduleDetails}>
                        <div className={styles.scheduleRow}>
                          <span>Start:</span>
                          <span>{formatDate(schedule.startDate)}</span>
                        </div>
                        <div className={styles.scheduleRow}>
                          <span>End:</span>
                          <span>{formatDate(schedule.endDate)}</span>
                        </div>
                        <div className={styles.scheduleRow}>
                          <span>Daily Times:</span>
                          <span>{schedule.dailyTimes.join(', ') || 'None set'}</span>
                        </div>

                        {nextDose && (
                          <>
                            <div className={styles.scheduleRow}>
                              <span>Next Dose:</span>
                              <span className={styles.nextDose}>
                                {nextDose.time} {nextDose.isToday ? 'Today' : 'Tomorrow'}
                              </span>
                            </div>
                            <div className={styles.scheduleRow}>
                              <span>Time Until:</span>
                              <span className={styles.timeUntil}>
                                {formatTimeUntilNextDose(nextDose)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

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
      </div>

      <div className={styles.lastUpdated}>
        <span>Last updated: {new Date().toLocaleString()}</span>
        <button
          className={styles.refreshButton}
          onClick={() => {
            refreshConstants();
            calculateMedicationEffects();
          }}
        >
          Refresh Constants
        </button>
      </div>
    </div>
  );
};

export default PatientConstants;