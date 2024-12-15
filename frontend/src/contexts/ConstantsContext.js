import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { DEFAULT_PATIENT_CONSTANTS, SHARED_CONSTANTS } from '../constants';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000';
const ConstantsContext = createContext();

export function ConstantsProvider({ children }) {
  const [patientConstants, setPatientConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [medicalFactorsHistory, setMedicalFactorsHistory] = useState([]);
  const [activeMedicalFactors, setActiveMedicalFactors] = useState({
    conditions: {},
    medications: {}
});
  const validateConstants = (constants) => {
    const required = [
      'insulin_to_carb_ratio',
      'correction_factor',
      'target_glucose',
      'protein_factor',
      'fat_factor',
      'activity_coefficients',
      'absorption_modifiers',
      'insulin_timing_guidelines',
      'medical_condition_factors',
      'medication_factors'
    ];

    const missing = required.filter(field => !(field in constants));
    if (missing.length > 0) {
      console.warn(`Missing constants fields: ${missing.join(', ')}`);
      return false;
    }
    return true;
  };

  const fetchPatientConstants = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    try {
      const response = await axios.get(`${API_BASE_URL}/api/patient/constants`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const constants = response.data.constants;
      if (!constants || !validateConstants(constants)) {
        console.warn('Invalid constants received from server, using defaults');
        return {
          ...DEFAULT_PATIENT_CONSTANTS,
          medical_condition_factors: SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medical_condition_factors,
          medication_factors: SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors
        };
      }

      return constants;
    } catch (error) {
      console.error('Error fetching patient constants:', error);
      throw new Error(error.response?.data?.message || 'Failed to fetch patient constants');
    }
  };

  const updatePatientConstants = async (newConstants) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No authentication token found');
    }

    try {
      const response = await axios.put(
        `${API_BASE_URL}/api/patient/constants`,
        { constants: newConstants },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.success) {
        setPatientConstants(response.data.constants);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating patient constants:', error);
      throw new Error(error.response?.data?.message || 'Failed to update constants');
    }
  };

  const updateMedicalFactors = useCallback(async (factors) => {
    try {
        const token = localStorage.getItem('token');
        const response = await axios.put(
            `${API_BASE_URL}/api/patient/medical-factors`,
            { factors },
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (response.data.success) {
            setActiveMedicalFactors(factors);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error updating medical factors:', error);
        throw error;
    }
}, []);

  const getMedicalFactorsForDate = useCallback((date) => {
    const timestamp = date.toISOString();
    const historyEntry = medicalFactorsHistory.find(entry =>
      entry.timestamp <= timestamp
    );
    return historyEntry?.factors || {
      conditions: patientConstants.medical_condition_factors,
      medications: patientConstants.medication_factors
    };
  }, [medicalFactorsHistory, patientConstants]);

  const refreshConstants = useCallback(async () => {
    try {
      setLoading(true);
      const constants = await fetchPatientConstants();
      setPatientConstants(constants);
      setError(null);
    } catch (err) {
      console.error('Error fetching constants:', err);
      setError(err.message);
      setPatientConstants({
        ...DEFAULT_PATIENT_CONSTANTS,
        medical_condition_factors: SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medical_condition_factors,
        medication_factors: SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors
      });
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
      if (validateConstants(constants)) {
        setPatientConstants(constants);
      }
    };

    window.addEventListener('patientConstantsUpdated', handleConstantsUpdate);
    return () => {
      window.removeEventListener('patientConstantsUpdated', handleConstantsUpdate);
    };
  }, []);

  const value = {
    patientConstants,
    loading,
    error,
    refreshConstants,
    updatePatientConstants,
    updateMedicalFactors,
    getMedicalFactorsForDate,
    medicalFactorsHistory,
    setPatientConstants,
    validateConstants,
    activeMedicalFactors
  };

  return (
    <ConstantsContext.Provider value={value}>
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