import React, { useState } from 'react';
import styles from './DurationInput.module.css';

const DurationInput = ({ value, onChange }) => {
  const [hours, setHours] = useState(value ? Math.floor(value) : 12);
  const [minutes, setMinutes] = useState(value ? Math.round((value % 1) * 60) : 0);

  const handleHoursChange = (e) => {
    const newHours = Math.max(0, Math.min(23, parseInt(e.target.value) || 0));
    setHours(newHours);
    onChange(newHours + minutes / 60);
  };

  const handleMinutesChange = (e) => {
    const newMinutes = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
    setMinutes(newMinutes);
    onChange(hours + newMinutes / 60);
  };

  return (
    <div className={styles.durationInput}>
      <input
        type="number"
        value={hours.toString().padStart(2, '0')}
        onChange={handleHoursChange}
        min="0"
        max="23"
        className={styles.timeInput}
      />
      <span>:</span>
      <input
        type="number"
        value={minutes.toString().padStart(2, '0')}
        onChange={handleMinutesChange}
        min="0"
        max="59"
        className={styles.timeInput}
      />
    </div>
  );
};

export default DurationInput;