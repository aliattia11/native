import React, { useState, useEffect } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './MedicationSchedule.module.css';
import axios from 'axios';
import { validateMedicationSchedule } from './EnhancedPatientConstantsCalc';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';
// Replace TimeEffect import with calculateMedicationEffect from insulinUtils
import { calculateMedicationEffect } from '../utils/insulinUtils';

const MedicationSchedule = ({
  medication,
  medicationData,
  patientId,
  onScheduleUpdate,
  className,
  isActive,
  onActiveMedicationToggle,
  onMedicationFactorChange
}) => {
  const {
    updateMedicationSchedule,
    medicationSchedules,
    fetchMedicationSchedules,
    refreshConstants
  } = useConstants();

  const [schedule, setSchedule] = useState({
    startDate: '',
    endDate: '',
    dailyTimes: [''],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [currentSchedule, setCurrentSchedule] = useState(null);
  const [medicationEffect, setMedicationEffect] = useState(null);

  useEffect(() => {
    const loadInitialSchedule = async () => {
      try {
        const existingSchedule = medicationSchedules[medication];

        if (existingSchedule) {
          setCurrentSchedule(existingSchedule);
          setSchedule({
            startDate: existingSchedule.startDate.slice(0, 10),
            endDate: existingSchedule.endDate.slice(0, 10),
            dailyTimes: existingSchedule.dailyTimes
          });
        } else {
          const token = localStorage.getItem('token');
          const response = await axios.get(
            `http://localhost:5000/api/medication-schedule/${patientId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (response.data.schedules) {
            const medicationSchedule = response.data.schedules.find(
              schedule => schedule.medication === medication
            );

            if (medicationSchedule) {
              setCurrentSchedule(medicationSchedule);
              setSchedule({
                startDate: medicationSchedule.startDate.slice(0, 10),
                endDate: medicationSchedule.endDate.slice(0, 10),
                dailyTimes: medicationSchedule.dailyTimes
              });
            } else {
              // Initialize with default values
              const currentDate = new Date();
              currentDate.setHours(0, 0, 0, 0);
              setSchedule({
                startDate: currentDate.toISOString().slice(0, 10),
                endDate: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
                  .toISOString().slice(0, 10),
                dailyTimes: ['']
              });
            }
          }
        }
      } catch (error) {
        console.error('Error loading schedule:', error);
        setError(error.message);
        // Set default values on error
        const currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        setSchedule({
          startDate: currentDate.toISOString().slice(0, 10),
          endDate: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000)
            .toISOString().slice(0, 10),
          dailyTimes: ['']
        });
      }
    };

    loadInitialSchedule();

    // Calculate medication effect if duration-based
    if (medicationData?.duration_based && currentSchedule) {
      // Use imported calculateMedicationEffect instead of TimeEffect
      const effect = calculateMedicationEffect(
        medication,
        medicationData,
        currentSchedule
      );
      setMedicationEffect(effect);
    }

    // Set up an interval to recalculate medication effect every minute
    const effectInterval = setInterval(() => {
      if (medicationData?.duration_based && currentSchedule) {
        // Use imported calculateMedicationEffect instead of TimeEffect
        const effect = calculateMedicationEffect(
          medication,
          medicationData,
          currentSchedule
        );
        setMedicationEffect(effect);
      }
    }, 60000); // Update every minute

    return () => clearInterval(effectInterval);
  }, [medication, medicationData, medicationSchedules, patientId, currentSchedule]);

  const validateSchedule = () => {
    return validateMedicationSchedule(schedule);
  };

  const handleAddTime = () => {
    setSchedule(prev => ({
      ...prev,
      dailyTimes: [...prev.dailyTimes, '']
    }));
  };

  const handleRemoveTime = (index) => {
    setSchedule(prev => ({
      ...prev,
      dailyTimes: prev.dailyTimes.filter((_, i) => i !== index)
    }));
  };

  const handleTimeChange = (index, value) => {
    setSchedule(prev => {
      const updatedTimes = [...prev.dailyTimes];
      updatedTimes[index] = value;
      return {
        ...prev,
        dailyTimes: updatedTimes.sort()
      };
    });
  };

  const handleStartDateChange = (dateValue) => {
    const formattedDate = dateValue.slice(0, 10);
    setSchedule(prev => ({...prev, startDate: formattedDate}));
  };

  const handleEndDateChange = (dateValue) => {
    const formattedDate = dateValue.slice(0, 10);
    setSchedule(prev => ({...prev, endDate: formattedDate}));
  };

  const handleScheduleUpdate = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const validationErrors = validateSchedule();
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join('\n'));
      }

      const updatedSchedule = {
        startDate: new Date(schedule.startDate).toISOString(),
        endDate: new Date(schedule.endDate).toISOString(),
        dailyTimes: schedule.dailyTimes.filter(time => time).sort()
      };

      const token = localStorage.getItem('token');
      const response = await axios({
        method: 'post',
        url: `http://localhost:5000/api/medication-schedule/${patientId}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          medication,
          schedule: updatedSchedule
        }
      });

      if (response.data.schedule) {
        setCurrentSchedule(response.data.schedule);
        await Promise.all([
          refreshConstants(),
          fetchMedicationSchedules(patientId)
        ]);

        if (onScheduleUpdate) {
          await onScheduleUpdate();
        }

        window.dispatchEvent(new CustomEvent('medicationScheduleUpdated', {
          detail: { medication, schedule: response.data.schedule }
        }));
      }
    } catch (error) {
      console.error('Error updating medication schedule:', error);
      setError(error.response?.data?.message || error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate next dose based on schedule
  const getNextDoseInfo = () => {
    if (!currentSchedule?.dailyTimes?.length) return null;

    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Find the next dose time
    const sortedTimes = [...currentSchedule.dailyTimes].sort();
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

  const nextDose = getNextDoseInfo();

  // Format time difference until next dose
  const formatTimeUntilNextDose = () => {
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

  // Calculate medication effect strength as percentage
  const getEffectPercentage = () => {
    if (!medicationEffect) return 0;
    return ((medicationEffect.factor - 1) * 100).toFixed(1);
  };

  // Determine effect strength visualization class
  const getEffectClass = () => {
    if (!medicationEffect) return '';

    const effect = medicationEffect.factor - 1;
    if (effect > 0.1) return styles.strongEffect;
    if (effect > 0) return styles.moderateEffect;
    if (effect < -0.1) return styles.strongNegativeEffect;
    if (effect < 0) return styles.moderateNegativeEffect;
    return '';
  };

  return (
    <div className={`${styles.medicationSchedule} ${className || ''}`}>
      <div className={styles.scheduleContainer}>
        <div className={styles.headerRow}>
          <div className={styles.medicationHeader}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={() => onActiveMedicationToggle(medication)}
              className={styles.medicationCheckbox}
            />
            <h3 className={styles.medicationTitle}>
              {medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </h3>
          </div>

          {medicationData && (
            <div className={styles.factorInputs}>
              <label>Factor:</label>
              <input
                type="number"
                value={medicationData.factor}
                onChange={(e) => onMedicationFactorChange(medication, e.target.value)}
                step="0.1"
                disabled={!isActive}
                className={styles.factorInput}
              />
              <span className={styles.factorDescription}>{medicationData.description}</span>
            </div>
          )}
        </div>

        {isActive && (
          <>
            <div className={styles.dateTimeContainer}>
              <div className={styles.dateInputsRow}>
                <div className={styles.inputGroup}>
                  <label htmlFor={`startDate-${medication}`}>Start Date:</label>
                  <TimeInput
                    mode="timepoint"
                    value={schedule.startDate ? `${schedule.startDate}T00:00` : ''}
                    onChange={handleStartDateChange}
                    className={styles.dateTimeInput}
                    label=""
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor={`endDate-${medication}`}>End Date:</label>
                  <TimeInput
                    mode="timepoint"
                    value={schedule.endDate ? `${schedule.endDate}T00:00` : ''}
                    onChange={handleEndDateChange}
                    className={styles.dateTimeInput}
                    label=""
                  />
                </div>
              </div>

              <div className={styles.timesList}>
                <h4>Daily Medication Times</h4>
                {schedule.dailyTimes.map((time, index) => (
                  <div key={index} className={styles.timeInputGroup}>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => handleTimeChange(index, e.target.value)}
                      className={styles.timeInput}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveTime(index)}
                      className={styles.removeTimeButton}
                      disabled={schedule.dailyTimes.length === 1}
                      title="Remove time"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddTime}
                  className={styles.addTimeButton}
                  title="Add another time"
                >
                  + Add Time
                </button>
              </div>

              <button
                onClick={handleScheduleUpdate}
                disabled={isSubmitting || !schedule.startDate || !schedule.endDate || schedule.dailyTimes.some(time => !time)}
                className={styles.updateButton}
              >
                {isSubmitting ? 'Updating...' : 'Update Schedule'}
              </button>
            </div>

            {error && (
              <div className={styles.error}>
                {error.split('\n').map((err, index) => (
                  <p key={index}>{err}</p>
                ))}
              </div>
            )}

            {currentSchedule && (
              <div className={styles.currentScheduleContainer}>
                <h4>Current Schedule</h4>
                <div className={styles.currentScheduleDetails}>
                  <div className={styles.scheduleRow}>
                    <span>Start Date:</span>
                    <span>{TimeManager.formatDateTime(currentSchedule.startDate).split(',')[0]}</span>
                  </div>
                  <div className={styles.scheduleRow}>
                    <span>End Date:</span>
                    <span>{TimeManager.formatDateTime(currentSchedule.endDate).split(',')[0]}</span>
                  </div>
                  <div className={styles.scheduleRow}>
                    <span>Daily Times:</span>
                    <span>{currentSchedule.dailyTimes.join(', ')}</span>
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
                        <span>Time Until Next:</span>
                        <span className={styles.timeUntil}>
                          {formatTimeUntilNextDose()}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {medicationData.duration_based && (
              <div className={styles.pharmacokinetics}>
                <h4>Pharmacokinetic Profile</h4>
                <div className={styles.kineticRow}>
                  <span>Onset:</span>
                  <span>{medicationData.onset_hours} hours</span>
                </div>
                <div className={styles.kineticRow}>
                  <span>Peak Effect:</span>
                  <span>{medicationData.peak_hours} hours</span>
                </div>
                <div className={styles.kineticRow}>
                  <span>Duration:</span>
                  <span>{medicationData.duration_hours} hours</span>
                </div>

                {medicationEffect && (
                  <div className={styles.currentEffect}>
                    <h4>Current Effect</h4>
                    <div className={styles.effectRow}>
                      <span>Status:</span>
                      <span>{medicationEffect.status}</span>
                    </div>

                    {medicationEffect.lastDose && (
                      <>
                        <div className={styles.effectRow}>
                          <span>Last Dose:</span>
                          <span>{TimeManager.formatDateTime(medicationEffect.lastDose)}</span>
                        </div>
                        <div className={styles.effectRow}>
                          <span>Hours Since Dose:</span>
                          <span>{medicationEffect.hoursSinceLastDose?.toFixed(1)}h</span>
                        </div>
                      </>
                    )}

                    <div className={styles.effectRow}>
                      <span>Current Effect:</span>
                      <span className={`${styles.effectStrength} ${getEffectClass()}`}>
                        {getEffectPercentage()}%
                        {parseFloat(getEffectPercentage()) > 0 ? ' increase' : ' decrease'}
                      </span>
                    </div>

                    <div className={styles.effectVisualization}>
                      <div
                        className={styles.effectBar}
                        style={{
                          width: `${Math.min(100, Math.abs(getEffectPercentage()))}%`,
                          backgroundColor: parseFloat(getEffectPercentage()) >= 0 ? '#4caf50' : '#f44336'
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MedicationSchedule;