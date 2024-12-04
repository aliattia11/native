import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import styles from './ActivityRecording.module.css';
import DurationInput from './DurationInput';

const activityLevels = [
  { value: -2, label: 'Sleep' },
  { value: -1, label: 'Very Low Activity' },
  { value: 0, label: 'Normal Activity' },
  { value: 1, label: 'High Activity' },
  { value: 2, label: 'Vigorous Activity' }
];

const ActivityItem = ({ item, updateItem, removeItem, isExpected }) => {
  const handleDurationChange = (newDuration) => {
    const newItem = { ...item, duration: newDuration };
    updateItem(newItem);
  };

  return (
    <div className={styles.activityItem}>
      <select
        className={styles.select}
        value={item.level}
        onChange={(e) => updateItem({ ...item, level: parseInt(e.target.value) })}
        required
      >
        {activityLevels.map(level => (
          <option key={level.value} value={level.value}>{level.label}</option>
        ))}
      </select>
      <DurationInput
        value={item.duration}
        onChange={handleDurationChange}
      />
      <input
        type="datetime-local"
        className={styles.input}
        value={isExpected ? item.expectedTime : item.completedTime}
        onChange={(e) => updateItem({ ...item, [isExpected ? 'expectedTime' : 'completedTime']: e.target.value })}
        required
      />
      <button className={styles.iconButton} type="button" onClick={removeItem}>
        <FaMinus />
      </button>
    </div>
  );
};

const ActivityRecordingComponent = ({ userType, patientId }) => {
  const [expectedActivities, setExpectedActivities] = useState([]);
  const [completedActivities, setCompletedActivities] = useState([]);
  const [activityHistory, setActivityHistory] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (userType === 'doctor' && patientId) {
      fetchPatientActivityHistory(patientId);
    } else if (userType === 'patient') {
      fetchUserActivityHistory();
    }
  }, [userType, patientId]);

  const fetchUserActivityHistory = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/activity-history', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setActivityHistory(response.data);
    } catch (error) {
      console.error('Error fetching activity history:', error);
      setMessage('Failed to fetch activity history.');
    }
  };

  const fetchPatientActivityHistory = async (patientId) => {
    try {
      const response = await axios.get(`http://localhost:5000/api/patient/${patientId}/activity-history`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      setActivityHistory(response.data);
    } catch (error) {
      console.error('Error fetching patient activity history:', error);
      setMessage('Failed to fetch patient activity history.');
    }
  };

  const addExpectedActivity = () => {
    const currentDate = new Date().toISOString().slice(0, 16);
    setExpectedActivities([...expectedActivities, { level: 0, duration: 0, expectedTime: currentDate }]);
  };

  const addCompletedActivity = () => {
    const currentDate = new Date().toISOString().slice(0, 16);
    setCompletedActivities([...completedActivities, { level: 0, duration: 0, completedTime: currentDate }]);
  };

  const updateExpectedActivity = (index, updatedActivity) => {
    const newActivities = [...expectedActivities];
    newActivities[index] = updatedActivity;
    setExpectedActivities(newActivities);
  };

  const updateCompletedActivity = (index, updatedActivity) => {
    const newActivities = [...completedActivities];
    newActivities[index] = updatedActivity;
    setCompletedActivities(newActivities);
  };

  const removeExpectedActivity = (index) => {
    setExpectedActivities(expectedActivities.filter((_, i) => i !== index));
  };

  const removeCompletedActivity = (index) => {
    setCompletedActivities(completedActivities.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Submitting activities...');
    try {
      const response = await axios.post('http://localhost:5000/api/record-activities', {
        expectedActivities,
        completedActivities
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('Response:', response.data);
      setMessage('Activities recorded successfully!');
      setExpectedActivities([]);
      setCompletedActivities([]);
      fetchUserActivityHistory();
    } catch (error) {
      console.error('Error submitting activities:', error.response || error);
      setMessage(`Error: ${error.response?.data?.message || error.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Activity Recording</h2>
      {userType === 'patient' && (
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <h3 className={styles.subtitle}>Expected Activities:</h3>
            {expectedActivities.map((activity, index) => (
              <ActivityItem
                key={index}
                item={activity}
                updateItem={(updatedActivity) => updateExpectedActivity(index, updatedActivity)}
                removeItem={() => removeExpectedActivity(index)}
                isExpected={true}
              />
            ))}
            <button type="button" onClick={addExpectedActivity} className={styles.addButton}>
              <FaPlus /> Add Expected Activity
            </button>
          </div>
          <div className={styles.formGroup}>
            <h3 className={styles.subtitle}>Completed Activities:</h3>
            {completedActivities.map((activity, index) => (
              <ActivityItem
                key={index}
                item={activity}
                updateItem={(updatedActivity) => updateCompletedActivity(index, updatedActivity)}
                removeItem={() => removeCompletedActivity(index)}
                isExpected={false}
              />
            ))}
            <button type="button" onClick={addCompletedActivity} className={styles.addButton}>
              <FaPlus /> Add Completed Activity
            </button>
          </div>
          <button type="submit" className={styles.submitButton}>Record Activities</button>
        </form>
      )}
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
};

export default ActivityRecordingComponent;