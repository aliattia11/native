import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { FaFileImport, FaSync, FaHistory, FaInfoCircle } from 'react-icons/fa';
import './BloodSugarInput.css';
import TimeInput from './TimeInput';
import TimeManager from '../utils/TimeManager';

const BloodSugarInput = ({
  onBloodSugarChange,
  initialValue = '',
  disabled = false,
  standalone = true,
  className = '',
  onSubmitSuccess = null
}) => {
  const [localValue, setLocalValue] = useState('');
  const [unit, setUnit] = useState('mg/dL');
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const [readingTime, setReadingTime] = useState(TimeManager.getCurrentTimeISOString());
  const [recentReadings, setRecentReadings] = useState([]);
  const [showRecentReadings, setShowRecentReadings] = useState(false);
  const [importStatus, setImportStatus] = useState(null);

  // Create a ref for the file input element
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (initialValue) {
      setLocalValue(unit === 'mmol/L' ? mgdlToMmol(initialValue) : initialValue);
    }
  }, [initialValue, unit]);

  // Load recent readings when in standalone mode
  useEffect(() => {
    if (standalone) {
      fetchRecentReadings();
    }
  }, [standalone]);

  // Conversion functions
  const mmolToMgdl = (mmol) => Math.round(mmol * 18);
  const mgdlToMmol = (mgdl) => (mgdl / 18).toFixed(1);

  const validateBloodSugar = (value, unit) => {
    const num = parseFloat(value);
    if (isNaN(num)) return 'Please enter a valid number';
    if (num < 0) return 'Blood sugar cannot be negative';

    if (unit === 'mg/dL') {
      if (num > 600) return 'Blood sugar value seems too high';
    } else {
      if (num > 33.3) return 'Blood sugar value seems too high';
    }
    return '';
  };

  const handleInputChange = (e) => {
    const inputValue = e.target.value;
    setLocalValue(inputValue);
    setStatus({ type: '', message: '' });
  };

  const handleBlur = () => {
    if (localValue && !isNaN(parseFloat(localValue))) {
      const error = validateBloodSugar(localValue, unit);
      if (error) {
        setStatus({ type: 'error', message: error });
        return;
      }

      const bloodSugarMgdl = unit === 'mmol/L'
        ? mmolToMgdl(parseFloat(localValue))
        : parseFloat(localValue);

      if (onBloodSugarChange) {
        // Convert local time to UTC ISO string for the backend
        const utcTimestamp = TimeManager.localToUTCISOString(readingTime);
        onBloodSugarChange(bloodSugarMgdl, utcTimestamp);
      }
    }
  };

  const handleReadingTimeChange = (timeValue) => {
    setReadingTime(timeValue);

    // If we already have a blood sugar value, update the parent component with the new time
    if (localValue && !isNaN(parseFloat(localValue))) {
      const bloodSugarMgdl = unit === 'mmol/L'
        ? mmolToMgdl(parseFloat(localValue))
        : parseFloat(localValue);

      if (onBloodSugarChange) {
        // Convert local time to UTC ISO string for the backend
        const utcTimestamp = TimeManager.localToUTCISOString(timeValue);
        onBloodSugarChange(bloodSugarMgdl, utcTimestamp);
      }
    }
  };

  const fetchRecentReadings = useCallback(async () => {
    if (!standalone) return;

    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found');
        return;
      }

      const response = await axios.get(
        'http://localhost:5000/api/blood-sugar',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            limit: 5,
            filter_by: 'reading_time'
          }
        }
      );

      if (response.data && Array.isArray(response.data)) {
        // Convert values if needed based on unit preference
        const formattedReadings = response.data.map(reading => ({
          ...reading,
          displayValue: unit === 'mmol/L'
            ? mgdlToMmol(reading.bloodSugar)
            : reading.bloodSugar.toFixed(0),
          displayUnit: unit,
          readingTime: reading.bloodSugarTimestamp
            ? TimeManager.utcToLocalString(reading.bloodSugarTimestamp)
            : TimeManager.utcToLocalString(reading.timestamp)
        }));

        setRecentReadings(formattedReadings);
      }
    } catch (error) {
      console.error('Error fetching recent readings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [standalone, unit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!standalone) return;

    const error = validateBloodSugar(localValue, unit);
    if (error) {
      setStatus({ type: 'error', message: error });
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const bloodSugarMgdl = unit === 'mmol/L'
        ? mmolToMgdl(parseFloat(localValue))
        : parseFloat(localValue);

      // Convert local time to UTC ISO string for the backend
      const utcTimestamp = TimeManager.localToUTCISOString(readingTime);

      const response = await fetch('http://localhost:5000/api/meal', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mealType: 'blood_sugar_only',
          foodItems: [],
          activities: [],
          bloodSugar: bloodSugarMgdl,
          bloodSugarSource: 'standalone',
          bloodSugarTimestamp: utcTimestamp, // Send UTC timestamp to backend
          notes: notes,
          recordingType: 'standalone_blood_sugar',
          timestamp: new Date().toISOString() // This is when the record is created
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to record blood sugar');
      }

      const result = await response.json();

      setStatus({ type: 'success', message: 'Blood sugar level recorded successfully' });
      setLocalValue('');
      setNotes('');
      // Reset reading time to current time after successful submission
      setReadingTime(TimeManager.getCurrentTimeISOString());

      // Refresh recent readings list
      fetchRecentReadings();

      if (onBloodSugarChange) onBloodSugarChange('');
      if (onSubmitSuccess) onSubmitSuccess(result);

    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Error recording blood sugar level' });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle click on the import button - triggers file input click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle the file selection for import
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

    setIsLoading(true);
    setImportStatus({ type: 'info', message: 'Validating file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'blood_sugar');

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
        setIsLoading(false);
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
        message: `Successfully imported ${results.blood_sugar_imported || 0} blood sugar readings`,
      });

      // Refresh recent readings to show newly imported data
      await fetchRecentReadings();

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error) {
      console.error('Error importing data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRecentReadings = () => {
    setShowRecentReadings(prev => !prev);
    if (!showRecentReadings) {
      fetchRecentReadings();
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'low':
        return 'status-low';
      case 'high':
        return 'status-high';
      case 'normal':
        return 'status-normal';
      default:
        return '';
    }
  };

  return (
    <div className={`blood-sugar-input ${className}`}>
      {standalone && (
        <div className="blood-sugar-header">
          <h2>Record Blood Sugar Level</h2>
          <div className="action-buttons">
            <button
              type="button"
              className="icon-button refresh-button"
              onClick={fetchRecentReadings}
              title="Refresh readings"
              disabled={isLoading}
            >
              <FaSync className={isLoading ? "spin" : ""} />
            </button>
            <button
              type="button"
              className="icon-button history-button"
              onClick={toggleRecentReadings}
              title={showRecentReadings ? "Hide recent readings" : "Show recent readings"}
            >
              <FaHistory />
            </button>
            <button
              type="button"
              className="icon-button import-button"
              onClick={handleImportClick}
              title="Import blood sugar data"
              disabled={isLoading}
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

      <form onSubmit={handleSubmit} className={standalone ? '' : 'embedded'}>
        <div className="input-group">
          {standalone && <label htmlFor="bloodSugar">Blood Sugar Level:</label>}
          <div className="input-with-unit">
            <input
              id="bloodSugar"
              type="number"
              step={unit === 'mmol/L' ? '0.1' : '1'}
              value={localValue}
              onChange={handleInputChange}
              onBlur={handleBlur}
              placeholder={`Enter blood sugar level in ${unit}`}
              required={standalone}
              disabled={disabled || isLoading}
            />
            <select
              value={unit}
              onChange={(e) => {
                const newUnit = e.target.value;
                if (localValue && !isNaN(parseFloat(localValue))) {
                  if (newUnit === 'mg/dL' && unit === 'mmol/L') {
                    const converted = mmolToMgdl(parseFloat(localValue)).toString();
                    setLocalValue(converted);
                    if (onBloodSugarChange) {
                      const utcTimestamp = TimeManager.localToUTCISOString(readingTime);
                      onBloodSugarChange(parseFloat(converted), utcTimestamp);
                    }
                  } else if (newUnit === 'mmol/L' && unit === 'mg/dL') {
                    const mmolValue = mgdlToMmol(parseFloat(localValue));
                    setLocalValue(mmolValue);
                    if (onBloodSugarChange) {
                      const utcTimestamp = TimeManager.localToUTCISOString(readingTime);
                      onBloodSugarChange(mmolToMgdl(parseFloat(mmolValue)), utcTimestamp);
                    }
                  }
                }
                setUnit(newUnit);
                // Update recent readings display with new unit
                if (recentReadings.length > 0) {
                  setRecentReadings(readings => readings.map(reading => ({
                    ...reading,
                    displayValue: newUnit === 'mmol/L'
                      ? mgdlToMmol(reading.bloodSugar)
                      : reading.bloodSugar.toFixed(0),
                    displayUnit: newUnit
                  })));
                }
              }}
              className="unit-selector"
              disabled={disabled || isLoading}
            >
              <option value="mg/dL">mg/dL</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>
        </div>

        {/* Reading Time Input */}
        <div className="input-group">
          <label htmlFor="readingTime">Reading Time:</label>
          <TimeInput
            mode="timepoint"
            value={readingTime}
            onChange={handleReadingTimeChange}
            className="time-input-field"
            disabled={disabled || isLoading}
            required={standalone}
          />
        </div>

        {/* Add notes textarea only for standalone mode */}
        {standalone && (
          <div className="input-group">
            <label htmlFor="notes">Notes:</label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this reading"
              className="notes-input"
              disabled={disabled || isLoading}
            />
          </div>
        )}

        {standalone && (
          <button type="submit" disabled={disabled || isLoading} className="submit-button">
            {isLoading ? 'Recording...' : 'Record'}
          </button>
        )}
      </form>

      {status.message && (
        <div className={`message ${status.type === 'error' ? 'error' : 'success'}`}>
          {status.message}
        </div>
      )}

      {/* Import Status Message */}
      {importStatus && importStatus.message && (
        <div className={`message import-message ${importStatus.type === 'error' ? 'error' : importStatus.type === 'success' ? 'success' : 'info'}`}>
          <div className="import-message-header">
            <FaInfoCircle className="message-icon" />
            <span>{importStatus.message}</span>
          </div>
          {importStatus.details && (
            <div className="import-details">
              {importStatus.details}
            </div>
          )}
        </div>
      )}

      {/* Recent Readings Section */}
      {standalone && showRecentReadings && (
        <div className="recent-readings">
          <h3>Recent Readings</h3>
          {recentReadings.length > 0 ? (
            <div className="readings-list">
              {recentReadings.map((reading, index) => (
                <div key={reading._id || index} className="reading-item">
                  <div className={`reading-value ${getStatusClass(reading.status)}`}>
                    {reading.displayValue} {reading.displayUnit}
                  </div>
                  <div className="reading-details">
                    <span className="reading-time">
                      {new Date(reading.readingTime).toLocaleString(undefined, {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </span>
                    {reading.notes && (
                      <span className="reading-notes">{reading.notes}</span>
                    )}
                  </div>
                  <div className={`reading-status ${getStatusClass(reading.status)}`}>
                    {reading.status}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-readings">{isLoading ? 'Loading...' : 'No recent readings found'}</p>
          )}
          <div className="readings-footer">
            <span className="import-note">
              Need to import multiple readings? Click the <FaFileImport className="inline-icon" /> import button above.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default BloodSugarInput;