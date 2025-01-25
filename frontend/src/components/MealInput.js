import React, { useState, useEffect, useCallback } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import DurationInput from './DurationInput';
import FoodSection from './FoodSection';
import {
  calculateTotalNutrients,
  calculateInsulinDose,
  getHealthFactorsBreakdown  // Add this import
} from './EnhancedPatientConstantsCalc';
import { MEAL_TYPES, ACTIVITY_LEVELS } from '../constants';
import styles from './MealInput.module.css';

// Update ActivityItem to use ACTIVITY_LEVELS from shared constants
const ActivityItem = ({ index, item, updateItem, removeItem }) => (
  <div className={styles.activityItem}>
    <select
      value={item.level}
      onChange={(e) => updateItem(index, { ...item, level: parseInt(e.target.value) })}
      required
    >
      {ACTIVITY_LEVELS.map(({ value, label }) => (
        <option key={value} value={value}>{label}</option>
      ))}
    </select>
    <DurationInput
      value={item.duration || "0:00"} // Add default value
      onChange={(newDuration) => updateItem(index, { ...item, duration: newDuration })}
    />
    <button
      type="button"
      onClick={() => removeItem(index)}
      className={styles.removeButton}
      aria-label="Remove activity"
    >
      <FaMinus />
    </button>
  </div>
);

const MealInput = () => {
  const { patientConstants, loading, error, refreshConstants } = useConstants();
  const [mealType, setMealType] = useState('');
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityImpact, setActivityImpact] = useState(1.0); // Start with 1.0
  const [bloodSugar, setBloodSugar] = useState('');
  const [intendedInsulin, setIntendedInsulin] = useState('');
  const [suggestedInsulin, setSuggestedInsulin] = useState('');
  const [insulinBreakdown, setInsulinBreakdown] = useState(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthFactors, setHealthFactors] = useState(null);

const calculateInsulinNeeds = useCallback(() => {
  if (selectedFoods.length === 0 || !patientConstants) {
    setSuggestedInsulin('');
    setInsulinBreakdown(null);
    setActivityImpact(1.0); // Set default impact
    return;
  }

  try {
    const totalNutrition = calculateTotalNutrients(selectedFoods);

    // Only include activities with non-zero duration
    const validActivities = activities.filter(activity => {
      const duration = typeof activity.duration === 'string'
        ? activity.duration.split(':').reduce((acc, val) => acc * 60 + parseInt(val), 0) / 60
        : activity.duration;
      return duration > 0;
    });

    const insulinCalculation = calculateInsulinDose({
      ...totalNutrition,
      bloodSugar: parseFloat(bloodSugar) || 0,
      activities: validActivities,
      patientConstants,
      mealType
    });

    setSuggestedInsulin(insulinCalculation.total);
    setInsulinBreakdown(insulinCalculation.breakdown);
    setActivityImpact(insulinCalculation.breakdown.activityImpact || 1.0);
  } catch (error) {
    console.error('Error calculating insulin:', error);
    setMessage('Error calculating insulin needs: ' + error.message);
  }
}, [selectedFoods, bloodSugar, activities, patientConstants, mealType]);
// Update the useEffect that calculates insulin needs to include health factors calculation:
useEffect(() => {
  if (!loading && patientConstants && (selectedFoods.length > 0 || bloodSugar)) {
    // Calculate health factors
    const healthFactorsData = getHealthFactorsBreakdown(patientConstants);
    setHealthFactors(healthFactorsData);

    // Calculate insulin needs
    calculateInsulinNeeds();
  }
}, [selectedFoods, activities, bloodSugar, mealType, patientConstants, loading, calculateInsulinNeeds]);
  // Refresh constants on mount and setup listener
  useEffect(() => {
    refreshConstants();

    const handleConstantsUpdate = () => {
      refreshConstants();
    };

    window.addEventListener('patientConstantsUpdated', handleConstantsUpdate);
    return () => {
      window.removeEventListener('patientConstantsUpdated', handleConstantsUpdate);
    };
  }, [refreshConstants]);

  // Calculate insulin needs whenever relevant inputs change


  useEffect(() => {
    if (!loading && patientConstants && (selectedFoods.length > 0 || bloodSugar)) {
      calculateInsulinNeeds();
    }
  }, [selectedFoods, activities, bloodSugar, mealType, patientConstants, loading, calculateInsulinNeeds]);


  // Food handling functions
  const handleFoodSelect = useCallback((food) => {
    const foodWithPortion = {
      ...food,
      id: Date.now(),
      portion: {
        amount: food.details.serving_size?.amount || 1,
        unit: food.details.serving_size?.unit || 'serving',
        w_amount: food.details.serving_size?.w_amount || null,
        w_unit: food.details.serving_size?.w_unit || null,
        baseAmount: food.details.serving_size?.amount || 1,
        baseUnit: food.details.serving_size?.unit || 'serving',
        baseWAmount: food.details.serving_size?.w_amount || null,
        baseWUnit: food.details.serving_size?.w_unit || null,
        activeMeasurement: food.details.serving_size?.w_amount ? 'weight' : 'volume'
      }
    };
    setSelectedFoods(prev => [...prev, foodWithPortion]);
  }, []);

  const updateFoodPortion = useCallback((foodId, newPortion) => {
    setSelectedFoods(prev => prev.map(item =>
      item.id === foodId ? { ...item, portion: newPortion } : item
    ));
  }, []);

  const removeFood = useCallback((foodId) => {
    setSelectedFoods(prev => prev.filter(item => item.id !== foodId));
  }, []);

  // Activity handling functions
