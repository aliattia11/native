import React, { useState, useEffect, useCallback } from 'react';
import MealInput from './MealInput';
import MealHistory from './MealHistory';
import BloodSugarInput from './BloodSugarInput';
import BloodSugarTable from './BloodSugarTable';
import BloodSugarChart from './Charts/BloodSugarChart';
import BloodGlucoseAnalytics from './Charts/BloodGlucoseAnalytics';
import ActivityRecording from './ActivityRecording';
import ActivityDataTable from './ActivityDataTable';
import FoodDatabase from './FoodDatabase';
import PatientConstants from './PatientConstants';
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

    // Cleanup function
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
      case 'bloodSugarTable':
        return <BloodSugarTable key="blood-sugar-table" />;
      case 'BloodGlucoseAnalytics':
        return <BloodGlucoseAnalytics key="blood-glucose-analytics" />;
      case 'bloodSugarChart':
        return <BloodSugarChart key="blood-sugar-chart" />;
      case 'activityRecording':
        return <ActivityRecording key="activity-recording" userType="patient" />;
      case 'ActivityDataTable':
        return <ActivityDataTable key="activity-data-table" userType="patient" />;
      default:
        return null;
    }
  }, [activeComponent, isLoading]);

  // Handler for component switching
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

      <div className={styles.dashboardGrid}>
        {!isLoading && (
          <>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Blood Sugar Input</h2>
              <BloodSugarInput />
            </div>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Meal Input</h2>
              <MealInput />
            </div>
            <div className={styles.dashboardCard}>
              <h2 className={styles.cardTitle}>Activity Recording</h2>
              <ActivityRecording userType="patient" />
            </div>
          </>
        )}
      </div>

      <div className={styles.quickAccess}>
        <h2 className={styles.cardTitle}>Quick Access</h2>
        <div className={styles.quickAccessButtons}>
          {[
            { name: 'MealInput', label: 'Meal Input' },
            { name: 'PatientConstants', label: 'Patient Constants' },
            { name: 'FoodDatabase', label: 'Meal Management' },
            { name: 'mealHistory', label: 'Meal History' },
            { name: 'bloodSugarTable', label: 'Blood Sugar Table' },
            { name: 'BloodGlucoseAnalytics', label: 'Blood Glucose Analytics' },
            { name: 'bloodSugarChart', label: 'Blood Sugar Chart' },
            { name: 'ActivityDataTable', label: 'Activity Data Table' }
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