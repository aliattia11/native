import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus, FaFileImport, FaSync, FaHistory, FaInfoCircle } from 'react-icons/fa';
import styles from './ActivityRecording.module.css';
import { ACTIVITY_LEVELS } from '../constants';
import { useConstants } from '../contexts/ConstantsContext';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';
import moment from 'moment';

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
    ? `Effect: ${impactPercentage}% ${impact > 1 ? 'increase' : 'decrease'}`
    : 'No effect';

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
  const [userTimeZone, setUserTimeZone] = useState('');
  // New state for import functionality
  const [importStatus, setImportStatus] = useState(null);
  // New state for recent activities
  const [recentActivities, setRecentActivities] = useState([]);
  const [showRecentActivities, setShowRecentActivities] = useState(false);
  const fileInputRef = useRef(null);

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

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

  // Fetch recent activities - new function
  const fetchRecentActivities = useCallback(async () => {
    if (!standalone) return;

    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found');
        return;
      }

      const response = await axios.get(
        'http://localhost:5000/api/activity-history',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            limit: 5
          }
        }
      );

      if (response.data && Array.isArray(response.data)) {
        // Format the activities for display
        const formattedActivities = response.data.map(activity => {
          // Get level label from ACTIVITY_LEVELS
          const levelInfo = ACTIVITY_LEVELS.find(l => l.value === activity.level) || {};

          return {
            ...activity,
            levelLabel: levelInfo.label || 'Unknown',
            formattedStartTime: activity.startTime
              ? TimeManager.utcToLocalString(activity.startTime)
              : TimeManager.utcToLocalString(activity.timestamp),
            formattedEndTime: activity.endTime
              ? TimeManager.utcToLocalString(activity.endTime)
              : '',
            impactType: activity.impact > 1 ? 'increase' : activity.impact < 1 ? 'decrease' : 'neutral'
          };
        });

        setRecentActivities(formattedActivities);
      }
    } catch (error) {
      console.error('Error fetching recent activities:', error);
      setStatus({
        type: 'error',
        message: 'Failed to load recent activities'
      });
    } finally {
      setIsLoading(false);
    }
  }, [standalone]);

  // Load recent activities on component mount if standalone
  useEffect(() => {
    if (standalone) {
      fetchRecentActivities();
    }
  }, [standalone, fetchRecentActivities]);

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

  // Toggle recent activities view
  const toggleRecentActivities = () => {
    setShowRecentActivities(prev => !prev);
    if (!showRecentActivities) {
      fetchRecentActivities();
    }
  };

  // Convert local time to UTC for API calls
  const convertToUTCIsoString = useCallback((localTime) => {
    if (!localTime) return null;
    return moment(localTime).utc().toISOString();
  }, []);

  // Handle import file button click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file selection for import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'csv' && fileExt !== 'json') {
      setImportStatus({
        type: 'error',
        message: 'Invalid file format. Please select a CSV or JSON file.'
      });
      return;
    }

    setIsLoading(true);
    setImportStatus({ type: 'info', message: 'Validating file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'activities');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // First validate the file
      const validationResponse = await axios.post(
        'http://localhost:5000/api/import/validate',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!validationResponse.data.valid) {
        setImportStatus({
          type: 'error',
          message: 'File validation failed',
          details: validationResponse.data.errors?.join('\n')
        });
        setIsLoading(false);
        return;
      }

      // If validation passes, proceed with import
      setImportStatus({ type: 'info', message: 'Importing data...' });

      const importResponse = await axios.post(
        'http://localhost:5000/api/import',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const results = importResponse.data.results;

      setImportStatus({
        type: 'success',
        message: `Successfully imported ${results.activities_imported || 0} activities`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh the recent activities list
      fetchRecentActivities();

    } catch (error) {
      console.error('Error importing data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

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

      // Process activities for both endpoints to ensure proper format and convert times to UTC
      const processedActivitiesData = activities.map(activity => {
        const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);

        // Convert local time to UTC for API
        const startTimeUTC = convertToUTCIsoString(activity.startTime);
        const endTimeUTC = convertToUTCIsoString(activity.endTime);

        return {
          level: activity.level,
          type: activity.type,
          startTime: startTimeUTC,   // Send UTC time
          endTime: endTimeUTC,       // Send UTC time
          duration: TimeManager.hoursToTimeString(durationData.totalHours),
          impact: patientConstants.activity_coefficients[activity.level] || 1.0
        };
      });

      // First, record the activities in the activities collection
      const activitiesData = {
        expectedActivities: activities
          .filter(activity => activity.type === 'expected')
          .map(activity => {
            const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);

            // Convert local time to UTC for API
            const startTimeUTC = convertToUTCIsoString(activity.startTime);
            const endTimeUTC = convertToUTCIsoString(activity.endTime);

            return {
              level: activity.level,
              duration: TimeManager.hoursToTimeString(durationData.totalHours),
              expectedTime: startTimeUTC,  // Send UTC time
              startTime: startTimeUTC,     // Send UTC time
              endTime: endTimeUTC,         // Send UTC time
              impact: patientConstants.activity_coefficients[activity.level] || 1.0,
              notes: notes
            };
          }),
        completedActivities: activities
          .filter(activity => activity.type === 'completed')
          .map(activity => {
            const durationData = TimeManager.calculateDuration(activity.startTime, activity.endTime);

            // Convert local time to UTC for API
            const startTimeUTC = convertToUTCIsoString(activity.startTime);
            const endTimeUTC = convertToUTCIsoString(activity.endTime);

            return {
              level: activity.level,
              duration: TimeManager.hoursToTimeString(durationData.totalHours),
              completedTime: startTimeUTC, // Send UTC time
              startTime: startTimeUTC,     // Send UTC time
              endTime: endTimeUTC,         // Send UTC time
              impact: patientConstants.activity_coefficients[activity.level] || 1.0,
              notes: notes
            };
          }),
        notes: notes
      };

      console.log('Submitting activities to dedicated endpoint:', activitiesData);

      // First, record the activities in the activities collection
      const activityResponse = await axios.post(
        'http://localhost:5000/api/record-activities',
        activitiesData,
        { headers }
      );

      console.log('Activities recorded, response:', activityResponse.data);

      // Prepare the meal data with references to already created activities
      const mealData = {
        timestamp: new Date().toISOString(),  // Current UTC time
        mealType: 'activity_only',
        foodItems: [],
        activities: processedActivitiesData,  // Use processed activities with all fields
        notes: notes,
        recordingType: 'standalone_activity_recording',
        calculationFactors: {
          activityImpact: totalImpact,
          healthMultiplier: 0.0
        },
        skipActivityDuplication: true, // Tell backend not to duplicate activities
        activityIds: activityResponse.data.activity_ids || [] // Pass the IDs of already created activities
      };

      console.log('Submitting to meal endpoint with activity references:', mealData);

      // Now submit to meal endpoint with references to the already created activities
      await axios.post('http://localhost:5000/api/meal', mealData, { headers });

      setStatus({
        type: 'success',
        message: 'Activities recorded successfully!'
      });
      setActivities([]);
      setNotes('');

      // Refresh the activities list after successful submission
      fetchRecentActivities();

    } catch (error) {
      console.error('Error submitting activities:', error);
      setStatus({
        type: 'error',
        message: error.response?.data?.message || 'Error recording activities'
      });
    } finally {
      setIsLoading(false);
    }
  }, [standalone, activities, notes, totalImpact, patientConstants, convertToUTCIsoString, fetchRecentActivities]);

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
      {standalone && (
        <div className={styles.activityHeader}>
          <h2>Record Activities</h2>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.refreshButton}`}
              onClick={fetchRecentActivities}
              title="Refresh activities"
              disabled={isLoading}
            >
              <FaSync className={isLoading ? styles.spin : ""} />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.historyButton}`}
              onClick={toggleRecentActivities}
              title={showRecentActivities ? "Hide recent activities" : "Show recent activities"}
            >
              <FaHistory />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.importButton}`}
              onClick={handleImportClick}
              title="Import activities"
              disabled={isLoading}
            >
              <FaFileImport />
            </button>
            {/* Hidden file input triggered by the import button */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv,.json"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      )}

      {/* Add timezone info display */}
      {standalone && (
        <div className={styles.timezoneInfo}>
          Your timezone: {userTimeZone}
          <span className={styles.timezoneNote}> (all times stored in UTC but displayed in your local timezone)</span>
        </div>
      )}

      {/* Import Status Message */}
      {importStatus && (
        <div className={`${styles.message} ${styles[importStatus.type]}`}>
          <FaInfoCircle className={styles.messageIcon} />
          <div className={styles.messageContent}>
            <h4>{importStatus.message}</h4>
            {importStatus.details && (
              <pre className={styles.details}>{importStatus.details}</pre>
            )}
          </div>
        </div>
      )}

      {/* Recent Activities Section */}
      {standalone && showRecentActivities && (
        <div className={styles.recentActivities}>
          <h3>Recent Activities</h3>
          {recentActivities.length > 0 ? (
            <div className={styles.recentActivitiesList}>
              {recentActivities.map((activity) => (
                <div key={activity.id} className={styles.recentActivityItem}>
                  <div className={styles.activityTypeAndLevel}>
                    <span className={styles.activityType}>{activity.type}</span>
                    <span className={styles.activityLevel}>{activity.levelLabel}</span>
                  </div>
                  <div className={styles.activityDetails}>
                    <span className={styles.activityTime}>
                      {new Date(activity.formattedStartTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      {activity.formattedEndTime && ` - ${new Date(activity.formattedEndTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`}
                    </span>
                    <span className={styles.activityDate}>
                      {new Date(activity.formattedStartTime).toLocaleDateString()}
                    </span>
                    <span className={styles.activityDuration}>
                      Duration: {activity.duration}
                    </span>
                  </div>
                  {activity.notes && (
                    <div className={styles.activityNotes} title={activity.notes}>
                      {activity.notes}
                    </div>
                  )}
                  <div
                    className={styles.activityImpact}
                    data-impact={activity.impactType}
                  >
                    {activity.impact !== 1
                      ? `${Math.abs((activity.impact - 1) * 100).toFixed(1)}% ${activity.impact > 1 ? 'Increase' : 'Decrease'}`
                      : 'No Effect'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noActivities}>{isLoading ? 'Loading...' : 'No recent activities found'}</p>
          )}
          <div className={styles.activitiesFooter}>
            <span className={styles.importNote}>
              Need to import multiple activities? Click the <FaFileImport className={styles.inlineIcon} /> import button above.
            </span>
          </div>
        </div>
      )}

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