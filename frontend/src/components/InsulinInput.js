import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useConstants } from '../contexts/ConstantsContext';
import {
  formatInsulinName,
  getAvailableInsulinTypes,
  getInsulinTypesByCategory
} from '../utils/insulinUtils';
import styles from './InsulinInput.module.css';
import { FaInfoCircle, FaChevronDown, FaChevronUp, FaClock } from 'react-icons/fa';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';

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
  const { patientConstants, refreshConstants, loading, error } = useConstants();
  const [selectedInsulin, setSelectedInsulin] = useState(initialInsulin);
  const [dose, setDose] = useState(initialDose);
  const [scheduledTime, setScheduledTime] = useState(TimeManager.getCurrentTimeISOString());
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentDoses, setRecentDoses] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [insulinsByCategory, setInsulinsByCategory] = useState({});

  // Use effect to get and categorize insulin types
  useEffect(() => {
    // Set insulin types categorized by action profile
    setInsulinsByCategory(getInsulinTypesByCategory(patientConstants));
  }, [patientConstants]);

  useEffect(() => {
    // Set default scheduled time to now
    setScheduledTime(TimeManager.getCurrentTimeISOString());

    // Update state if props change
    setSelectedInsulin(initialInsulin);
    setDose(initialDose);

    // Fetch recent doses if standalone
    if (isStandalone) {
      fetchRecentDoses();
    }
  }, [initialInsulin, initialDose, isStandalone]);

  const fetchRecentDoses = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No authentication token found for fetching recent doses');
        return;
      }

      // Using the correct endpoint for fetching insulin doses
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
      console.error('Error fetching recent doses:', err);
    }
  };

  const handleDoseChange = (e) => {
    const value = e.target.value;
    if (!isNaN(value) && (value === '' || parseFloat(value) >= 0)) {
      setDose(value);

      // Notify parent component when embedded
      if (!isStandalone && onInsulinChange) {
        onInsulinChange({
          type: selectedInsulin,
          dose: value,
          notes: notes,
          administrationTime: scheduledTime
        });
      }
    }
  };

  const handleInsulinTypeChange = (e) => {
    setSelectedInsulin(e.target.value);
    setDetailsExpanded(false);

    // Notify parent component when embedded
    if (!isStandalone && onInsulinChange) {
      onInsulinChange({
        type: e.target.value,
        dose: dose,
        notes: notes,
        administrationTime: scheduledTime
      });
    }
  };

  const handleNotesChange = (e) => {
    setNotes(e.target.value);

    // Include notes in parent notification if embedded
    if (!isStandalone && onInsulinChange) {
      onInsulinChange({
        type: selectedInsulin,
        dose: dose,
        notes: e.target.value,
        administrationTime: scheduledTime
      });
    }
  };

  const handleTimeChange = (newTime) => {
    setScheduledTime(newTime);

    // Notify parent component when embedded
    if (!isStandalone && onInsulinChange) {
      onInsulinChange({
        type: selectedInsulin,
        dose: dose,
        notes: notes,
        administrationTime: newTime
      });
    }
  };

  const toggleDetails = () => {
    setDetailsExpanded(!detailsExpanded);
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    // For embedded mode, just notify parent and don't try to submit directly
    if (!isStandalone) {
      if (onInsulinChange) {
        onInsulinChange({
          type: selectedInsulin,
          dose: dose,
          notes: notes,
          administrationTime: scheduledTime
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

      // Using the /api/meal endpoint with insulin-specific payload
      const response = await axios.post(
        'http://localhost:5000/api/meal',
        {
          // This payload structure matches what MealInput sends for a meal
          // but only includes the insulin-related parts
          mealType: 'insulin_only',
          recordingType: 'insulin',
          foodItems: [], // Empty array since this is insulin-only
          activities: [], // No activities for insulin-only recording
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
        await refreshConstants();

        // Reset form if standalone
        setSelectedInsulin('');
        setDose('');
        setNotes('');
        setExpanded(false);

        // Update time to current
        setScheduledTime(TimeManager.getCurrentTimeISOString());

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
    <div className={`${styles.insulinInputContainer} ${isStandalone ? styles.standalone : ''} ${className}`}>
      {isStandalone && <h3 className={styles.title}>Record Insulin</h3>}

      <form onSubmit={handleSubmit}>
        {/* Display suggested insulin if provided */}
        {!isStandalone && suggestedInsulin !== null && (
          <div className={styles.suggestedInsulin}>
            <p>Suggested: {suggestedInsulin} units of {formatInsulinName(suggestedInsulinType)}</p>
          </div>
        )}

        {/* Insulin type selection */}
        <div className={styles.inputGroup}>
          <label htmlFor="insulinType">Insulin Type</label>
          <div className={styles.selectContainer}>
            <select
              id="insulinType"
              value={selectedInsulin}
              onChange={handleInsulinTypeChange}
              className={styles.insulinTypeSelect}
              required
            >
              <option value="">Select insulin type</option>

              {Object.entries(insulinsByCategory).map(([category, insulins]) => (
                <optgroup key={category} label={`${category.charAt(0).toUpperCase() + category.slice(1)} Acting`}>
                  {insulins.map(insulin => (
                    <option key={insulin.id} value={insulin.id}>
                      {insulin.name} {insulin.brand_names && `(${insulin.brand_names[0]})`}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {/* Dose input */}
        <div className={styles.inputGroup}>
          <label htmlFor="insulinDose">
            {isStandalone ? 'Insulin Dose (units)' : 'Intended Insulin Intake (units)'}
          </label>
          <input
            id="insulinDose"
            type="number"
            min="0"
            step="0.5"
            value={dose}
            onChange={handleDoseChange}
            className={styles.doseInput}
            required={isStandalone}
          />
        </div>

        {/* Combined administration time and notes section */}
        <div className={styles.collapsibleSection}>
          <button
            type="button"
            onClick={toggleExpanded}
            className={styles.collapsibleToggle}
          >
            <span>Time & Notes</span>
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </button>

          {expanded && (
            <div className={styles.collapsibleContent}>
              {/* Administration time */}
              <div className={styles.inputGroup}>
                <label htmlFor="administrationTime">
                  <FaClock className={styles.timeIcon} /> Administration Time
                </label>
                <TimeInput
                  mode="timepoint"
                  value={scheduledTime}
                  onChange={handleTimeChange}
                  className={styles.timeInput}
                  required={isStandalone}
                />
              </div>

              {/* Notes */}
              <div className={styles.notesContainer}>
                <label htmlFor="insulinNotes">Notes</label>
                <textarea
                  id="insulinNotes"
                  value={notes}
                  onChange={handleNotesChange}
                  placeholder="Add any notes about this insulin dose"
                  className={styles.notesInput}
                />
              </div>
            </div>
          )}
        </div>

        {/* Insulin details accordion */}
        {selectedInsulin && patientConstants?.medication_factors?.[selectedInsulin] && (
          <div className={styles.insulinInfo}>
            <button
              className={styles.infoToggle}
              onClick={toggleDetails}
              type="button"
            >
              {detailsExpanded ? 'Hide Details' : 'Show Details'}
              {detailsExpanded ? <FaChevronUp className={styles.toggleIcon} /> : <FaChevronDown className={styles.toggleIcon} />}
            </button>

            {detailsExpanded && (
              <div className={styles.expandedInfo}>
                <div className={styles.infoGrid}>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Onset:</span>
                    <span className={styles.infoValue}>{patientConstants.medication_factors[selectedInsulin].onset_hours} hours</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Peak:</span>
                    <span className={styles.infoValue}>{patientConstants.medication_factors[selectedInsulin].peak_hours} hours</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Duration:</span>
                    <span className={styles.infoValue}>{patientConstants.medication_factors[selectedInsulin].duration_hours} hours</span>
                  </div>
                  <div className={styles.infoItem}>
                    <span className={styles.infoLabel}>Type:</span>
                    <span className={styles.infoValue}>
                      {patientConstants.medication_factors[selectedInsulin].type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {patientConstants.medication_factors[selectedInsulin].brand_names && (
                  <div className={styles.brandNames}>
                    <span className={styles.infoLabel}>Brand Names:</span>
                    <span className={styles.infoValue}>
                      {patientConstants.medication_factors[selectedInsulin].brand_names.join(', ')}
                    </span>
                  </div>
                )}

                <p className={styles.description}>
                  {patientConstants.medication_factors[selectedInsulin].description}
                </p>

                <div className={styles.insulinTimeline}>
                  <div className={styles.timelineBar}>
                    <div
                      className={styles.onsetMarker}
                      style={{left: `${(patientConstants.medication_factors[selectedInsulin].onset_hours / patientConstants.medication_factors[selectedInsulin].duration_hours) * 100}%`}}
                    >
                      <span>Onset</span>
                    </div>
                    <div
                      className={styles.peakMarker}
                      style={{left: `${(patientConstants.medication_factors[selectedInsulin].peak_hours / patientConstants.medication_factors[selectedInsulin].duration_hours) * 100}%`}}
                    >
                      <span>Peak</span>
                    </div>
                    <div className={styles.durationLine}></div>
                  </div>
                  <div className={styles.timelineLabels}>
                    <span>0h</span>
                    <span>{patientConstants.medication_factors[selectedInsulin].duration_hours}h</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {message && (
          <div className={`${styles.message} ${message.includes('Error') ? styles.error : styles.success}`}>
            {message}
          </div>
        )}

        {/* Submit button only in standalone mode */}
        {isStandalone && (
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isSubmitting || !selectedInsulin || !dose}
          >
            {isSubmitting ? 'Recording...' : 'Record Insulin Dose'}
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
                <div className={styles.doseHeader}>
                  <span className={styles.doseType}>
                    {dose.medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </span>
                  <span className={styles.doseAmount}>
                    {dose.dose} units
                  </span>
                </div>
                <div className={styles.doseDetails}>
                  <span className={styles.doseTime}>
                    {TimeManager.formatDateTime(dose.scheduled_time)}
                  </span>
                  {dose.notes && (
                    <span className={styles.doseNotes}>{dose.notes}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinInput;