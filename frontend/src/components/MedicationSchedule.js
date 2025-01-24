// frontend/src/components/MedicationSchedule.js
import { validateMedicationSchedule } from './EnhancedPatientConstantsCalc';
import React, { useState, useEffect } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './MedicationSchedule.module.css';
import axios from 'axios';

const MedicationSchedule = ({
  medication,
  medicationData,
  patientId,
  onScheduleUpdate,
  className
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

  useEffect(() => {
const loadInitialSchedule = async () => {
  try {
    // First check medication schedules from context
    const existingSchedule = medicationSchedules[medication];

    if (existingSchedule) {
      setCurrentSchedule(existingSchedule);
      setSchedule({
        startDate: existingSchedule.startDate.slice(0, 10),
        endDate: existingSchedule.endDate.slice(0, 10),
        dailyTimes: existingSchedule.dailyTimes
      });
    } else {
      // Try to fetch from backend directly
      const token = localStorage.getItem('token');

      // First try to get all schedules for the patient
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
          // Initialize with default values if no schedule exists
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
  }, [medication, medicationSchedules, patientId]);

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
    setSchedule(prev => ({
      ...prev,
      dailyTimes: prev.dailyTimes.map((time, i) =>
        i === index ? value : time
      ).sort()  // Sort times as they are entered
    }));
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

    // Update the schedule
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

      // Update context
      await Promise.all([
        refreshConstants(),
        fetchMedicationSchedules(patientId)
      ]);

      // Notify parent component
      if (onScheduleUpdate) {
        await onScheduleUpdate();
      }

      // Emit custom event for other components
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
 const timeValidator = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60;
  };

  const formatTime = (time) => {
    if (!time) return '';
    return time.split(':').slice(0, 2).join(':');
  };

 return (
    <div className={`${styles.medicationSchedule} ${className || ''}`}>
      <div className={styles.scheduleContainer}>
        <div className={styles.headerRow}>
          <h3 className={styles.medicationTitle}>
            {medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </h3>
        </div>

        <div className={styles.dateTimeContainer}>
          <div className={styles.inputGroup}>
            <label htmlFor={`startDate-${medication}`}>Start:</label>
            <input
              id={`startDate-${medication}`}
              type="date"
              value={schedule.startDate}
              onChange={(e) => setSchedule(prev => ({...prev, startDate: e.target.value}))}
              min={new Date().toISOString().slice(0, 10)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor={`endDate-${medication}`}>End:</label>
            <input
              id={`endDate-${medication}`}
              type="date"
              value={schedule.endDate}
              onChange={(e) => setSchedule(prev => ({...prev, endDate: e.target.value}))}
              min={schedule.startDate}
              className={styles.dateInput}
            />
          </div>

          <div className={styles.timesList}>
            {schedule.dailyTimes.map((time, index) => (
              <div key={index} className={styles.timeInput}>
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
              + Time
            </button>
          </div>

          <button
            onClick={handleScheduleUpdate}
            disabled={isSubmitting || !schedule.startDate || !schedule.endDate || schedule.dailyTimes.some(time => !time)}
            className={styles.updateButton}
          >
            {isSubmitting ? '...' : 'Update'}
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
          <div className={styles.currentSchedule}>
            Current: {new Date(currentSchedule.startDate).toLocaleDateString()} -
            {new Date(currentSchedule.endDate).toLocaleDateString()} at
            {currentSchedule.dailyTimes.join(', ')}
          </div>
        )}

        {medicationData.duration_based && (
          <div className={styles.durationInfo}>
            <ul>
              <li>Onset: {medicationData.onset_hours}h</li>
              <li>Peak: {medicationData.peak_hours}h</li>
              <li>Duration: {medicationData.duration_hours}h</li>
            </ul>
          </div>
        )}
        {medicationData.effects && (
  <div className={styles.effectsInfo}>
    <h4>Current Effects</h4>
    {medicationData.lastDose && (
      <>
        <div className={styles.effectDetail}>
          <span>Last dose:</span>
          <span>{new Date(medicationData.lastDose).toLocaleString()}</span>
        </div>
        <div className={styles.effectDetail}>
          <span>Hours since last dose:</span>
          <span>{medicationData.hoursSinceLastDose.toFixed(1)}h</span>
        </div>
      </>
    )}
    {medicationData.currentPhase && (
      <div className={styles.effectDetail}>
        <span>Current phase:</span>
        <span>{medicationData.currentPhase}</span>
      </div>
    )}
    <div className={styles.effectDetail}>
      <span>Effect:</span>
      <span className={medicationData.effectStrength < 0 ? styles.decrease : styles.increase}>
        {Math.abs(medicationData.effectStrength).toFixed(1)}%
        {medicationData.effectStrength < 0 ? ' decrease' : ' increase'}
        {medicationData.effectType ? ` in ${medicationData.effectType}` : ''}
      </span>
    </div>
  </div>
)}
      </div>
    </div>
  );
};
export default MedicationSchedule;