import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import BloodSugarChart from './Charts/BloodSugarChart';
import BloodSugarTable from './BloodSugarTable';
import MealHistory from './MealHistory';
import EnhancedPatientConstantsUI from './EnhancedPatientConstantsUI';
import ActivityDataTable from './ActivityDataTable';
import BloodGlucoseAnalytics from './Charts/BloodGlucoseAnalytics';

import styles from './DoctorDashboard.module.css';

import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const DoctorDashboard = () => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState({ patients: false });
  const [errors, setErrors] = useState({ patients: '' });
  const [errorMessage, setErrorMessage] = useState('');

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
  }, [fetchPatients]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = 'http://localhost:3000/login';
  };

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
                {patient.name}
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
        <h1>Doctor Dashboard</h1>
        <button onClick={handleLogout} className={styles.logoutButton}>Logout</button>
      </div>

      {errorMessage && (
        <div className={styles.errorBanner}>
          {errorMessage}
          <button onClick={() => setErrorMessage('')} className={styles.closeError}>×</button>
        </div>
      )}

      <div className={styles.dashboardContainer}>
        <div className={styles.patientList}>
          <h2>Patients</h2>
          {loading.patients ? (
            <div className={styles.loading}>Loading patients...</div>
          ) : errors.patients ? (
            <div className={styles.error}>{errors.patients}</div>
          ) : (
            renderPatientSearch()
          )}
        </div>

        <div className={styles.patientData}>
          {selectedPatient ? (
            <>
              <h2>Patient: {selectedPatient.name}</h2>
              <div className={styles.patientDataGrid}>
                <EnhancedPatientConstantsUI
                  patientId={selectedPatient.id}
                />
                <div className={styles.dataCharts}>
                  <BloodGlucoseAnalytics isDoctor={true} patientId={selectedPatient.id} />
                  <BloodSugarChart isDoctor={true} patientId={selectedPatient.id} />
                  <BloodSugarTable isDoctor={true} patientId={selectedPatient.id} />
                </div>
                <div className={styles.dataHistory}>
                  <MealHistory isDoctor={true} patientId={selectedPatient.id} />
                  <ActivityDataTable isDoctor={true} patientId={selectedPatient.id} />
                </div>
              </div>
            </>
          ) : (
            <p className={styles.selectPrompt}>Select a patient to view their data</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;