import React, { useState } from 'react';
import './BloodSugarInput.css';

const BloodSugarInput = () => {
  const [bloodSugar, setBloodSugar] = useState('');
  const [unit, setUnit] = useState('mg/dL'); // Default to mg/dL
  const [status, setStatus] = useState({ type: '', message: '' });
  const [isLoading, setIsLoading] = useState(false);

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
      if (num > 33.3) return 'Blood sugar value seems too high'; // 600 mg/dL ≈ 33.3 mmol/L
    }
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate input
    const error = validateBloodSugar(bloodSugar, unit);
    if (error) {
      setStatus({ type: 'error', message: error });
      return;
    }

    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');

      // Convert to mg/dL if needed before sending to server
      const bloodSugarMgdl = unit === 'mmol/L'
        ? mmolToMgdl(parseFloat(bloodSugar))
        : parseFloat(bloodSugar);

      const response = await fetch('http://localhost:5000/api/blood-sugar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bloodSugar: bloodSugarMgdl,
          unit: 'mg/dL' // Always send in mg/dL
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to record blood sugar');
      }

      setStatus({ type: 'success', message: 'Blood sugar level recorded successfully' });
      setBloodSugar('');
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Error recording blood sugar level' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="blood-sugar-input">
      <h2>Record Blood Sugar Level</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-group">
          <label htmlFor="bloodSugar">Blood Sugar Level:</label>
          <div className="input-with-unit">
            <input
              id="bloodSugar"
              type="number"
              step={unit === 'mmol/L' ? '0.1' : '1'}
              value={bloodSugar}
              onChange={(e) => setBloodSugar(e.target.value)}
              placeholder={`Enter blood sugar level in ${unit}`}
              required
              disabled={isLoading}
            />
            <select
              value={unit}
              onChange={(e) => {
                const newUnit = e.target.value;
                if (bloodSugar && !isNaN(parseFloat(bloodSugar))) {
                  // Convert the current value when changing units
                  if (newUnit === 'mg/dL' && unit === 'mmol/L') {
                    setBloodSugar(mmolToMgdl(parseFloat(bloodSugar)).toString());
                  } else if (newUnit === 'mmol/L' && unit === 'mg/dL') {
                    setBloodSugar(mgdlToMmol(parseFloat(bloodSugar)));
                  }
                }
                setUnit(newUnit);
              }}
              className="unit-selector"
              disabled={isLoading}
            >
              <option value="mg/dL">mg/dL</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={isLoading} className="submit-button">
          {isLoading ? 'Recording...' : 'Record'}
        </button>
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