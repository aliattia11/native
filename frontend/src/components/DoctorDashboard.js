import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import BloodSugarChart from './Charts/BloodSugarChart';
import BloodSugarVisualization from './BloodSugarVisualization';
import MealHistory from './MealHistory';
import EnhancedPatientConstantsUI from './EnhancedPatientConstantsUI';
import ActivityVisualization from './ActivityVisualization';
import BloodGlucoseCorrelationChart from './Charts/BloodGlucoseCorrelationChart ';
import DataImport from './ImportExport';
import styles from './DoctorDashboard.module.css';
import { FaSync, FaUserMd, FaClock, FaDatabase } from 'react-icons/fa';

import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const DoctorDashboard = () => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState({ patients: false, data: false });
  const [errors, setErrors] = useState({ patients: '', data: '' });
  const [errorMessage, setErrorMessage] = useState('');
  const [timeRange, setTimeRange] = useState('7d');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState('meals');
  const [currentTime, setCurrentTime] = useState(new Date());

  const fetchPatients = useCallback(async () => {
    setLoading(prevLoading => ({ ...prevLoading, patients: true }));
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/doctor/patients', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const formattedPatients = response.data.map(patient => ({
        id: patient.id,
        name: `${patient.firstName} ${patient.lastName}`,
        email: patient.email
      }));

      setPatients(formattedPatients);
      setErrors(prevErrors => ({ ...prevErrors, patients: '' }));
    } catch (error) {
      console.error('Error fetching patients:', error);
      const message = error.response?.data?.message || 'Failed to fetch patients';
      setErrors(prevErrors => ({ ...prevErrors, patients: message }));
      setErrorMessage(message);
    } finally {
      setLoading(prevLoading => ({ ...prevLoading, patients: false }));
    }
  }, []);

  useEffect(() => {
    fetchPatients();
    
    // Update current time every minute
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, [fetchPatients]);

  const handleImportComplete = async (result) => {
    if (result.success) {
      setRefreshTrigger(prev => prev + 1);
      await fetchPatients();
      setErrorMessage(`Successfully imported ${result.count} records`);
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = 'http://localhost:3000/login';
  };

  const handleRefreshData = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
    setErrorMessage('Data refreshed');
    setTimeout(() => setErrorMessage(''), 2000);
  }, []);

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderPatientSearch = () => (
    <div className={styles.patientSearchContainer}>
      <input
        type="text"
        className={styles.patientSearchInput}
        placeholder="Search patient name..."
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
        onBlur={() => {
          setTimeout(() => setShowResults(false), 200);
        }}
      />
      {showResults && (
        <div className={styles.patientSearchResults}>
          {filteredPatients.length > 0 ? (
            filteredPatients.map(patient => (
              <div
                key={patient.id}
                className={`${styles.patientSearchItem} ${
                  selectedPatient?.id === patient.id ? styles.selected : ''
                }`}
                onClick={() => {
                  setSelectedPatient(patient);
                  setSearchTerm(patient.name);
                  setShowResults(false);
                }}
              >
                <div className={styles.patientSearchItemContent}>
                  <span className={styles.patientName}>{patient.name}</span>
                  <span className={styles.patientEmail}>{patient.email}</span>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noResults}>No patients found</div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={styles.doctorDashboard}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <FaUserMd className={styles.headerIcon} />
          <h1>Doctor Dashboard</h1>
          <div className={styles.headerTime}>
            <FaClock className={styles.clockIcon} />
            <span>{currentTime.toLocaleString('en-US', { 
              timeZone: 'UTC',
              dateStyle: 'medium',
              timeStyle: 'short'
            })}</span>
          </div>
        </div>
        <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
      </div>

      {errorMessage && (
        <div className={`${styles.messageBanner} ${errorMessage.includes('Error') ? styles.error : styles.success}`}>
          {errorMessage}
          <button onClick={() => setErrorMessage('')} className={styles.closeMessage}>×</button>
        </div>
      )}

      <div className={styles.dashboardContainer}>
        <div className={styles.sidebar}>
          <div className={styles.patientListHeader}>
            <h2>Patients</h2>
            <span className={styles.patientCount}>
              Total: {patients.length}
            </span>
          </div>
          {loading.patients ? (
            <div className={styles.loading}>Loading patients...</div>
          ) : errors.patients ? (
            <div className={styles.error}>{errors.patients}</div>
          ) : (
            renderPatientSearch()
          )}
        </div>

        <div className={styles.mainContent}>
          {selectedPatient ? (
            <>
              <div className={styles.patientHeader}>
                <div className={styles.patientInfo}>
                  <h2>{selectedPatient.name}</h2>
                  <span className={styles.patientEmail}>{selectedPatient.email}</span>
                </div>
                <div className={styles.patientActions}>
                  <DataImport 
                    onImportComplete={handleImportComplete}
                    className={styles.dataImport}
                  />
                  <button 
                    onClick={handleRefreshData} 
                    className={styles.refreshButton}
                  >
                    <FaSync className={styles.refreshIcon} />
                    Refresh Data
                  </button>
                </div>
              </div>

              <div className={styles.patientDataGrid}>
                <div className={styles.constantsSection}>
                  <EnhancedPatientConstantsUI
                    patientId={selectedPatient.id}
                  />
                </div>

                <div className={styles.dataCharts}>
                  <div className={styles.correlationChart}>
                    <div className={styles.chartHeader}>
                      <h3>Blood Glucose Management Overview</h3>
                      <div className={styles.chartControls}>
                        <select 
                          value={timeRange}
                          onChange={(e) => setTimeRange(e.target.value)}
                          className={styles.timeRangeSelect}
                        >
                          <option value="24h">Last 24 Hours</option>
                          <option value="7d">Last 7 Days</option>
                          <option value="30d">Last 30 Days</option>
                        </select>
                      </div>
                    </div>
                    <BloodGlucoseCorrelationChart
                      patientId={selectedPatient.id}
                      timeRange={timeRange}
                      refreshTrigger={refreshTrigger}
                    />
                  </div>

                  <div className={styles.additionalCharts}>
                    <BloodSugarChart isDoctor={true} patientId={selectedPatient.id} />
                    <BloodSugarVisualization isDoctor={true} patientId={selectedPatient.id} />
                  </div>
                </div>

                <div className={styles.dataHistory}>
                  <div className={styles.historyHeader}>
                    <h3>Patient History</h3>
                    <div className={styles.historyTabs}>
                      <button 
                        className={`${styles.historyTab} ${activeTab === 'meals' ? styles.active : ''}`}
                        onClick={() => setActiveTab('meals')}
                      >
                        Meals
                      </button>
                      <button 
                        className={`${styles.historyTab} ${activeTab === 'activities' ? styles.active : ''}`}
                        onClick={() => setActiveTab('activities')}
                      >
                        Activities
                      </button>
                    </div>
                  </div>
                  <div className={styles.historyContent}>
                    {activeTab === 'meals' ? (
                      <MealHistory isDoctor={true} patientId={selectedPatient.id} />
                    ) : (
                      <ActivityVisualization isDoctor={true} patientId={selectedPatient.id} />
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.selectPrompt}>
              <FaUserMd className={styles.promptIcon} />
              <p>Select a patient to view their data</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;