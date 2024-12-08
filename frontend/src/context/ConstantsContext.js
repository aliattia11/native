// frontend/src/context/ConstantsContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';

const ConstantsContext = createContext();

export const ConstantsProvider = ({ children }) => {
  const [patientConstants, setPatientConstants] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConstants = async (patientId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/patient/${patientId}/constants`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch patient constants');

      const data = await response.json();
      setPatientConstants(data.constants || DEFAULT_PATIENT_CONSTANTS);
      setError(null);
    } catch (err) {
      setError(err.message);
      setPatientConstants(DEFAULT_PATIENT_CONSTANTS);
    } finally {
      setLoading(false);
    }
  };

  const updateConstants = async (patientId, newConstants) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/patient/${patientId}/constants`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ constants: newConstants })
      });

      if (!response.ok) throw new Error('Failed to update patient constants');

      setPatientConstants(newConstants);
      setError(null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConstantsContext.Provider value={{
      patientConstants,
      loading,
      error,
      fetchConstants,
      updateConstants
    }}>
      {children}
    </ConstantsContext.Provider>
  );
};

export const useConstants = () => useContext(ConstantsContext);