// frontend/src/components/InsulinInput/InsulinInput.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { SHARED_CONSTANTS } from '../constants/shared_constants';
import styles from './InsulinInput.module.css';

const InsulinInput = ({
  onInsulinChange,
  initialInsulin = null,
  isStandalone = false
}) => {
  const [selectedInsulin, setSelectedInsulin] = useState('');
  const [dose, setDose] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [error, setError] = useState(null);

  // Create a flattened and formatted list of insulin options
  const insulinOptions = Object.entries(SHARED_CONSTANTS.INSULIN_TYPES)
    .reduce((acc, [category, insulins]) => {
      const categoryOptions = Object.entries(insulins).map(([name, details]) => ({
        value: name,
        label: `${details.brand_names[0]} (${name.replace(/_/g, ' ')})`,
        category,
        ...details
      }));
      return [...acc, ...categoryOptions];
    }, [])
    .sort((a, b) => a.label.localeCompare(b.label));

  // Group insulin options by category for the select element
  const groupedInsulinOptions = Object.entries(SHARED_CONSTANTS.INSULIN_TYPES)
    .map(([category, insulins]) => ({
      label: category.replace(/_/g, ' ').toUpperCase(),
      options: Object.entries(insulins).map(([name, details]) => ({
        value: name,
        label: `${details.brand_names[0]} (${name.replace(/_/g, ' ')})`,
      }))
    }));

  useEffect(() => {
    if (initialInsulin) {
      setSelectedInsulin(initialInsulin);
      setDose('');
    }

    // Set default scheduled time to now
    const now = new Date();
    setScheduledTime(now.toISOString().slice(0, 16)); // Format: YYYY-MM-DDThh:mm
  }, [initialInsulin]);

  const handleInsulinSelect = (e) => {
    setSelectedInsulin(e.target.value);
    setDose(''); // Reset dose when insulin type changes
  };

  const handleDoseChange = (e) => {
    const value = e.target.value;
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue) || value === '') {
      setDose(value);
    }
  };

  const handleSubmit = async () => {
    try {
      setError(null);

      // Validate inputs
      if (!selectedInsulin) {
        throw new Error('Please select an insulin type');
      }
      if (!dose || parseFloat(dose) <= 0) {
        throw new Error('Please enter a valid dose');
      }

      const insulinData = {
        type: selectedInsulin,
        dose: parseFloat(dose),
        scheduledTime: scheduledTime || new Date().toISOString()
      };

      if (isStandalone) {
        // Submit as standalone insulin record
        const token = localStorage.getItem('token');
        const response = await axios.post(
          'http://localhost:5000/api/meal',
          {
            mealType: 'insulin_only',
            foodItems: [],
            activities: [],
            intendedInsulin: parseFloat(dose),
            intendedInsulinType: selectedInsulin,
            timestamp: scheduledTime || new Date().toISOString()
          },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.status === 201) {
          // Reset form
          setSelectedInsulin('');
          setDose('');
          setScheduledTime(new Date().toISOString().slice(0, 16));
        }
      } else {
        // Pass data to parent MealInput component
        if (onInsulinChange) {
          onInsulinChange(insulinData);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to submit insulin data');
      console.error('Error submitting insulin data:', err);
    }
  };

  return (
    <div className={styles.insulinInput}>
      <h3>Record Insulin</h3>

      {/* Insulin Type Selection */}
      <div className={styles.inputGroup}>
        <label htmlFor="insulinType">Insulin Type:</label>
        <select
          id="insulinType"
          value={selectedInsulin}
          onChange={handleInsulinSelect}
          className={styles.select}
        >
          <option value="">Select insulin type</option>
          {groupedInsulinOptions.map(group => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Dose Input */}
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

      {/* Scheduled Time */}
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

      {/* Error Display */}
      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {/* Submit Button (only show in standalone mode) */}
      {isStandalone && (
        <button
          onClick={handleSubmit}
          disabled={!selectedInsulin || !dose}
          className={styles.submitButton}
        >
          Record Insulin
        </button>
      )}
    </div>
  );
};

export default InsulinInput;