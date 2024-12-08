import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { fetchPatientConstants } from '../components/EnhancedPatientConstantsCalc';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';

const ConstantsContext = createContext();

export function ConstantsProvider({ children }) {
  const [patientConstants, setPatientConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
      setPatientConstants // Expose this if you need direct updates
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