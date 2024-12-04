import React, { useState, useEffect } from 'react';
import MealInput from './MealInput';
import MealHistory from './MealHistory';
import BloodSugarInput from './BloodSugarInput';
import BloodSugarTable from './BloodSugarTable';
import BloodSugarChart from './BloodSugarChart';
import ActivityRecording from './ActivityRecording';
import ActivityDataTable from './ActivityDataTable';
import FoodDatabase from './FoodDatabase';
import EnhancedMealInsulin from './EnhancedMealInsulin';
import styles from './PatientDashboard.module.css';

const PatientDashboard = ({ handleLogout }) => {
  const [userName, setUserName] = useState('');
  const [activeComponent, setActiveComponent] = useState(null);

  useEffect(() => {
    const firstName = localStorage.getItem('firstName') || '';
    const lastName = localStorage.getItem('lastName') || '';
    setUserName(`${firstName} ${lastName}`.trim());
  }, []);

  const renderActiveComponent = () => {
    switch (activeComponent) {
      case 'MealInput':
        return <MealInput />;
      case 'EnhancedMealInsulin':
        return <EnhancedMealInsulin />;
      case 'FoodDatabase':
        return <FoodDatabase />;
      case 'mealHistory':
        return <MealHistory />;
      case 'bloodSugarTable':
        return <BloodSugarTable />;
      case 'bloodSugarChart':
        return <BloodSugarChart />;
      case 'activityRecording':
        return <ActivityRecording userType="patient" />;
      case 'ActivityDataTable':
        return <ActivityDataTable userType="patient" />;
      default:
        return null;
    }
  };

  return (
    <div className={styles.patientDashboard}>
      <header className={styles.dashboardHeader}>
        <h1 className={styles.welcomeText}>Welcome, {userName}</h1>
        <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
      </header>

      <div className={styles.dashboardGrid}>
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
      </div>

      <div className={styles.quickAccess}>
        <h2 className={styles.cardTitle}>Quick Access</h2>
        <div className={styles.quickAccessButtons}>


          <button
              onClick={() => setActiveComponent('MealInput')}
              className={`${styles.quickAccessButton} ${activeComponent === 'MealInput' ? styles.active : ''}`}
          >
            Meal Input
          </button>

          <button
              onClick={() => setActiveComponent('EnhancedMealInsulin')}
              className={`${styles.quickAccessButton} ${activeComponent === 'EnhancedMealInsulin' ? styles.active : ''}`}
          >
            Enhanced Meal Insulin
          </button>

          <button
              onClick={() => setActiveComponent('FoodDatabase')}
              className={`${styles.quickAccessButton} ${activeComponent === 'FoodDatabase' ? styles.active : ''}`}
          >
            Meal Management
          </button>

          <button
              onClick={() => setActiveComponent('mealHistory')}
              className={`${styles.quickAccessButton} ${activeComponent === 'mealHistory' ? styles.active : ''}`}
          >
            Meal History
          </button>

          <button
              onClick={() => setActiveComponent('bloodSugarTable')}
              className={`${styles.quickAccessButton} ${activeComponent === 'bloodSugarTable' ? styles.active : ''}`}
          >
            Blood Sugar Table
          </button>

          <button
              onClick={() => setActiveComponent('bloodSugarChart')}
              className={`${styles.quickAccessButton} ${activeComponent === 'bloodSugarChart' ? styles.active : ''}`}
          >
            Blood Sugar Chart
          </button>

          <button
              onClick={() => setActiveComponent('ActivityDataTable')}
              className={`${styles.quickAccessButton} ${activeComponent === 'ActivityDataTable' ? styles.active : ''}`}
          >
            Activity Data Table
          </button>
        </div>
      </div>

      <div className={styles.activeComponent}>
        {renderActiveComponent()}
      </div>
    </div>
  );
};

export default PatientDashboard;