// frontend/src/utils/DataImport.js
import axios from 'axios';

export const importCSVData = async (csvData) => {
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

        // Create meal document
        const mealDoc = {
          timestamp: new Date(timestamp).toISOString(),
          user_id,
          mealType,
          bloodSugar: parseFloat(bloodSugar) || null,
          foodItems: foodNames ? foodNames.split(';').map((name, index) => ({
            name,
            portion: {
              amount: parseFloat(portions.split(';')[index]),
              unit: units.split(';')[index],
              measurement_type: 'weight'
            },
            details: {
              carbs: parseFloat(carbs.split(';')[index]) || 0,
              protein: parseFloat(proteins.split(';')[index]) || 0,
              fat: parseFloat(fats.split(';')[index]) || 0,
              absorption_type: absorptionTypes.split(';')[index] || 'medium'
            }
          })) : [],
          activities: activityLevel ? [{
            level: parseInt(activityLevel),
            duration: activityDuration,
            type: 'expected',
            impact: parseFloat(activityImpact) || 1.0,
            startTime: new Date(timestamp).toISOString(),
            endTime: new Date(new Date(timestamp).getTime() + parseActivityDuration(activityDuration)).toISOString()
          }] : [],
          intendedInsulin: parseFloat(intendedInsulin) || null,
          intendedInsulinType: intendedInsulinType || null,
          suggestedInsulin: parseFloat(suggestedInsulin) || null,
          notes,
          activeConditions: activeConditions.split(';'),
          activeMedications: activeMedications.split(';'),
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

// Helper function to parse activity duration
const parseActivityDuration = (duration) => {
  if (!duration) return 0;
  const [hours, minutes] = duration.split(':').map(Number);
  return (hours * 60 + minutes) * 60 * 1000; // Convert to milliseconds
};