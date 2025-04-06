import React, { useState } from 'react';
import axios from 'axios';
import styles from './DataImport.module.css';

const importCSVData = async (csvData) => {
  const token = localStorage.getItem('token');

  try {
    // Parse CSV data
    const records = csvData.split('\n')
      .slice(1) // Skip header row
      .filter(line => line.trim()) // Remove empty lines
      .map(line => {
        const [
          timestamp, user_id, mealType, bloodSugar, foodNames, portions, units,
          carbs, proteins, fats, absorptionTypes, activityLevel, activityDuration,
          activityImpact, intendedInsulin, intendedInsulinType, suggestedInsulin,
          notes, activeConditions, activeMedications, healthMultiplier
        ] = line.split(',').map(field => field.trim());

        // Parse timestamp correctly
        const parsedDate = new Date(timestamp + 'Z'); // Add 'Z' to make it UTC
        if (isNaN(parsedDate.getTime())) {
          throw new Error(`Invalid timestamp: ${timestamp}`);
        }

        // Create meal document
        const mealDoc = {
          timestamp: parsedDate.toISOString(),
          user_id,
          mealType,
          bloodSugar: parseFloat(bloodSugar) || null,
          foodItems: foodNames ? foodNames.split(';').map((name, index) => ({
            name,
            portion: {
              amount: parseFloat(portions?.split(';')[index]) || 0,
              unit: units?.split(';')[index] || 'g',
              measurement_type: 'weight'
            },
            details: {
              carbs: parseFloat(carbs?.split(';')[index]) || 0,
              protein: parseFloat(proteins?.split(';')[index]) || 0,
              fat: parseFloat(fats?.split(';')[index]) || 0,
              absorption_type: absorptionTypes?.split(';')[index] || 'medium'
            }
          })) : [],
          activities: activityLevel ? [{
            level: parseInt(activityLevel) || 0,
            duration: activityDuration || '0:00',
            type: 'expected',
            impact: parseFloat(activityImpact) || 1.0,
            startTime: parsedDate.toISOString(),
            endTime: new Date(parsedDate.getTime() + parseActivityDuration(activityDuration || '0:00')).toISOString()
          }] : [],
          intendedInsulin: parseFloat(intendedInsulin) || null,
          intendedInsulinType: intendedInsulinType || null,
          suggestedInsulin: parseFloat(suggestedInsulin) || null,
          notes,
          activeConditions: activeConditions ? activeConditions.split(';') : [],
          activeMedications: activeMedications ? activeMedications.replace(/"/g, '').split(',') : [],
          healthMultiplier: parseFloat(healthMultiplier) || 1.0
        };

        return mealDoc;
    });

    // Send data to backend in batches
    const batchSize = 50;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      await axios.post(
        'http://localhost:5000/api/import-meals',
        { meals: batch },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return { success: true, count: records.length };
  } catch (error) {
    console.error('Error importing data:', error);
    throw error;
  }
};

// Helper function to parse activity duration to milliseconds
const parseActivityDuration = (duration) => {
  if (!duration) return 0;
  const [hours, minutes] = duration.split(':').map(Number);
  return ((hours || 0) * 60 + (minutes || 0)) * 60 * 1000; // Convert to milliseconds
};

const DataImport = ({ onImportComplete }) => {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setIsImporting(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const result = await importCSVData(e.target.result);
          if (onImportComplete) {
            onImportComplete(result);
          }
          setFileName('');
        } catch (error) {
          setError(error.message);
        } finally {
          setIsImporting(false);
        }
      };
      reader.readAsText(file);
    } catch (error) {
      setError('Error reading file');
      setIsImporting(false);
    }
  };

  return (
    <div className={styles.importContainer}>
      <input
        type="file"
        accept=".csv"
        onChange={handleFileUpload}
        className={styles.fileInput}
        id="csvFileInput"
        disabled={isImporting}
      />
      <label htmlFor="csvFileInput" className={styles.importButton}>
        {isImporting ? (
          <>
            <div className={styles.loadingSpinner} />
            Importing...
          </>
        ) : (
          'Import Data'
        )}
      </label>
      {fileName && <span className={styles.fileName}>{fileName}</span>}
      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
};

export default DataImport;