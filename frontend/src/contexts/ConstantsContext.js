import React, { createContext, useState, useContext, useCallback } from 'react';
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

  return (
    <ConstantsContext.Provider value={{
      patientConstants,
      loading,
      error,
      refreshConstants
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