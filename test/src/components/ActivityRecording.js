// frontend/src/components/ActivityRecording.js
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import styles from './ActivityRecording.module.css';
import { ACTIVITY_LEVELS } from '../constants';
import { useConstants } from '../contexts/ConstantsContext';

// ActivityItem component - memoized for better performance
const ActivityItem = React.memo(({ item, updateItem, removeItem, activityCoefficients }) => {
  const getActivityImpact = useCallback((level) => {
    const impact = activityCoefficients?.[level];
    if (impact === undefined) return 1.0;
    return impact;
  }, [activityCoefficients]);

  const impact = getActivityImpact(item.level);
  const impactPercentage = ((impact - 1) * 100).toFixed(1);
  const impactText = impact !== 1
    ? `Effect over 2 hours: ${impactPercentage}% ${impact > 1 ? 'increase' : 'decrease'} in insulin needs`
    : 'No effect on insulin needs';

  const calculateDurationString = useCallback((startTime, endTime) => {
    if (!startTime || !endTime) return "0:00";
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationInMinutes = Math.max(0, (end - start) / (1000 * 60));
    const hours = Math.floor(durationInMinutes / 60);
    const minutes = Math.round(durationInMinutes % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }, []);

  return (
    <div className={styles.activityItem}>
      <div className={styles.activitySelect}>
        <select
          className={styles.select}
          value={item.level}
          onChange={(e) => updateItem({ ...item, level: parseInt(e.target.value) })}
          required
        >
          {ACTIVITY_LEVELS.map(level => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
        <span className={styles.impactIndicator}>{impactText}</span>
      </div>
      <div className={styles.timeInputs}>
        <input
          type="datetime-local"
          className={styles.timeInput}
          value={item.startTime}
          onChange={(e) => updateItem({ ...item, startTime: e.target.value })}
          required
          placeholder="Start Time"
        />
        <input
          type="datetime-local"
          className={styles.timeInput}
          value={item.endTime}
          onChange={(e) => updateItem({ ...item, endTime: e.target.value })}
          required
          placeholder="End Time"
          min={item.startTime}
        />
      </div>
      <div className={styles.durationDisplay}>
        Duration: {calculateDurationString(item.startTime, item.endTime)}
      </div>
      <button className={styles.iconButton} type="button" onClick={removeItem}>
        <FaMinus />
      </button>
    </div>
  );
});

const ActivityRecording = ({
  standalone = true,
  onActivityUpdate,
  initialActivities = []
}) => {
  const { patientConstants, loading, error } = useConstants();
  const [activities, setActivities] = useState(initialActivities);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);

  const calculateDurationString = useCallback((startTime, endTime) => {
    if (!startTime || !endTime) return "0:00";
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationInMinutes = Math.max(0, (end - start) / (1000 * 60));
    const hours = Math.floor(durationInMinutes / 60);
    const minutes = Math.round(durationInMinutes % 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
  }, []);

  const calculateDurationInHours = useCallback((startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    const start = new Date(startTime);
    const end = new Date(endTime);
    return Math.max(0, (end - start) / (1000 * 60 * 60));
  }, []);

  const calculateTotalImpact = useCallback((activitiesList) => {
    if (!activitiesList.length || !patientConstants?.activity_coefficients) return 1.0;

    return activitiesList.reduce((total, activity) => {
      const coefficient = patientConstants.activity_coefficients[activity.level] || 1.0;
      const duration = calculateDurationInHours(activity.startTime, activity.endTime);
      
      const durationWeight = Math.min(duration / 2, 1);
      const weightedImpact = 1.0 + ((coefficient - 1.0) * durationWeight);

      return total * weightedImpact;
    }, 1.0);
  }, [patientConstants, calculateDurationInHours]);

  // Memoize processed activities
  const processedActivities = useMemo(() => {
    if (!patientConstants) return [];
    return activities
      .filter(a => a.type === 'expected')
      .map(activity => ({
        ...activity,
        impact: patientConstants.activity_coefficients[activity.level] || 1.0,
        duration: calculateDurationString(activity.startTime, activity.endTime)
      }));
  }, [activities, patientConstants, calculateDurationString]);

  // Memoize total impact
  const totalImpact = useMemo(() => {
    return calculateTotalImpact(activities.filter(a => a.type === 'expected'));
  }, [activities, calculateTotalImpact]);

  // Effect for updating parent component
  useEffect(() => {
    if (!standalone && onActivityUpdate && patientConstants && processedActivities.length > 0) {
      onActivityUpdate(processedActivities, totalImpact);
    }
  }, [standalone, onActivityUpdate, patientConstants, processedActivities, totalImpact]);

  // Handler functions
  const addActivity = useCallback((type) => {
    const currentTime = new Date().toISOString().slice(0, 16);
    setActivities(prev => [...prev, {
      level: 0,
      startTime: currentTime,
      endTime: currentTime,
      type
    }]);
  }, []);

  const updateActivity = useCallback((activity, updatedActivity) => {
    setActivities(prev => {
      const newActivities = [...prev];
      const realIndex = prev.findIndex(a => a === activity);
      newActivities[realIndex] = updatedActivity;
      return newActivities;
    });
  }, []);

  const removeActivity = useCallback((activity) => {
    setActivities(prev => prev.filter(a => a !== activity));
  }, []);

  // Continue in Part 2...
// ... continuing from Part 1

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!standalone) return;

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const mealData = {
        timestamp: new Date().toISOString(),
        mealType: 'activity_only',
        foodItems: [],
        activities: activities.map(activity => ({
          level: activity.level,
          startTime: activity.startTime,
          endTime: activity.endTime,
          duration: calculateDurationString(activity.startTime, activity.endTime),
          type: activity.type,
          impact: patientConstants.activity_coefficients[activity.level] || 1.0
        })),
        notes: notes,
        recordingType: 'standalone_activity_recording',
        calculationFactors: {
          activityImpact: totalImpact,
          healthMultiplier: 0.0
        }
      };

      const response = await axios.post(
        'http://localhost:5000/api/meal',
        mealData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setStatus({
        type: 'success',
        message: 'Activities recorded successfully!'
      });
      setActivities([]);
      setNotes('');

    } catch (error) {
      console.error('Error submitting activities:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.message || 'Error recording activities'
      });
    } finally {
      setIsLoading(false);
    }
  }, [standalone, activities, notes, totalImpact, patientConstants, calculateDurationString]);

  if (loading) {
    return <div className={styles.loading}>Loading activity settings...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error loading activity settings: {error}</div>;
  }

  const totalImpactText = totalImpact !== 1
    ? `Total Impact: ${((totalImpact - 1) * 100).toFixed(1)}% ${totalImpact > 1 ? 'increase' : 'decrease'}`
    : 'No overall impact';

 return (
    <div className={standalone ? styles.standaloneContainer : styles.inlineContainer}>
      {standalone && <h2 className={styles.title}>Record Activities</h2>}

      {/* Conditionally render form only in standalone mode */}
      {standalone ? (
        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Form contents */}
          {renderActivityContent()}
        </form>
      ) : (
        // When used as a child component, just render the content without the form
        <div className={styles.form}>
          {renderActivityContent()}
        </div>
      )}

      {status.message && (
        <div className={`${styles.message} ${styles[status.type]}`}>
          {status.message}
        </div>
      )}
    </div>
  );

  // Helper function to render activity content
  function renderActivityContent() {
    return (
      <>
        <div className={styles.activitiesList}>
          <h3 className={styles.subtitle}>Expected Activities</h3>
          {activities
            .filter(activity => activity.type === 'expected')
            .map((activity, index) => (
              <ActivityItem
                key={index}
                item={activity}
                updateItem={(updatedActivity) => {
                  const newActivities = [...activities];
                  const realIndex = activities.findIndex(a => a === activity);
                  newActivities[realIndex] = updatedActivity;
                  setActivities(newActivities);
                }}
                removeItem={() => setActivities(activities.filter(a => a !== activity))}
                activityCoefficients={patientConstants.activity_coefficients}
              />
            ))}
          <button
            type="button"
            onClick={() => addActivity('expected')}
            className={styles.addButton}
            disabled={isLoading}
          >
            <FaPlus /> Add Expected Activity
          </button>
        </div>

        {standalone && (
          <div className={styles.activitiesList}>
            <h3 className={styles.subtitle}>Completed Activities</h3>
            {/* ... rest of the completed activities section ... */}
          </div>
        )}

        {activities.length > 0 && (
          <div className={styles.impactSummary}>
            {totalImpactText}
          </div>
        )}

        {standalone && (
          <>
            <div className={styles.notesSection}>
              <label htmlFor="notes">Notes:</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about your activities..."
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={isLoading}
            >
              {isLoading ? 'Recording...' : 'Record Activities'}
            </button>
          </>
        )}
      </>
    );
  }
};

// Export memoized component
export default React.memo(ActivityRecording);