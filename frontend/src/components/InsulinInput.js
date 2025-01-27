// frontend/src/components/InsulinInput.js
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './InsulinInput.module.css';
import { FaInfoCircle } from 'react-icons/fa';

const InsulinInput = ({
  onInsulinChange,
  initialInsulin = null,
  isStandalone = false,
  onDoseLogged = null
}) => {
  const { patientConstants, loading, error } = useConstants();
  const [selectedInsulin, setSelectedInsulin] = useState('');
  const [dose, setDose] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDoses, setRecentDoses] = useState([]);

  // Get insulin options from patient constants with memoization
  const insulinOptions = useMemo(() => {
    if (!patientConstants?.medication_factors) {
      return [];
    }

    return Object.entries(patientConstants.medication_factors)
      .filter(([_, details]) => details.type && details.type.includes('_acting'))
      .map(([name, details]) => ({
        value: name,
        label: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        category: details.type,
        ...details
      }))
      .sort((a, b) => {
        // Sort by type (rapid, short, intermediate, long)
        const typeOrder = {
          'rapid_acting': 1,
          'short_acting': 2,
          'intermediate_acting': 3,
          'long_acting': 4
        };
        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
      });
  }, [patientConstants]);

  useEffect(() => {
    // Set default scheduled time to now
    const now = new Date();
    setScheduledTime(now.toISOString().slice(0, 16));

    // If initial insulin is provided, set it
    if (initialInsulin) {
      setSelectedInsulin(initialInsulin);
    }

    // Fetch recent doses
    fetchRecentDoses();
  }, [initialInsulin]);

  const fetchRecentDoses = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        'http://localhost:5000/api/medication-logs/recent',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            medication_type: 'insulin',
            limit: 3
          }
        }
      );

      setRecentDoses(response.data.logs);
    } catch (err) {
      console.error('Error fetching recent doses:', err);
      setMessage('Error fetching recent doses');
    }
  };

  const handleInsulinSelect = (e) => {
    setSelectedInsulin(e.target.value);
    setMessage('');
  };

  const handleDoseChange = (e) => {
    const value = e.target.value;
    if (!isNaN(value) && (value === '' || parseFloat(value) >= 0)) {
      setDose(value);
      setMessage('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setIsSubmitting(true);
      setMessage('');

      // Validation
      if (!selectedInsulin) {
        throw new Error('Please select an insulin type');
      }
      if (!dose || parseFloat(dose) <= 0) {
        throw new Error('Please enter a valid dose');
      }

      const token = localStorage.getItem('token');
      const userId = localStorage.getItem('userId');

      if (!token || !userId) {
        throw new Error('Authentication required');
      }

      // Submit insulin dose
      const response = await axios.post(
        `http://localhost:5000/api/medication-log/${userId}`,
        {
          medication: selectedInsulin,
          dose: parseFloat(dose),
          scheduled_time: scheduledTime || new Date().toISOString(),
          is_insulin: true,
          notes: notes
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 201) {
        setMessage('Insulin dose logged successfully');
        await fetchRecentDoses();

        // Reset form if standalone
        if (isStandalone) {
          setSelectedInsulin('');
          setDose('');
          setNotes('');
          setScheduledTime(new Date().toISOString().slice(0, 16));
        }

        // Notify parent components
        if (onInsulinChange) {
          onInsulinChange({
            type: selectedInsulin,
            dose: parseFloat(dose),
            scheduledTime
          });
        }
        if (onDoseLogged) {
          onDoseLogged(response.data);
        }
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.message;
      setMessage(`Error: ${errorMessage}`);
      console.error('Error submitting insulin dose:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading insulin options...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error: {error}</div>;
  }

  return (
    <div className={styles.insulinInput}>
      <h3>Record Insulin</h3>

      <form onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <label htmlFor="insulinType">
            Insulin Type
            <div className={styles.tooltip}>
              <FaInfoCircle className={styles.infoIcon} />
              <span className={styles.tooltipText}>
                Select the type of insulin you are using
              </span>
            </div>
          </label>
          <select
            id="insulinType"
            value={selectedInsulin}
            onChange={handleInsulinSelect}
            className={styles.select}
            required
          >
            <option value="">Select insulin type</option>
            {insulinOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label} ({option.type.split('_')[0]} acting)
              </option>
            ))}
          </select>
        </div>

        {selectedInsulin && (
          <>
            <div className={styles.inputGroup}>
              <label htmlFor="insulinDose">
                Dose (units)
                <div className={styles.tooltip}>
                  <FaInfoCircle className={styles.infoIcon} />
                  <span className={styles.tooltipText}>
                    Enter the number of insulin units
                  </span>
                </div>
              </label>
              <input
                id="insulinDose"
                type="number"
                value={dose}
                onChange={handleDoseChange}
                placeholder="Enter dose"
                min="0"
                step="0.5"
                required
                className={styles.numberInput}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="scheduledTime">Time Taken</label>
              <input
                type="datetime-local"
                id="scheduledTime"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                max={new Date().toISOString().slice(0, 16)}
                required
                className={styles.timeInput}
              />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="notes">Notes (optional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes"
                className={styles.notesInput}
              />
            </div>
          </>
        )}

        {message && (
          <div className={`${styles.message} ${
            message.includes('Error') ? styles.error : styles.success
          }`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !selectedInsulin || !dose}
          className={styles.submitButton}
        >
          {isSubmitting ? 'Recording...' : 'Record Insulin'}
        </button>
      </form>

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
                {dose.notes && (
                  <span className={styles.doseNotes}>{dose.notes}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinInput;