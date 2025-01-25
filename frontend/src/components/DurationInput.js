import React, { useState, useEffect } from 'react';
import styles from './DurationInput.module.css';

const DurationInput = ({ value, onChange }) => {
  // Initialize from string "HH:MM" or number of hours
  const parseInitialValue = (val) => {
    if (typeof val === 'string') {
      const [h, m] = val.split(':').map(Number);
      return { hours: h || 0, minutes: m || 0 };
    }
    return {
      hours: Math.floor(val || 0),
      minutes: Math.round(((val || 0) % 1) * 60)
    };
  };

  const [time, setTime] = useState(parseInitialValue(value));

  useEffect(() => {
    // Update state when value prop changes
    setTime(parseInitialValue(value));
  }, [value]);

  const handleHoursChange = (e) => {
    const newHours = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
    const newTime = { ...time, hours: newHours };
    setTime(newTime);
    onChange(`${newHours}:${time.minutes.toString().padStart(2, '0')}`);
  };

  const handleMinutesChange = (e) => {
    const newMinutes = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
    const newTime = { ...time, minutes: newMinutes };
    setTime(newTime);
    onChange(`${time.hours}:${newMinutes.toString().padStart(2, '0')}`);
  };

  return (
    <div className={styles.durationInput}>
      <input
        type="number"
        value={time.hours.toString().padStart(2, '0')}
        onChange={handleHoursChange}
        min="0"
        max="23"
        className={styles.timeInput}
        aria-label="Hours"
      />
      <span>:</span>
      <input
        type="number"
        value={time.minutes.toString().padStart(2, '0')}
        onChange={handleMinutesChange}
        min="0"
        max="59"
        className={styles.timeInput}
        aria-label="Minutes"
      />
    </div>
  );
};

export default DurationInput;