import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useConstants } from '../contexts/ConstantsContext';
import {
  formatInsulinName,
  getAvailableInsulinTypes,
  getInsulinTypesByCategory
} from '../utils/insulinUtils';
import styles from './InsulinInput.module.css';
import { FaInfoCircle, FaChevronDown, FaChevronUp, FaClock, FaFileImport, FaSync, FaHistory } from 'react-icons/fa';
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
  const [isLoadingDoses, setIsLoadingDoses] = useState(false);
  const [showRecentDoses, setShowRecentDoses] = useState(false);
  // New state for import functionality
  const [importStatus, setImportStatus] = useState(null);

  // Create a ref for the file input element
  const fileInputRef = useRef(null);

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
      setIsLoadingDoses(true);
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
            limit: 5
          }
        }
      );

      if (response.data && response.data.logs) {
        console.log('Recent doses fetched:', response.data.logs);

        // Process each dose with improved timestamp handling
        const processedDoses = response.data.logs.map(dose => {
          // Parse timestamps with our enhanced function that handles timezone correctly
          const scheduledTime = dose.scheduled_time || dose.taken_at;
          const takenAt = dose.taken_at || dose.scheduled_time;

          return {
            ...dose,
            scheduled_time: scheduledTime,
            taken_at: takenAt,
            // Add parsed timestamps as Date objects for accurate calculations
            scheduled_time_date: TimeManager.parseTimestamp(scheduledTime),
            taken_at_date: TimeManager.parseTimestamp(takenAt)
          };
        });

        setRecentDoses(processedDoses);
      }
    } catch (err) {
      console.error('Error fetching recent doses:', err);
      setMessage('Failed to load recent insulin doses');
    } finally {
      setIsLoadingDoses(false);
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

  const calculateActiveStatus = (dose) => {
    // Get system time instead of browser time
    const now = TimeManager.parseTimestamp(TimeManager.getSystemDateTime());

    // Handle cases where the effect timing fields aren't available
    if (!dose.effect_start_time || !dose.effect_end_time) {
      return "Unknown status";
    }

    const effectStart = TimeManager.parseTimestamp(dose.effect_start_time);
    const onsetTime = dose.onset_time ? TimeManager.parseTimestamp(dose.onset_time) : null;
    const peakTime = dose.peak_time ? TimeManager.parseTimestamp(dose.peak_time) : null;
    const effectEnd = TimeManager.parseTimestamp(dose.effect_end_time);

    if (now < effectStart) {
      return "Not yet active";
    } else if (onsetTime && now < onsetTime) {
      return "Starting to work";
    } else if (peakTime && now < peakTime) {
      return "Approaching peak";
    } else if (now < effectEnd) {
      return "Active and decreasing";
    } else {
      return "Completed";
    }
  };

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  // Toggle recent doses view
  const toggleRecentDoses = () => {
    setShowRecentDoses(prev => !prev);
    if (!showRecentDoses) {
      fetchRecentDoses();
    }
  };

  // New function for handling import button click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // New function for handling file upload for import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'csv' && fileExt !== 'json') {
      setImportStatus({
        type: 'error',
        message: 'Invalid file format. Please select a CSV or JSON file.'
      });
      return;
    }

    setIsSubmitting(true);
    setImportStatus({ type: 'info', message: 'Validating file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'insulin');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // First validate the file
      const validationResponse = await axios.post(
        'http://localhost:5000/api/import/validate',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!validationResponse.data.valid) {
        setImportStatus({
          type: 'error',
          message: 'File validation failed',
          details: validationResponse.data.errors?.join('\n')
        });
        setIsSubmitting(false);
        return;
      }

      // If validation passes, proceed with import
      setImportStatus({ type: 'info', message: 'Importing data...' });

      const importResponse = await axios.post(
        'http://localhost:5000/api/import',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const results = importResponse.data.results;

      setImportStatus({
        type: 'success',
        message: `Successfully imported ${results.insulin_imported || 0} insulin doses`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh the recent doses list and constants
      await fetchRecentDoses();
      await refreshConstants();
      await fetchActiveInsulin(); // Update active insulin data

    } catch (error) {
      console.error('Error importing data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [activeInsulin, setActiveInsulin] = useState(null);

  const handleActiveInsulinData = (backendData) => {
    if (!backendData) return null;

    // Parse calculation time using our enhanced parser
    const calculationTime = TimeManager.parseTimestamp(backendData.calculation_time);

    // Process insulin contributions with corrected timestamp handling
    const contributions = backendData.insulin_contributions.map(contrib => {
      // Ensure we parse the timestamp correctly to avoid timezone issues
      const takenAt = TimeManager.parseTimestamp(contrib.taken_at);

      return {
        ...contrib,
        taken_at: contrib.taken_at,
        // Store the correctly parsed date object for accurate time calculations
        taken_at_date: takenAt
      };
    });

    return {
      ...backendData,
      calculation_time_local: calculationTime,
      insulin_contributions: contributions
    };
  };

  // Update fetchActiveInsulin function to use enhanced timestamp handling
  const fetchActiveInsulin = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      console.log("Fetching active insulin data...");

      const response = await axios.get(
        'http://localhost:5000/api/active-insulin',
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      // Process the response data with our improved handler
      const processedData = handleActiveInsulinData(response.data);
      console.log("Active insulin data:", processedData);

      setActiveInsulin(processedData);
    } catch (err) {
      console.error("Error fetching active insulin", err);
    }
  };


  // Call this when component loads and after recording insulin
  useEffect(() => {
    fetchActiveInsulin();
  }, []);

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

      // Convert local time to UTC ISO string for sending to backend
      const utcScheduledTime = TimeManager.localToUTCISOString(scheduledTime);

      console.log('Submitting insulin dose with scheduled time:', scheduledTime);
      console.log('UTC scheduled time for backend:', utcScheduledTime);

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
            scheduled_time: utcScheduledTime, // Send UTC time to backend
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

        // Refresh the list of doses to show the newly added one
        await fetchRecentDoses();
        await refreshConstants();
        await fetchActiveInsulin(); // Update active insulin data after logging a new dose

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
      {isStandalone && (
        <div className={styles.insulinHeader}>
          <h3 className={styles.title}>Record Insulin</h3>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.refreshButton}`}
              onClick={fetchRecentDoses}
              title="Refresh insulin doses"
              disabled={isSubmitting}
            >
              <FaSync className={isLoadingDoses ? styles.spin : ""} />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.historyButton}`}
              onClick={toggleRecentDoses}
              title={showRecentDoses ? "Hide recent doses" : "Show recent doses"}
            >
              <FaHistory />
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.importButton}`}
              onClick={handleImportClick}
              title="Import insulin doses"
              disabled={isSubmitting}
            >
              <FaFileImport />
            </button>
            {/* Hidden file input triggered by the import button */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv,.json"
              onChange={handleFileUpload}
            />
          </div>
        </div>
      )}

      {/* Import Status Message */}
      {importStatus && (
        <div className={`${styles.message} ${styles[importStatus.type]}`}>
          <FaInfoCircle className={styles.messageIcon} />
          <div className={styles.messageContent}>
            <h4>{importStatus.message}</h4>
            {importStatus.details && (
              <pre className={styles.details}>{importStatus.details}</pre>
            )}
          </div>
        </div>
      )}

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

        {activeInsulin && activeInsulin.total_active_insulin > 0 && (
          <div className={styles.activeInsulinSection}>
            <h4>
              Active Insulin: {activeInsulin.total_active_insulin} units
              <span className={styles.calculationTime}>
                (as of {TimeManager.formatDateTime(activeInsulin.calculation_time_local)})
              </span>
            </h4>
            <div className={styles.insulinContributions}>
              {activeInsulin.insulin_contributions.map((contrib, idx) => (
                <div key={idx} className={styles.insulinDose}>
                  <span className={styles.doseMedication}>
                    {formatInsulinName(contrib.medication)}
                  </span>
                  <span className={styles.doseDetails}>
                    {contrib.initial_dose} units, {contrib.active_units} active
                    <div className={styles.doseTime}>
                      {/* Use our improved relative time formatting with correct date objects */}
                      Taken {TimeManager.formatRelativeTime(contrib.taken_at_date)}
                      ({Math.round(contrib.activity_percent)}% active)
                    </div>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

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
      {isStandalone && showRecentDoses && (
        <div className={styles.recentDoses}>
          <h4>Recent Insulin Doses</h4>
          {isLoadingDoses ? (
            <div className={styles.loadingDoses}>Loading recent doses...</div>
          ) : recentDoses.length > 0 ? (
            <div className={styles.dosesList}>
              {recentDoses.map((dose, index) => (
                <div key={index} className={styles.doseItem}>
                  <div className={styles.doseHeader}>
                    <span className={styles.doseType}>
                      {formatInsulinName(dose.medication)}
                    </span>
                    <span className={styles.doseAmount}>
                      {dose.dose} units
                    </span>
                  </div>
                  <div className={styles.doseDetails}>
                    <span className={styles.doseTime}>
                      {TimeManager.formatDateTime(dose.taken_at_date || dose.taken_at || dose.scheduled_time)}
                    </span>
                    {dose.effect_end_time && (
                      <span className={styles.doseActivity}>
                        {calculateActiveStatus(dose)}
                        {TimeManager.parseTimestamp(TimeManager.getSystemDateTime()) < TimeManager.parseTimestamp(dose.effect_end_time) ?
                          ` (Active until ${TimeManager.formatTime(dose.effect_end_time)})` :
                          " (Inactive)"}
                      </span>
                    )}
                    {dose.notes && (
                      <span className={styles.doseNotes}>{dose.notes}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noDoses}>No recent insulin doses found</p>
          )}
          <div className={styles.dosesFooter}>
            <span className={styles.importNote}>
              Need to import multiple doses? Click the <FaFileImport className={styles.inlineIcon} /> import button above.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinInput;