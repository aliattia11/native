import React, { useState, useEffect, useCallback } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import DurationInput from './DurationInput';
import FoodSection from './FoodSection';
import { calculateTotalNutrients, calculateInsulinDose } from './EnhancedPatientConstantsCalc';
import { MEAL_TYPES, ACTIVITY_LEVELS, SHARED_CONSTANTS } from '../constants';
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
      value={item.duration}
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
  const [activities, setActivities] = useState([{ level: 0, duration: 0 }]);
  const [bloodSugar, setBloodSugar] = useState('');
  const [intendedInsulin, setIntendedInsulin] = useState('');
  const [suggestedInsulin, setSuggestedInsulin] = useState('');
  const [insulinBreakdown, setInsulinBreakdown] = useState(null);
  const [activityImpact, setActivityImpact] = useState(0);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
  const calculateInsulinNeeds = useCallback(() => {
  if (selectedFoods.length === 0 || !patientConstants) {
    setSuggestedInsulin('');
    setInsulinBreakdown(null);
    return;
  }

  try {
    const totalNutrition = calculateTotalNutrients(selectedFoods);

    const insulinCalculation = calculateInsulinDose({
      ...totalNutrition,
      bloodSugar: parseFloat(bloodSugar) || 0,
      activities,
      patientConstants,
      mealType});

    setSuggestedInsulin(insulinCalculation.total);
    setInsulinBreakdown(insulinCalculation.breakdown);
    setActivityImpact(insulinCalculation.breakdown.activityImpact || 0);
  } catch (error) {
    console.error('Error calculating insulin:', error);
    setMessage('Error calculating insulin needs: ' + error.message);
  }
}, [selectedFoods, bloodSugar, activities, patientConstants, mealType]);

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
    setActivities(prev => [...prev, { level: 0, duration: 0 }]);
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
    setActivities([{ level: 0, duration: 0 }]);
    setBloodSugar('');
    setIntendedInsulin('');
    setSuggestedInsulin('');
    setInsulinBreakdown(null);
    setActivityImpact(0);
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
          {activityImpact !== 0 && (
            <div className={styles.activityImpact}>
              <p>Activity Impact: {(activityImpact * 100).toFixed(1)}% adjustment to insulin needs</p>
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
      {(insulinBreakdown.activityImpact * 100).toFixed(1)}%
      {insulinBreakdown.activityImpact > 0
        ? ` (+${(insulinBreakdown.activityImpact * 100).toFixed(1)}% increase)`
        : insulinBreakdown.activityImpact < 0
        ? ` (${(insulinBreakdown.activityImpact * 100).toFixed(1)}% decrease)`
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

      {/* Health Factors Section */}
      {insulinBreakdown.healthMultiplier !== 1 && (
        <>
          <li className={styles.breakdownSection}>
            <strong>Health Factors:</strong>
          </li>
          {patientConstants.active_conditions?.length > 0 && (
            <li>
              <strong>Active Conditions:</strong>
              <ul>
                {patientConstants.active_conditions.map(condition => {
                  const conditionData = patientConstants.disease_factors[condition];
                  return (
                    <li key={condition}>
                      • {condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                      {((conditionData.factor - 1) * 100).toFixed(1)}%
                      {conditionData.factor > 1
                        ? ` (+${((conditionData.factor - 1) * 100).toFixed(1)}% increase)`
                        : ` (${((conditionData.factor - 1) * 100).toFixed(1)}% decrease)`}
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
     {patientConstants.active_medications?.length > 0 && (
  <div className={styles.medicationTimingInfo}>
    <h4>Medication Effects:</h4>
    {patientConstants.active_medications.map(medication => {
      const medData = patientConstants.medication_factors[medication];
      const schedule = patientConstants.medication_schedules?.[medication];
      const currentDate = new Date();

      let medicationEffect = null;

      if (medData) {
        if (medData.duration_based && schedule) {
          const startDate = new Date(schedule.startDate);
          const endDate = new Date(schedule.endDate);

          if (currentDate < startDate) {
            medicationEffect = {
              status: 'Scheduled to start',
              startDate: startDate.toLocaleDateString(),
              factor: 1.0
            };
          } else if (currentDate > endDate) {
            medicationEffect = {
              status: 'Schedule ended',
              endDate: endDate.toLocaleDateString(),
              factor: 1.0
            };
          } else {
            // Calculate time since last dose
            const lastDoseTime = schedule.dailyTimes
              .map(time => {
                const [hours, minutes] = time.split(':');
                const doseTime = new Date(currentDate);
                doseTime.setHours(hours, minutes, 0, 0);
                if (doseTime > currentDate) {
                  doseTime.setDate(doseTime.getDate() - 1);
                }
                return doseTime;
              })
              .sort((a, b) => b - a)[0];

            const hoursSinceLastDose = (currentDate - lastDoseTime) / (1000 * 60 * 60);

            let phase, factor;
            if (hoursSinceLastDose < medData.onset_hours) {
              phase = 'Ramping up';
              factor = 1.0 + ((medData.factor - 1.0) * (hoursSinceLastDose / medData.onset_hours));
            } else if (hoursSinceLastDose < medData.peak_hours) {
              phase = 'Peak effect';
              factor = medData.factor;
            } else if (hoursSinceLastDose < medData.duration_hours) {
              phase = 'Tapering';
              const remainingEffect = (medData.duration_hours - hoursSinceLastDose) /
                                   (medData.duration_hours - medData.peak_hours);
              factor = 1.0 + ((medData.factor - 1.0) * remainingEffect);
            } else {
              phase = 'No current effect';
              factor = 1.0;
            }

            medicationEffect = {
              status: phase,
              lastDose: lastDoseTime.toLocaleString(),
              factor: factor,
              hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
            };
          }
        } else {
          // Non-duration based medications
          medicationEffect = {
            status: 'Constant effect',
            factor: medData.factor
          };
        }

        return (
          <div key={medication} className={styles.medicationEffect}>
            <h5>{medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>
            <div className={styles.effectDetails}>
              {medicationEffect.status === 'Scheduled to start' && (
                <>
                  <p>Status: Scheduled to start on {medicationEffect.startDate}</p>
                  <p>Current Effect: None</p>
                </>
              )}
              {medicationEffect.status === 'Schedule ended' && (
                <>
                  <p>Status: Schedule ended on {medicationEffect.endDate}</p>
                  <p>Current Effect: None</p>
                </>
              )}
              {['Ramping up', 'Peak effect', 'Tapering', 'No current effect'].includes(medicationEffect.status) && (
                <>
                  <p>Last dose: {medicationEffect.lastDose}</p>
                  <p>Hours since last dose: {medicationEffect.hoursSinceLastDose}h</p>
                  <p>Current phase: {medicationEffect.status}</p>
                  <p>Current effect strength: {((medicationEffect.factor - 1) * 100).toFixed(1)}%
                     {medicationEffect.factor > 1 ? ' increase' : ' decrease'}</p>
                </>
              )}
              {medicationEffect.status === 'Constant effect' && (
                <p>Effect: {((medicationEffect.factor - 1) * 100).toFixed(1)}%
                   {medicationEffect.factor > 1 ? ' increase' : ' decrease'} in insulin resistance</p>
              )}
            </div>
          </div>
        );
      }
      return null;
    })}
  </div>
)}

          <li className={styles.summaryLine}>
            <strong>Combined Health Factor: {((insulinBreakdown.healthMultiplier - 1) * 100).toFixed(1)}%
              {insulinBreakdown.healthMultiplier > 1
                ? ` (+${((insulinBreakdown.healthMultiplier - 1) * 100).toFixed(1)}% increase)`
                : ` (${((insulinBreakdown.healthMultiplier - 1) * 100).toFixed(1)}% decrease)`}
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