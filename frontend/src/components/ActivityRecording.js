import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import styles from './ActivityRecording.module.css';
import { ACTIVITY_LEVELS } from '../constants';
import { useConstants } from '../contexts/ConstantsContext';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';

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

      <TimeInput
        mode="range"
        value={{ start: item.startTime, end: item.endTime }}
        onChange={({ start, end }) => {
          updateItem({ ...item, startTime: start, endTime: end });
        }}
        className={styles.timeInputs}
        required={true}
      />

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

  // Calculate duration in hours using TimeManager
  const calculateDurationInHours = useCallback((startTime, endTime) => {
    return TimeManager.calculateDuration(startTime, endTime).totalHours;
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
      .map(activity => {
        const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);
        return {
          ...activity,
          impact: patientConstants.activity_coefficients[activity.level] || 1.0,
          duration: durationData.formatted,
          durationHours: durationData.totalHours
        };
      });
  }, [activities, patientConstants]);

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
    const currentTime = TimeManager.getCurrentTimeISOString();
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

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!standalone) return;

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Process activities for both endpoints to ensure proper format
      const processedActivitiesData = activities.map(activity => {
        const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);
        return {
          level: activity.level,
          type: activity.type,
          startTime: activity.startTime,  // Make sure startTime is included
          endTime: activity.endTime,      // Make sure endTime is included
          duration: TimeManager.hoursToTimeString(durationData.totalHours),
          impact: patientConstants.activity_coefficients[activity.level] || 1.0
        };
      });

      // 1. First, submit to the meal endpoint with the existing format
      const mealData = {
        timestamp: new Date().toISOString(),
        mealType: 'activity_only',
        foodItems: [],
        activities: processedActivitiesData, // Use processed activities with all fields
        notes: notes,
        recordingType: 'standalone_activity_recording',
        calculationFactors: {
          activityImpact: totalImpact,
          healthMultiplier: 0.0
        }
      };

      // Submit to meal endpoint
      await axios.post('http://localhost:5000/api/meal', mealData, { headers });

      // 2. Also submit to the dedicated activities endpoint with the format it expects
      const activitiesData = {
        expectedActivities: activities
          .filter(activity => activity.type === 'expected')
          .map(activity => {
            const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);
            return {
              level: activity.level,
              duration: TimeManager.hoursToTimeString(durationData.totalHours),
              expectedTime: activity.startTime,
              startTime: activity.startTime,  // Ensure startTime is included
              endTime: activity.endTime,      // Ensure endTime is included
              impact: patientConstants.activity_coefficients[activity.level] || 1.0
            };
          }),
        completedActivities: activities
          .filter(activity => activity.type === 'completed')
          .map(activity => {
            const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);
            return {
              level: activity.level,
              duration: TimeManager.hoursToTimeString(durationData.totalHours),
              completedTime: activity.startTime,
              startTime: activity.startTime,  // Ensure startTime is included
              endTime: activity.endTime,      // Ensure endTime is included
              impact: patientConstants.activity_coefficients[activity.level] || 1.0
            };
          }),
        notes: notes
      };

      // Submit to activities endpoint
      await axios.post(
        'http://localhost:5000/api/record-activities',
        activitiesData,
        { headers }
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
  }, [standalone, activities, notes, totalImpact, patientConstants]);

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
                updateItem={(updatedActivity) => updateActivity(activity, updatedActivity)}
                removeItem={() => removeActivity(activity)}
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
            {activities
              .filter(activity => activity.type === 'completed')
              .map((activity, index) => (
                <ActivityItem
                  key={index}
                  item={activity}
                  updateItem={(updatedActivity) => updateActivity(activity, updatedActivity)}
                  removeItem={() => removeActivity(activity)}
                  activityCoefficients={patientConstants.activity_coefficients}
                />
              ))}
            <button
              type="button"
              onClick={() => addActivity('completed')}
              className={styles.addButton}
              disabled={isLoading}
            >
              <FaPlus /> Add Completed Activity
            </button>
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