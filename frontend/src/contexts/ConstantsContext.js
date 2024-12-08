import React, { createContext, useState, useEffect, useContext } from 'react';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';

const ConstantsContext = createContext(null);

export const ConstantsProvider = ({ children }) => {
  const [patientConstants, setPatientConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshConstants = async (patientId = null) => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');

      if (!token) {
        throw new Error('No authentication token found');
      }

      const url = patientId
        ? `http://localhost:5000/api/doctor/patient/${patientId}/constants`
        : 'http://localhost:5000/api/patient/constants';

      console.log('Fetching constants from:', url);

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch patient constants');
      }

      const data = await response.json();
      console.log('Received constants:', data);

      if (data.constants) {
        setPatientConstants(data.constants);
      } else {
        console.warn('No constants in response, using defaults');
        setPatientConstants(DEFAULT_PATIENT_CONSTANTS);
      }
    } catch (err) {
      console.error('Error fetching constants:', err);
      setError(err.message);
      // Don't override existing constants on error
      if (!patientConstants) {
        setPatientConstants(DEFAULT_PATIENT_CONSTANTS);
      }
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch of constants
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      refreshConstants();
    }
  }, []);

  return (
    <ConstantsContext.Provider value={{
      patientConstants,
      loading,
      error,
      refreshConstants,
      resetToDefaults: () => setPatientConstants(DEFAULT_PATIENT_CONSTANTS)
    }}>
      {children}
    </ConstantsContext.Provider>
  );
};

export const useConstants = () => {
  const context = useContext(ConstantsContext);
  if (!context) {
    throw new Error('useConstants must be used within a ConstantsProvider');
  }
  return context;
};