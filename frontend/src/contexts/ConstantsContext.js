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

      // Merge with defaults to ensure all required fields exist
      return {
        ...DEFAULT_PATIENT_CONSTANTS,
        ...constants,
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

  // Function to fetch medication schedules for a patient
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
      }
    } catch (error) {
      console.error('Error fetching medication schedules:', error);
      setError('Failed to fetch medication schedules');
    } finally {
      setLoading(false);
    }
  };
  // Function to update medication schedule
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

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('medicationScheduleUpdated', {
          detail: {
            medication,
            schedule: response.data.schedule
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



  // Function to delete medication schedule
  const deleteMedicationSchedule = async (patientId, scheduleId) => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      const response = await axios.delete(
        `http://localhost:5000/api/medication-schedule/${patientId}/${scheduleId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data.deleted_schedule_id) {
        // Update local state by removing the deleted schedule
        setMedicationSchedules(prev => {
          const updated = { ...prev };
          // Find and remove the deleted schedule
          Object.keys(updated).forEach(key => {
            if (updated[key].id === scheduleId) {
              delete updated[key];
            }
          });
          return updated;
        });

        // Dispatch event for other components
        window.dispatchEvent(new CustomEvent('medicationScheduleDeleted', {
          detail: {
            patientId,
            scheduleId
          }
        }));
      }
    } catch (error) {
      console.error('Error deleting medication schedule:', error);
      setError(error.response?.data?.message || 'Failed to delete medication schedule');
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

      // Always fetch medication schedules if we have a patient ID
      if (constants.patient_id) {
        await fetchMedicationSchedules(constants.patient_id);
      }

      setError(null);
    } catch (err) {
      console.error('Error refreshing data:', err);
      setError(err.message);
      setPatientConstants(DEFAULT_PATIENT_CONSTANTS);
    } finally {
      setLoading(false);
    }
  }, []);

     useEffect(() => {
    if (patientConstants.patient_id) {
      fetchMedicationSchedules(patientConstants.patient_id);
    }
  }, [patientConstants.patient_id]);

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

    const handleScheduleUpdate = (event) => {
      const { medication, schedule } = event.detail;
      setMedicationSchedules(prev => ({
        ...prev,
        [medication]: schedule
      }));
    };

    window.addEventListener('patientConstantsUpdated', handleConstantsUpdate);
    window.addEventListener('medicationScheduleUpdated', handleScheduleUpdate);

    return () => {
      window.removeEventListener('patientConstantsUpdated', handleConstantsUpdate);
      window.removeEventListener('medicationScheduleUpdated', handleScheduleUpdate);
    };
  }, []);

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

export function useConstants() {
  const context = useContext(ConstantsContext);
  if (!context) {
    throw new Error('useConstants must be used within a ConstantsProvider');
  }
  return context;
}