const addActivity = useCallback(() => {
  setActivities(prev => [...prev, { level: 0, duration: "0:00" }]);
}, []);

  const updateActivity = useCallback((index, updatedActivity) => {
    setActivities(prev => {
      const newActivities = [...prev];
      newActivities[index] = updatedActivity;
      return newActivities;
    });
  }, []);

  const removeActivity = useCallback((index) => {
    setActivities(prev => prev.filter((_, i) => i !== index));
  }, []);



  // Form submission handler
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!patientConstants) {
    setMessage('Error: Patient constants not loaded');
    return;
  }

  // Add validation
  if (!mealType) {
    setMessage('Please select a meal type');
    return;
  }

  if (selectedFoods.length === 0) {
    setMessage('Please add at least one food item');
    return;
  }

  setIsSubmitting(true);
  setMessage('Submitting meal...');

  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Create a more structured mealData object with measurement validation
    const mealData = {
      mealType,
      foodItems: selectedFoods.map(food => {
        // Determine the measurement type and values
        const isWeightMeasurement = food.portion.activeMeasurement === 'weight';
        const amount = isWeightMeasurement ? food.portion.w_amount : food.portion.amount;
        const unit = isWeightMeasurement ? food.portion.w_unit : food.portion.unit;

        // Validate measurements
        if (!amount || !unit) {
          throw new Error(`Invalid measurement for food item: ${food.name}`);
        }

        return {
          name: food.name,
          portion: {
            amount: parseFloat(amount) || 1, // Ensure numeric value with fallback
            unit: unit || (isWeightMeasurement ? 'g' : 'ml'), // Ensure valid unit with fallback
            measurement_type: food.portion.activeMeasurement || 'weight'
          },
          details: {
            carbs: parseFloat(food.details.carbs) || 0,
            protein: parseFloat(food.details.protein) || 0,
            fat: parseFloat(food.details.fat) || 0,
            absorption_type: food.details.absorption_type || 'medium',
            serving_size: {
              amount: food.details.serving_size?.amount || 1,
              unit: food.details.serving_size?.unit || 'serving',
              w_amount: food.details.serving_size?.w_amount,
              w_unit: food.details.serving_size?.w_unit
            }
          }
        };
      }),
      activities: activities.map(activity => ({
        level: parseInt(activity.level) || 0,
        duration: typeof activity.duration === 'string'
          ? activity.duration
          : `${Math.floor(activity.duration)}:${Math.round((activity.duration % 1) * 60).toString().padStart(2, '0')}`
      })),
      bloodSugar: bloodSugar ? parseFloat(bloodSugar) : null,
      intendedInsulin: intendedInsulin ? parseFloat(intendedInsulin) : null,
      notes
    };

    // Debug log to see what's being sent
    console.log('Submitting meal data:', JSON.stringify(mealData, null, 2));

    const response = await axios.post(
      'http://localhost:5000/api/meal',
      mealData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Server response:', response.data);
    setMessage('Meal logged successfully!');

    // Reset form
 setMealType('');
    setSelectedFoods([]);
    setActivities([]); // Change to empty array instead of array with default activity
    setBloodSugar('');
    setIntendedInsulin('');
    setSuggestedInsulin('');
    setInsulinBreakdown(null);
    setActivityImpact(1.0); // Change to 1.0 instead of 0
    setNotes('');

  } catch (error) {
    console.error('Error submitting meal:', error);
    const errorMessage = error.response?.data?.error || error.message;
    setMessage(`Error: ${errorMessage}`);
    // Log the full error response for debugging
    if (error.response?.data) {
      console.log('Full error response:', error.response.data);
    }
  } finally {
    setIsSubmitting(false);
  }
};

  if (loading) {
    return <div className={styles.loading}>Loading patient constants...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error loading patient data: {error}</div>;
  }

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Log Your Meal</h2>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label htmlFor="mealType">Meal Type</label>
          <select
            id="mealType"
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            required
          >
            <option value="">Select type</option>
            {MEAL_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.formSection}>
          <h3 className={styles.subtitle}>Add Foods</h3>
          <FoodSection
            selectedFoods={selectedFoods}
            onFoodSelect={handleFoodSelect}
            onUpdatePortion={updateFoodPortion}
            onRemoveFood={removeFood}
          />
        </div>

        <div className={styles.activitySection}>
          <h3 className={styles.subtitle}>Activities</h3>
          {activities.map((activity, index) => (
            <ActivityItem
              key={index}
              index={index}
              item={activity}
              updateItem={updateActivity}
              removeItem={removeActivity}
              activityCoefficients={patientConstants?.activity_coefficients}
            />
          ))}
          <button
            type="button"
            onClick={addActivity}
            className={styles.addButton}
          >
            <FaPlus /> Add Activity
          </button>
{activities.length > 0 && activityImpact !== 1.0 && (
  <div className={styles.activityImpact}>
    <p>Activity Impact: {((activityImpact - 1) * 100).toFixed(1)}%
      {activityImpact > 1
        ? ` (+${((activityImpact - 1) * 100).toFixed(1)}% increase)`
        : activityImpact < 1
        ? ` (${((activityImpact - 1) * 100).toFixed(1)}% decrease)`
        : ' (no adjustment)'}
    </p>
  </div>
)}
  </div>

        <div className={styles.measurementSection}>
          <div className={styles.formField}>
            <label htmlFor="bloodSugar">Blood Sugar Level (mg/dL)</label>
            <input
              id="bloodSugar"
              type="number"
              min="0"
              max="1000"
              value={bloodSugar}
              onChange={(e) => setBloodSugar(e.target.value)}
              placeholder="Enter blood sugar level"
              required
            />
          </div>

          <div className={styles.formField}>
            <label htmlFor="intendedInsulin">Intended Insulin Intake (units)</label>
            <input
              id="intendedInsulin"
              type="number"
              min="0"
              step="0.1"
              value={intendedInsulin}
              onChange={(e) => setIntendedInsulin(e.target.value)}
              placeholder="Enter intended insulin intake"
              required
            />
          </div>

          <div className={`${styles.formField} ${styles.readOnlyField}`}>
            <label htmlFor="suggestedInsulin">Suggested Insulin Intake (units)</label>
            <input
              id="suggestedInsulin"
              type="number"
              value={suggestedInsulin}
              readOnly
              placeholder="Calculated based on meal and activities"
            />
          </div>
        </div>

