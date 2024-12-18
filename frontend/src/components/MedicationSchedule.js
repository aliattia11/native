// frontend/src/components/MedicationSchedule.js

import React, { useState, useEffect } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './MedicationSchedule.module.css';

const MedicationSchedule = ({
  medication,
  medicationData,
  patientId,
  onScheduleUpdate,
  className
}) => {
  const { updateMedicationSchedule, medicationSchedules } = useConstants();
  const [schedule, setSchedule] = useState({
    startDate: '',
    endDate: '',
    dailyTimes: [''],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentSchedule, setCurrentSchedule] = useState(null);

  // Use the current date for validation
  const currentDate = new Date('2024-12-18');
  currentDate.setHours(0, 0, 0, 0);

  useEffect(() => {
    fetchMedicationSchedule();
  }, [medication, patientId, medicationSchedules]);

  const fetchMedicationSchedule = async () => {
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
        // Initialize with default values if no schedule exists
        setSchedule(prev => ({
          ...prev,
          startDate: currentDate.toISOString().slice(0, 10),
          endDate: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        }));
      }
    } catch (error) {
      console.error('Error fetching medication schedule:', error);
      setError(error.message);
    }
  };

  const validateSchedule = () => {
    const errors = [];
    const startDateObj = new Date(schedule.startDate);
    const endDateObj = new Date(schedule.endDate);

    // Validate dates
    if (!schedule.startDate || !schedule.endDate) {
      errors.push('Start and end dates are required');
    } else {
      if (startDateObj < currentDate) {
        errors.push('Start date cannot be in the past');
      }
      if (endDateObj <= startDateObj) {
        errors.push('End date must be after start date');
      }
    }

    // Validate times
    if (schedule.dailyTimes.some(time => !time)) {
      errors.push('All time slots must be filled');
    }

    // Check for duplicate times
    const uniqueTimes = new Set(schedule.dailyTimes);
    if (uniqueTimes.size !== schedule.dailyTimes.length) {
      errors.push('Duplicate times are not allowed');
    }

    return errors;
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
      setLoading(true);
      setError(null);

      // Validate schedule
      const validationErrors = validateSchedule();
      if (validationErrors.length > 0) {
        throw new Error(validationErrors.join('\n'));
      }

      const updatedSchedule = {
        startDate: schedule.startDate,
        endDate: schedule.endDate,
        dailyTimes: schedule.dailyTimes.sort()
      };

      // Use the context function to update the schedule
      await updateMedicationSchedule(patientId, medication, updatedSchedule);

      if (onScheduleUpdate) {
        onScheduleUpdate();
      }

      // Show success message
      setError(null);
    } catch (error) {
      console.error('Error updating medication schedule:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.medicationSchedule} ${className || ''}`}>
      <div className={styles.scheduleInputs}>
        <div className={styles.dateGroup}>
          <div className={styles.inputGroup}>
            <label htmlFor={`startDate-${medication}`}>Start Date:</label>
            <input
              id={`startDate-${medication}`}
              type="date"
              value={schedule.startDate}
              onChange={(e) => setSchedule(prev => ({...prev, startDate: e.target.value}))}
              min={currentDate.toISOString().slice(0, 10)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.inputGroup}>
            <label htmlFor={`endDate-${medication}`}>End Date:</label>
            <input
              id={`endDate-${medication}`}
              type="date"
              value={schedule.endDate}
              onChange={(e) => setSchedule(prev => ({...prev, endDate: e.target.value}))}
              min={schedule.startDate}
              className={styles.dateInput}
            />
          </div>
        </div>

        <div className={styles.timesGroup}>
          <label>Daily Times:</label>
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
                  ✕
                </button>
              </div>
            ))}
          </div>
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
          disabled={loading || !schedule.startDate || !schedule.endDate || schedule.dailyTimes.some(time => !time)}
          className={`${styles.updateButton} ${loading ? styles.loading : ''}`}
        >
          {loading ? 'Updating...' : 'Update Schedule'}
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
          <h4>Current Schedule:</h4>
          <p>From: {new Date(currentSchedule.startDate).toLocaleDateString()}</p>
          <p>To: {new Date(currentSchedule.endDate).toLocaleDateString()}</p>
          <p>Daily times: {currentSchedule.dailyTimes.join(', ')}</p>
        </div>
      )}

      {medicationData.duration_based && (
        <div className={styles.durationInfo}>
          <h4>Medication Timing:</h4>
          <ul>
            <li>Onset begins: After {medicationData.onset_hours} hours</li>
            <li>Peak effect: At {medicationData.peak_hours} hours</li>
            <li>Total duration: {medicationData.duration_hours} hours</li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default MedicationSchedule;