import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (initialValue) {
      setLocalValue(unit === 'mmol/L' ? mgdlToMmol(initialValue) : initialValue);
    }
  }, [initialValue, unit]);

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

      if (onBloodSugarChange) onBloodSugarChange('');
      if (onSubmitSuccess) onSubmitSuccess(result);

    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Error recording blood sugar level' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`blood-sugar-input ${className}`}>
      {standalone && <h2>Record Blood Sugar Level</h2>}
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
    </div>
  );
};

export default BloodSugarInput;