{selectedFoods.length > 0 && insulinBreakdown && (
  <div className={styles.insulinBreakdown}>
    <h4>Insulin Calculation Breakdown</h4>
    <ul>
      {/* Base Units Section */}
      <li className={styles.breakdownSection}>
        <strong>Base Units</strong>
        <div>
          <li>Carbohydrate insulin: <span className={styles.valueHighlight}>{insulinBreakdown.carbInsulin}</span> units</li>
          <li>Protein contribution: <span className={styles.valueHighlight}>{insulinBreakdown.proteinContribution}</span> units</li>
          <li>Fat contribution: <span className={styles.valueHighlight}>{insulinBreakdown.fatContribution}</span> units</li>
          <li className={styles.summaryLine}>
            <strong>Total Base Units: <span className={styles.valueHighlight}>{insulinBreakdown.baseInsulin}</span> units</strong>
          </li>
        </div>
      </li>

 {/* Adjustment Factors Section */}
<li className={styles.breakdownSection}>
  <strong>Adjustment Factors</strong>
  <div>
    <li>Absorption rate: <span className={styles.valueHighlight}>
      {((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}%
      {insulinBreakdown.absorptionFactor > 1
        ? ` (+${((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}% increase)`
        : insulinBreakdown.absorptionFactor < 1
        ? ` (${((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}% decrease)`
        : ' (no adjustment)'}
    </span></li>
    <li>Meal timing: <span className={styles.valueHighlight}>
      {((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}%
      {insulinBreakdown.mealTimingFactor > 1
        ? ` (+${((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}% increase)`
        : insulinBreakdown.mealTimingFactor < 1
        ? ` (${((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}% decrease)`
        : ' (no adjustment)'}
    </span></li>
    <li>Time of day: <span className={styles.valueHighlight}>
      {((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}%
      {insulinBreakdown.timeOfDayFactor > 1
        ? ` (+${((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}% increase)`
        : insulinBreakdown.timeOfDayFactor < 1
        ? ` (${((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}% decrease)`
        : ' (no adjustment)'}
    </span></li>
    <li>Activity impact: <span className={styles.valueHighlight}>
      {((insulinBreakdown.activityImpact - 1) * 100).toFixed(1)}%
      {insulinBreakdown.activityImpact > 1
          ? ` (+${((insulinBreakdown.activityImpact - 1) * 100).toFixed(1)}% increase)`
          : insulinBreakdown.activityImpact < 1
              ? ` (${((insulinBreakdown.activityImpact - 1) * 100).toFixed(1)}% decrease)`
              : ' (no adjustment)'}
    </span></li>
    {/* Added Adjusted Insulin Summary */}
    <li className={styles.summaryLine}>
      <strong>Adjusted Insulin: <span className={styles.valueHighlight}>
        {insulinBreakdown.adjustedInsulin}
      </span> units</strong>
      <div className={styles.formulaExplanation}>
        <small>
          (Base insulin × Absorption × Meal timing × Time of day × Activity factor)
        </small>
      </div>
    </li>
  </div>
</li>

      {/* Correction Section */}
      {insulinBreakdown.correctionInsulin !== 0 && (
        <li className={styles.breakdownSection}>
          <strong>Correction Units</strong>
          <div>
            <li>Correction insulin: <span className={styles.valueHighlight}>{insulinBreakdown.correctionInsulin}</span> units</li>
          </div>
        </li>
      )}

   {insulinBreakdown.healthMultiplier !== 1 && (
  <>
    <li className={styles.breakdownSection}>
      <strong>Health Factors:</strong>
    </li>
    {healthFactors?.conditions.length > 0 && (
      <li>
        <strong>Active Conditions:</strong>
        <ul>
          {healthFactors.conditions.map(condition => (
            <li key={condition.name}>
              • {condition.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
              {condition.percentage}%
              {condition.factor > 1
                ? ` (+${condition.percentage}% increase)`
                : ` (${condition.percentage}% decrease)`}
            </li>
          ))}
        </ul>
      </li>
    )}

    {healthFactors?.medications.length > 0 && (
      <div className={styles.medicationTimingInfo}>
        <h4>Medication Effects:</h4>
        {healthFactors.medications.map(med => (
          <div key={med.name} className={styles.medicationEffect}>
            <h5>{med.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>
            <div className={styles.effectDetails}>
              {med.status === 'Scheduled to start' && (
                <>
                  <p>Status: Scheduled to start on {med.startDate}</p>
                  <p>Current Effect: None</p>
                </>
              )}
              {med.status === 'Schedule ended' && (
                <>
                  <p>Status: Schedule ended on {med.endDate}</p>
                  <p>Current Effect: None</p>
                </>
              )}
              {['Ramping up', 'Peak effect', 'Tapering', 'No current effect'].includes(med.status) && (
                <>
                  <p>Last dose: {med.lastDose}</p>
                  <p>Hours since last dose: {med.hoursSinceLastDose}h</p>
                  <p>Current phase: {med.status}</p>
                  <p>Current effect strength: {((med.factor - 1) * 100).toFixed(1)}%
                     {med.factor > 1 ? ' increase' : ' decrease'}</p>
                </>
              )}
              {med.status === 'Constant effect' && (
                <p>Effect: {((med.factor - 1) * 100).toFixed(1)}%
                   {med.factor > 1 ? ' increase' : ' decrease'} in insulin resistance</p>
              )}
            </div>
          </div>
        ))}
      </div>
    )}

    <li className={styles.summaryLine}>
      <strong>Combined Health Factor: {((healthFactors.healthMultiplier - 1) * 100).toFixed(1)}%
        {healthFactors.healthMultiplier > 1
          ? ` (+${((healthFactors.healthMultiplier - 1) * 100).toFixed(1)}% increase)`
          : ` (${((healthFactors.healthMultiplier - 1) * 100).toFixed(1)}% decrease)`}
      </strong>
    </li>
  </>
)}

      {/* Final Calculation */}
      <li className={styles.breakdownSection}>
        <strong>Final Calculation</strong>
        <div className={styles.calculationBreakdown}>
          <span>Adjusted Insulin: {insulinBreakdown.adjustedInsulin} units</span>
          {insulinBreakdown.correctionInsulin !== 0 && (
            <span>+ Correction: {insulinBreakdown.correctionInsulin} units</span>
          )}
          {insulinBreakdown.healthMultiplier !== 1 && (
            <span>× Health Factor: {insulinBreakdown.healthMultiplier}</span>
          )}
        </div>
        <div className={styles.formulaExplanation}>
          <small>
            Formula: ({insulinBreakdown.adjustedInsulin} + {insulinBreakdown.correctionInsulin}) × {insulinBreakdown.healthMultiplier}
          </small>
        </div>
      </li>

      {/* Final Total */}
      <li className={styles.summaryLine}>
        <strong>Total Insulin Needed: <span className={styles.valueHighlight}>{suggestedInsulin}</span> units</strong>
      </li>
    </ul>
  </div>
)}
        {selectedFoods.length > 0 && patientConstants && (
          <div className={styles.timingGuidelines}>
            <h4>Insulin Timing Guidelines</h4>
            {selectedFoods.map(food => {
              const absorptionType = food.details.absorption_type || 'medium';
              const guideline = patientConstants.insulin_timing_guidelines[absorptionType];
              return (
                <p key={food.id}>
                  {food.name}: {guideline?.description || 'Take insulin as usual'}
                </p>
              );
            })}
          </div>
        )}

        <div className={styles.notesSection}>
          <div className={styles.formField}>
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter any additional notes"
            />
          </div>
        </div>

<button
  className={styles.submitButton}
  type="submit"
  disabled={loading || !patientConstants || isSubmitting}
>
  {isSubmitting ? 'Submitting...' : 'Log Meal'}
</button>
      </form>

      {message && (
          <div className={`${styles.message} ${message.includes('Error') ? styles.error : styles.success}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default MealInput;