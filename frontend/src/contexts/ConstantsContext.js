import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';
import axios from 'axios';

const ConstantsContext = createContext();

export function ConstantsProvider({ children }) {
  const [patientConstants, setPatientConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPatientConstants = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('No authentication token found');
  }

  try {
    const response = await axios.get('http://localhost:5000/api/patient/constants', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Validate the response data
    const constants = response.data.constants;
    if (!constants) {
      console.warn('No constants received from server, using defaults');
      return DEFAULT_PATIENT_CONSTANTS;
    }

      // Merge with defaults to ensure all required fields exist
        return {
      ...DEFAULT_PATIENT_CONSTANTS,
      ...constants,
      // Ensure these fields exist with proper defaults
      disease_factors: constants.disease_factors || DEFAULT_PATIENT_CONSTANTS.disease_factors,
      medication_factors: constants.medication_factors || DEFAULT_PATIENT_CONSTANTS.medication_factors,
      active_conditions: constants.active_conditions || [],
      active_medications: constants.active_medications || []
    };
  } catch (error) {
    console.error('Error fetching patient constants:', error);
    throw new Error('Failed to fetch patient constants');
  }
};


  const refreshConstants = useCallback(async () => {
    try {
      setLoading(true);
      const constants = await fetchPatientConstants();
      setPatientConstants(constants);
      setError(null);
    } catch (err) {
      console.error('Error fetching constants:', err);
      setError(err.message);
      setPatientConstants(DEFAULT_PATIENT_CONSTANTS);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch of constants
  useEffect(() => {
    refreshConstants();
  }, [refreshConstants]);

  // Listen for constants updates from other components
  useEffect(() => {
    const handleConstantsUpdate = (event) => {
      const { constants } = event.detail;
      setPatientConstants(constants);
    };

    window.addEventListener('patientConstantsUpdated', handleConstantsUpdate);
    return () => {
      window.removeEventListener('patientConstantsUpdated', handleConstantsUpdate);
    };
  }, []);

  return (
    <ConstantsContext.Provider value={{
      patientConstants,
      loading,
      error,
      refreshConstants,
      setPatientConstants
    }}>
      {children}
    </ConstantsContext.Provider>
  );
}

export function useConstants() {
  const context = useContext(ConstantsContext);
  if (!context) {
    throw new Error('useConstants must be used within a ConstantsProvider');
  }
  return context;
}