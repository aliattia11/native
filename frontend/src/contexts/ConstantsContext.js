// frontend/src/contexts/ConstantsContext.js

import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { DEFAULT_PATIENT_CONSTANTS } from '../constants';
import axios from 'axios';

const ConstantsContext = createContext();

export function ConstantsProvider({ children }) {
  const [patientConstants, setPatientConstants] = useState(DEFAULT_PATIENT_CONSTANTS);
  const [medicationSchedules, setMedicationSchedules] = useState({});
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

      // Get the patient ID from the response if available
      const patientId = constants.patient_id;

      // Fetch medication schedules if we have a patient ID
      if (patientId) {
        await fetchMedicationSchedules(patientId);
      }

      // Merge with defaults to ensure all required fields exist
      return {
        ...DEFAULT_PATIENT_CONSTANTS,
        ...constants,
        disease_factors: constants.disease_factors || DEFAULT_PATIENT_CONSTANTS.disease_factors,
        medication_factors: constants.medication_factors || DEFAULT_PATIENT_CONSTANTS.medication_factors,
        active_conditions: constants.active_conditions || [],
        active_medications: constants.active_medications || [],
        medication_schedules: constants.medication_schedules || {}
      };
    } catch (error) {
      console.error('Error fetching patient constants:', error);
      throw new Error('Failed to fetch patient constants');
    }
  };
  // Continuing from part 1...

  const fetchMedicationSchedules = async (patientId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const response = await axios.get(
        `http://localhost:5000/api/medication-schedule/${patientId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.schedules) {
        const schedulesMap = response.data.schedules.reduce((acc, schedule) => {
          acc[schedule.medication] = schedule;
          return acc;
        }, {});

        setMedicationSchedules(schedulesMap);

        // Update patient constants with medication schedules
        setPatientConstants(prev => ({
          ...prev,
          medication_schedules: schedulesMap
        }));
      }
    } catch (error) {
      console.error('Error fetching medication schedules:', error);
      setError('Failed to fetch medication schedules');
    } finally {
      setLoading(false);
    }
  };

  const updateMedicationSchedule = async (patientId, medication, scheduleData) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Ensure scheduleData is properly formatted
      const formattedSchedule = {
        startDate: new Date(scheduleData.startDate).toISOString(),
        endDate: new Date(scheduleData.endDate).toISOString(),
        dailyTimes: scheduleData.dailyTimes
      };

      const response = await axios({
        method: 'post',
        url: `http://localhost:5000/api/medication-schedule/${patientId}`,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          medication,
          schedule: formattedSchedule
        }
      });

      if (response.data.schedule) {
        // Update local state with the new schedule
        setMedicationSchedules(prev => ({
          ...prev,
          [medication]: response.data.schedule
        }));

        // Update patient constants
        setPatientConstants(prev => ({
          ...prev,
          medication_schedules: {
            ...(prev.medication_schedules || {}),
            [medication]: response.data.schedule
          }
        }));

        return response.data.schedule;
      }
    } catch (error) {
      console.error('Error updating medication schedule:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  // Continuing from part 2...

  const deleteMedicationSchedule = async (patientId, medication) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await axios({
        method: 'delete',
        url: `http://localhost:5000/api/medication-schedule/${patientId}/${medication}`,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 200) {
        // Remove schedule from local state
        setMedicationSchedules(prev => {
          const updated = { ...prev };
          delete updated[medication];
          return updated;
        });

        // Remove from patient constants
        setPatientConstants(prev => {
          const updatedSchedules = { ...prev.medication_schedules };
          delete updatedSchedules[medication];
          return {
            ...prev,
            medication_schedules: updatedSchedules
          };
        });
      }
    } catch (error) {
      console.error('Error deleting medication schedule:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const refreshConstants = useCallback(async () => {
    try {
      setLoading(true);
      const constants = await fetchPatientConstants();
      setPatientConstants(constants);
      setError(null);
    } catch (err) {
      console.error('Error refreshing data:', err);
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

  // Event listener for medication schedule updates
  useEffect(() => {
    const handleScheduleUpdate = (event) => {
      const { medication, schedule } = event.detail;
      setMedicationSchedules(prev => ({
        ...prev,
        [medication]: schedule
      }));

      setPatientConstants(prev => ({
        ...prev,
        medication_schedules: {
          ...(prev.medication_schedules || {}),
          [medication]: schedule
        }
      }));
    };

    window.addEventListener('medicationScheduleUpdated', handleScheduleUpdate);
    return () => {
      window.removeEventListener('medicationScheduleUpdated', handleScheduleUpdate);
    };
  }, []);
  // Continuing from part 3...

  const contextValue = {
    patientConstants,
    medicationSchedules,
    loading,
    error,
    refreshConstants,
    setPatientConstants,
    updateMedicationSchedule,
    deleteMedicationSchedule,
    fetchMedicationSchedules
  };

  return (
    <ConstantsContext.Provider value={contextValue}>
      {children}
    </ConstantsContext.Provider>
  );
}

// Custom hook to use the constants context
export function useConstants() {
  const context = useContext(ConstantsContext);
  if (!context) {
    throw new Error('useConstants must be used within a ConstantsProvider');
  }
  return context;
}

export default ConstantsContext;