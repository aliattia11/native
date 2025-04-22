import React, { useState, useEffect, useCallback } from 'react';
import MealInput from './MealInput';
import MealHistory from './MealHistory';
import BloodSugarInput from './BloodSugarInput';
import BloodSugarVisualization from './BloodSugarVisualization';
import InsulinVisualization from './InsulinVisualization';
import CombinedGlucoseInsulinChart from './CombinedGlucoseInsulinChart';
import ActivityRecording from './ActivityRecording';
import ActivityVisualization from './ActivityVisualization';
import FoodDatabase from './FoodDatabase';
import PatientConstants from './PatientConstants';
import InsulinInput from './InsulinInput';

import styles from './PatientDashboard.module.css';

const PatientDashboard = ({ handleLogout }) => {
  const [userName, setUserName] = useState('');
  const [activeComponent, setActiveComponent] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Use useCallback for stable function reference
  const loadUserData = useCallback(async () => {
    try {
      setIsLoading(true);
      const firstName = localStorage.getItem('firstName') || '';
      const lastName = localStorage.getItem('lastName') || '';
      setUserName(`${firstName} ${lastName}`.trim());
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const initDashboard = async () => {
      try {
        if (mounted) {
          await loadUserData();
        }
      } catch (error) {
        console.error('Dashboard initialization error:', error);
      }
    };

    initDashboard();

    return () => {
      mounted = false;
    };
  }, [loadUserData]);

  // Memoize the component switch to prevent unnecessary re-renders
  const renderActiveComponent = useCallback(() => {
    if (isLoading) {
      return <div>Loading...</div>;
    }

    switch (activeComponent) {
      case 'MealInput':
        return <MealInput key="meal-input" />;
      case 'PatientConstants':
        return <PatientConstants key="patient-constants" />;
      case 'FoodDatabase':
        return <FoodDatabase key="food-database" />;
      case 'mealHistory':
        return <MealHistory key="meal-history" />;
      case 'BloodSugarVisualization':
        return <BloodSugarVisualization key="blood-sugar-visualization" />;
      case 'CombinedGlucoseInsulinChart':
        return <CombinedGlucoseInsulinChart key="combined-glucose-insulin-chart" />;
      case 'InsulinVisualization':
        return <InsulinVisualization key="insulin-visualization" />;
      case 'activityRecording':
        return <ActivityRecording key="activity-recording" userType="patient" />;
      case 'ActivityVisualization':
        return <ActivityVisualization key="activity-visualization" userType="patient" />;
      default:
        return null;
    }
  }, [activeComponent, isLoading]);

  const handleComponentChange = useCallback((componentName) => {
    setActiveComponent(componentName);
  }, []);

  return (
    <div className={styles.patientDashboard}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.welcomeText}>
          {isLoading ? 'Loading...' : `Welcome, ${userName}`}
        </h1>
        <button
          onClick={handleLogout}
          className={styles.logoutButton}
          disabled={isLoading}
        >
          Logout
        </button>
      </header>

      {!isLoading && (
        <div className={styles.twoColumnLayout}>
          {/* Left Column */}
          <div className={styles.leftColumn}>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Meal Input</h2>
              <MealInput />
            </div>
          </div>

          {/* Right Column */}
          <div className={styles.rightColumn}>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Blood Glucose Input</h2>
              <BloodSugarInput />
            </div>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Activity Recording</h2>
              <ActivityRecording userType="patient" />
            </div>
            {/* Add InsulinInput component here */}
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Insulin Recording</h2>
              <InsulinInput isStandalone={true} />
            </div>
          </div>
        </div>
      )}


      <div className={styles.quickAccess}>
        <h2 className={styles.cardTitle}>Quick Access</h2>
        <div className={styles.quickAccessButtons}>
          {[
            { name: 'MealInput', label: 'Meal Input' },
            { name: 'PatientConstants', label: 'Patient Constants' },
            { name: 'FoodDatabase', label: 'Meal Management' },
            { name: 'mealHistory', label: 'Meal History' },
            { name: 'BloodSugarVisualization', label: 'Blood Glucose Visualization' },
            { name: 'CombinedGlucoseInsulinChart', label: 'Glucose Insulin Analytics' },
            { name: 'InsulinVisualization', label: 'Insulin Visualization' },
            { name: 'ActivityVisualization', label: 'Activity Visualization' }
          ].map(({ name, label }) => (
            <button
              key={name}
              onClick={() => handleComponentChange(name)}
              className={`${styles.quickAccessButton} ${
                activeComponent === name ? styles.active : ''
              }`}
              disabled={isLoading}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.activeComponent}>
        {renderActiveComponent()}
      </div>
    </div>
  );
};

export default React.memo(PatientDashboard);