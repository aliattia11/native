// frontend/src/components/InsulinInput.js
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useConstants } from '../contexts/ConstantsContext';
import styles from './InsulinInput.module.css';
import { FaInfoCircle } from 'react-icons/fa';

const InsulinInput = ({
  onInsulinChange,
  initialInsulin = '',
  initialDose = '',
  isStandalone = true,
  onDoseLogged = null,
  suggestedInsulin = null,
  suggestedInsulinType = null,
  className = ''
}) => {
  const { patientConstants, loading, error } = useConstants();
  const [selectedInsulin, setSelectedInsulin] = useState(initialInsulin || '');
  const [dose, setDose] = useState(initialDose || '');
  const [scheduledTime, setScheduledTime] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDoses, setRecentDoses] = useState([]);

  // Prevent propagation of events that could cause form submission
  const preventEventPropagation = (e) => {
    e.stopPropagation();
  };

  // Get insulin options from patient constants with memoization
  const insulinOptions = useMemo(() => {
    if (!patientConstants?.medication_factors) {
      return [];
    }

    try {
      return Object.entries(patientConstants.medication_factors)
        .filter(([name, details]) => {
          // Check if the name contains 'insulin' and is not a hormone or other medication
          const isInsulin = name.includes('insulin') &&
            !['injectable_contraceptives', 'oral_contraceptives'].includes(name);
          return isInsulin && details && details.type;  // Make sure details and type exist
        })
        .map(([name, details]) => ({
          value: name,
          label: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          type: details.type || 'unknown',  // Provide default if type is missing
          ...details
        }))
        .sort((a, b) => {
          // First sort by type
          if (a.type !== b.type) {
            const typeOrder = {
              'rapid_acting': 1,
              'short_acting': 2,
              'intermediate_acting': 3,
              'long_acting': 4,
              'mixed': 5
            };
            return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
          }

          // Then sort by name if types are the same
          const nameA = a.label || a.value || '';
          const nameB = b.label || b.value || '';
          return nameA.localeCompare(nameB);
        });
    } catch (err) {
      console.error('Error processing insulin options:', err);
      return [];
    }
  }, [patientConstants]);

  useEffect(() => {
    // Set default scheduled time to now
    const now = new Date();
    setScheduledTime(now.toISOString().slice(0, 16));

    // Update state from props when they change
    setSelectedInsulin(initialInsulin || '');
    setDose(initialDose || '');

    // Fetch recent doses if standalone
    if (isStandalone) {
      fetchRecentDoses();
    }
  }, [initialInsulin, initialDose, isStandalone]);

  const fetchRecentDoses = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

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

      if (response.data && response.data.logs) {
        setRecentDoses(response.data.logs);
      }
    } catch (err) {
      // Silent fail for this non-critical feature
    }
  };

  const handleDoseChange = (e) => {
    preventEventPropagation(e);
    const value = e.target.value;
    if (!isNaN(value) && (value === '' || parseFloat(value) >= 0)) {
      setDose(value);

      // Notify parent component when embedded
      if (!isStandalone && onInsulinChange) {
        onInsulinChange({
          type: selectedInsulin,
          dose: value
        });
      }
    }
  };

  const handleInsulinTypeChange = (e) => {
    preventEventPropagation(e);
    setSelectedInsulin(e.target.value);

    // Notify parent component when embedded
    if (!isStandalone && onInsulinChange) {
      onInsulinChange({
        type: e.target.value,
        dose: dose
      });
    }
  };

  const handleNotesChange = (e) => {
    preventEventPropagation(e);
    setNotes(e.target.value);

    // Include notes in parent notification if embedded
    if (!isStandalone && onInsulinChange) {
      onInsulinChange({
        type: selectedInsulin,
        dose: dose,
        notes: e.target.value
      });
    }
  };

  const handleSubmit = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // For embedded mode, just notify parent and don't try to submit directly
    if (!isStandalone) {
      if (onInsulinChange) {
        onInsulinChange({
          type: selectedInsulin,
          dose: dose,
          notes: notes
        });
      }
      return;
    }

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
      if (!token) {
        throw new Error('Session token not found. Please log in again.');
      }

      // Use the meal endpoint with insulin-only data (same as what MealInput uses)
      const response = await axios.post(
        'http://localhost:5000/api/meal',
        {
          mealType: 'insulin_only',
          recordingType: 'insulin',
          foodItems: [],
          activities: [],
          bloodSugar: null,
          bloodSugarSource: 'none',
          intendedInsulin: parseFloat(dose),
          intendedInsulinType: selectedInsulin,
          notes: notes,
          medicationLog: {
            is_insulin: true,
            dose: parseFloat(dose),
            medication: selectedInsulin,
            scheduled_time: scheduledTime || new Date().toISOString(),
            notes: notes
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.status === 201 || response.status === 200) {
        setMessage('Insulin dose logged successfully');
        await fetchRecentDoses();

        // Reset form if standalone
        setSelectedInsulin('');
        setDose('');
        setNotes('');
        setScheduledTime(new Date().toISOString().slice(0, 16));

        // Notify parent components
        if (onDoseLogged) {
          onDoseLogged(response.data);
        }
      }
    } catch (err) {
      let errorMessage = 'An error occurred while recording insulin dose';

      if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setMessage(`Error: ${errorMessage}`);
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
    <div className={`${styles.insulinInput} ${className}`}>
      {isStandalone && <h3>Record Insulin</h3>}

      {/* We need this form even in embedded mode but will prevent submission */}
      <form onSubmit={handleSubmit} onClick={preventEventPropagation}>
        {/* Only show suggested insulin if provided and not null */}
        {!isStandalone && suggestedInsulin !== null && (
          <div className={`${styles.inputGroup} ${styles.readOnlyField}`}>
            <label htmlFor="suggestedInsulin">Suggested Insulin Intake (units)</label>
            <div className={styles.insulinInputGroup}>
              <input
                id="suggestedInsulin"
                type="number"
                value={suggestedInsulin}
                readOnly
                placeholder="Calculated based on meal and activities"
                onClick={preventEventPropagation}
              />
              <input
                id="suggestedInsulinType"
                type="text"
                value={(() => {
                  const insulin = patientConstants?.medication_factors?.[suggestedInsulinType];
                  if (!insulin) return '';
                  return `${suggestedInsulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} 
                  (${insulin.type?.split('_')[0] || ''} acting)`;
                })()}
                readOnly
                className={styles.insulinTypeReadOnly}
                onClick={preventEventPropagation}
              />
            </div>
          </div>
        )}

        {/* Insulin type and dose selection */}
        <div className={styles.inputGroup}>
          <label htmlFor="intendedInsulin">
            {isStandalone ? 'Insulin Dose (units)' : 'Intended Insulin Intake (units)'}
          </label>
          <div className={styles.insulinInputGroup}>
            <input
              id="intendedInsulin"
              type="number"
              min="0"
              step="0.1"
              value={dose}
              onChange={handleDoseChange}
              onClick={preventEventPropagation}
              placeholder="Enter insulin dose"
              required
              className={styles.numberInput}
            />
            <select
              id="intendedInsulinType"
              value={selectedInsulin}
              onChange={handleInsulinTypeChange}
              onClick={preventEventPropagation}
              required
              className={styles.insulinTypeSelect}
            >
              <option value="">Select Type</option>
              {insulinOptions.map(insulin => (
                <option
                  key={insulin.value}
                  value={insulin.value}
                  onClick={preventEventPropagation}
                >
                  {insulin.label} ({(insulin.type || "").split('_')[0]} acting
                  {insulin.brand_names ? ` - ${insulin.brand_names.join(', ')}` : ''})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Show time selector only in standalone mode */}
        {isStandalone && (
          <div className={styles.inputGroup}>
            <label htmlFor="scheduledTime">Time Taken</label>
            <input
              type="datetime-local"
              id="scheduledTime"
              value={scheduledTime}
              onChange={(e) => {
                preventEventPropagation(e);
                setScheduledTime(e.target.value);
              }}
              onClick={preventEventPropagation}
              max={new Date().toISOString().slice(0, 16)}
              required
              className={styles.timeInput}
            />
          </div>
        )}

        {/* Notes field available in both modes */}
        <div className={styles.inputGroup}>
          <label htmlFor="notes">Notes (optional)</label>
          <textarea
            id="notes"
            value={notes}
            onChange={handleNotesChange}
            onClick={preventEventPropagation}
            placeholder="Add any additional notes"
            className={styles.notesInput}
          />
        </div>

        {message && (
          <div className={`${styles.message} ${
            message.includes('Error') ? styles.error : styles.success
          }`}>
            {message}
          </div>
        )}

        {/* Show submit button only in standalone mode */}
        {isStandalone && (
          <button
            type="submit"
            disabled={isSubmitting || !selectedInsulin || !dose}
            onClick={(e) => {
              preventEventPropagation(e);
              handleSubmit(e);
            }}
            className={styles.submitButton}
          >
            {isSubmitting ? 'Recording...' : 'Record Insulin'}
          </button>
        )}
      </form>

      {/* Show recent doses only in standalone mode */}
      {isStandalone && recentDoses.length > 0 && (
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