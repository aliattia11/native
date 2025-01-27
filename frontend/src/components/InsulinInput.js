
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './InsulinInput.module.css';

const InsulinInput = ({
  onInsulinChange,
  initialInsulin = null,
  isStandalone = false
}) => {
  const { patientConstants } = useConstants();
  const [selectedInsulin, setSelectedInsulin] = useState('');
  const [dose, setDose] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [recentDoses, setRecentDoses] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get insulin options from patient constants
  const insulinOptions = React.useMemo(() => {
    if (!patientConstants?.medication_factors) return [];

    return Object.entries(patientConstants.medication_factors)
      .filter(([name, details]) => {
        // Filter insulin medications based on their properties
        return (
          name.toLowerCase().includes('insulin') || // Check if name contains 'insulin'
          details.medication_type === 'insulin' ||  // Check if type is insulin
          details.is_insulin                        // Check is_insulin flag
        );
      })
      .map(([name, details]) => ({
        value: name,
        label: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        ...details
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [patientConstants]);

  useEffect(() => {
    // Log for debugging
    console.log('Patient Constants:', patientConstants);
    console.log('Insulin Options:', insulinOptions);

    if (initialInsulin) {
      setSelectedInsulin(initialInsulin);
      setDose('');
    }

    // Set default scheduled time to now
    const now = new Date();
    setScheduledTime(now.toISOString().slice(0, 16));

    // Fetch recent doses
    fetchRecentDoses();
  }, [initialInsulin, patientConstants]);

  const fetchRecentDoses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        'http://localhost:5000/api/medication-logs/recent',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          params: {
            medication_type: 'insulin',
            limit: 3
          }
        }
      );

      setRecentDoses(response.data.logs);
    } catch (error) {
      console.error('Error fetching recent doses:', error);
    }
  };

  const handleInsulinSelect = (e) => {
    setSelectedInsulin(e.target.value);
    setDose('');
    setError(null);
  };

  const handleDoseChange = (e) => {
    const value = e.target.value;
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) || value === '') {
      setDose(value);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      if (!selectedInsulin) {
        throw new Error('Please select an insulin type');
      }
      if (!dose || parseFloat(dose) <= 0) {
        throw new Error('Please enter a valid dose');
      }

      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      const response = await axios.post(
        `http://localhost:5000/api/medication-log/${userId}`,
        {
          medication: selectedInsulin,
          dose: parseFloat(dose),
          scheduled_time: scheduledTime || new Date().toISOString(),
          is_insulin: true,
          notes: 'Insulin dose'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 201) {
        setSuccess('Insulin dose logged successfully');
        await fetchRecentDoses();

        if (isStandalone) {
          setSelectedInsulin('');
          setDose('');
          setScheduledTime(new Date().toISOString().slice(0, 16));
        } else if (onInsulinChange) {
          onInsulinChange({
            type: selectedInsulin,
            dose: parseFloat(dose),
            scheduledTime: scheduledTime || new Date().toISOString()
          });
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      console.error('Error submitting insulin dose:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!insulinOptions.length) {
    return (
      <div className={styles.insulinInput}>
        <div className={styles.error}>
          No insulin types available. Please check your medication settings.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.insulinInput}>
      <h3>Record Insulin</h3>

      <div className={styles.inputGroup}>
        <label htmlFor="insulinType">Insulin Type:</label>
        <select
          id="insulinType"
          value={selectedInsulin}
          onChange={handleInsulinSelect}
          className={styles.select}
        >
          <option value="">Select insulin type</option>
          {insulinOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {selectedInsulin && (
        <div className={styles.inputGroup}>
          <label htmlFor="insulinDose">Dose (units):</label>
          <input
            id="insulinDose"
            type="number"
            value={dose}
            onChange={handleDoseChange}
            placeholder="Enter dose"
            min="0"
            step="0.5"
            className={styles.numberInput}
          />
        </div>
      )}

      <div className={styles.inputGroup}>
        <label htmlFor="scheduledTime">Time:</label>
        <input
          type="datetime-local"
          id="scheduledTime"
          value={scheduledTime}
          onChange={(e) => setScheduledTime(e.target.value)}
          max={new Date().toISOString().slice(0, 16)}
          className={styles.timeInput}
        />
      </div>

      {selectedInsulin && patientConstants?.medication_factors?.[selectedInsulin] && (
        <div className={styles.insulinInfo}>
          <h4>Insulin Details</h4>
          <div className={styles.timingInfo}>
            {patientConstants.medication_factors[selectedInsulin].onset_hours && (
              <p>Onset: {patientConstants.medication_factors[selectedInsulin].onset_hours}h</p>
            )}
            {patientConstants.medication_factors[selectedInsulin].peak_hours && (
              <p>Peak: {patientConstants.medication_factors[selectedInsulin].peak_hours}h</p>
            )}
            {patientConstants.medication_factors[selectedInsulin].duration_hours && (
              <p>Duration: {patientConstants.medication_factors[selectedInsulin].duration_hours}h</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {success && (
        <div className={styles.success}>
          {success}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !selectedInsulin || !dose}
        className={styles.submitButton}
      >
        {isSubmitting ? 'Recording...' : 'Record Insulin'}
      </button>

      {recentDoses.length > 0 && (
        <div className={styles.recentDoses}>
          <h4>Recent Insulin Doses</h4>
          <div className={styles.dosesList}>
            {recentDoses.map((dose, index) => (
              <div key={index} className={styles.doseItem}>
                <span className={styles.doseType}>
                  {dose.medication.replace(/_/g, ' ')}
                </span>
                <span className={styles.doseAmount}>
                  {dose.dose} units
                </span>
                <span className={styles.doseTime}>
                  {new Date(dose.scheduled_time).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinInput;