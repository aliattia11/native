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
  const [showMedicalFactors, setShowMedicalFactors] = useState(false);
const [activeMedicalFactors, setActiveMedicalFactors] = useState({
  conditions: {},
  medications: {}
});
useEffect(() => {
  if (patientConstants) {
    const activeConditions = {};
    const activeMedications = {};

    Object.entries(patientConstants.medical_condition_factors || {}).forEach(([id, condition]) => {
      if (condition.active) {
        activeConditions[id] = condition;
      }
    });

    Object.entries(patientConstants.medication_factors || {}).forEach(([id, medication]) => {
      if (medication.active) {
        activeMedications[id] = medication;
      }
    });

    setActiveMedicalFactors({
      conditions: activeConditions,
      medications: activeMedications
    });
  }
}, [patientConstants]);


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
        mealType
      });

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

    setIsSubmitting(true);
    setMessage('Submitting meal...');

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const mealData = {
        mealType,
        foodItems: selectedFoods.map(food => ({
    name: food.name,
    portion: food.portion.activeMeasurement === 'weight' ? food.portion.w_amount : food.portion.amount,
    measurement: food.portion.activeMeasurement === 'weight' ? food.portion.w_unit : food.portion.unit,
    measurement_type: food.portion.activeMeasurement,
          details: {
            carbs: food.details.carbs,
            protein: food.details.protein,
            fat: food.details.fat,
            absorption_type: food.details.absorption_type || 'medium',
            serving_size: {
              amount: food.details.serving_size?.amount || 1,
              unit: food.details.serving_size?.unit || 'serving',
              w_amount: food.details.serving_size?.w_amount,
              w_unit: food.details.serving_size?.w_unit
            }
          }
        })),
        activities: activities.map(activity => ({
          level: parseInt(activity.level),
          duration: typeof activity.duration === 'string'
            ? activity.duration
            : `${Math.floor(activity.duration)}:${Math.round((activity.duration % 1) * 60).toString().padStart(2, '0')}`
        })),
        bloodSugar: bloodSugar ? parseFloat(bloodSugar) : null,
        intendedInsulin: intendedInsulin ? parseFloat(intendedInsulin) : null,
        suggestedInsulin: suggestedInsulin ? parseFloat(suggestedInsulin) : null,
        notes,
        constants: patientConstants,
        timestamp: new Date().toISOString(),
         medical_factors: {
    conditions: Object.entries(activeMedicalFactors.conditions)
      .map(([id, condition]) => ({
        id,
        name: condition.name,
        factor: condition.factor,
        description: condition.description
      })),
    medications: Object.entries(activeMedicalFactors.medications)
      .map(([id, medication]) => ({
        id,
        name: medication.name,
        factor: medication.factor,
        description: medication.description
      }))
  }
};

      await axios.post(
        'http://localhost:5000/api/meal',
        mealData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

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
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
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
            <FaPlus/> Add Activity
          </button>
          {activityImpact !== 0 && (
              <div className={styles.activityImpact}>
                <p>Activity Impact: {(activityImpact * 100).toFixed(1)}% adjustment to insulin needs</p>
              </div>
          )}
        </div>
        <div className={styles.medicalFactorsSection}>
          <button
              type="button"
              onClick={() => setShowMedicalFactors(!showMedicalFactors)}
              className={styles.medicalFactorsButton}
          >
            {showMedicalFactors ? 'Hide Disease/Medications' : 'Show Disease/Medications'}
          </button>

          {showMedicalFactors && (
              <div className={styles.medicalFactorsContent}>
                <div className={styles.diseaseSection}>
                  <h4>Medical Conditions</h4>
                  {Object.entries(patientConstants?.medical_condition_factors || {}).map(([key, condition]) => (
                      <div key={key} className={styles.medicalItem}>
                        <label>
                          <input
                              type="checkbox"
                              checked={condition.active || false}
                              disabled
                          />
                          {condition.name}
                          {condition.active && (
                              <span className={styles.factorInfo}>
                  (Factor: {condition.factor}x - {condition.description})
                </span>
                          )}
                        </label>
                      </div>
                  ))}
                </div>

                <div className={styles.medicationSection}>
                  <h4>Medications</h4>
                  {Object.entries(patientConstants?.medication_factors || {}).map(([key, medication]) => (
                      <div key={key} className={styles.medicalItem}>
                        <label>
                          <input
                              type="checkbox"
                              checked={medication.active || false}
                              disabled
                          />
                          {medication.name}
                          {medication.active && (
                              <span className={styles.factorInfo}>
                  (Factor: {medication.factor}x - {medication.description})
                </span>
                          )}
                        </label>
                      </div>
                  ))}
                </div>
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
                {/* Units Section */}
                <li className={styles.breakdownSection}>
                  <strong>Base Units:</strong>
                </li>
                <li>• Carbohydrate insulin: {insulinBreakdown.carbInsulin} units</li>
                <li>• Protein contribution: {insulinBreakdown.proteinContribution} units</li>
                <li>• Fat contribution: {insulinBreakdown.fatContribution} units</li>
                <li>• Correction insulin: {insulinBreakdown.correctionInsulin} units</li>
                <li className={styles.summaryLine}>
                  <strong>Total Base Units: {(
                      Number(insulinBreakdown.carbInsulin) +
                      Number(insulinBreakdown.proteinContribution) +
                      Number(insulinBreakdown.fatContribution) +
                      Number(insulinBreakdown.correctionInsulin)
                  ).toFixed(2)} units</strong>
                </li>

                {/* Adjustment Factors Section */}
                <li className={styles.breakdownSection}>
                  <strong>Adjustment Factors:</strong>
                </li>
                <li>• Absorption rate: {((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}%
                  {insulinBreakdown.absorptionFactor > 1
                      ? ` (+${((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}% increase)`
                      : insulinBreakdown.absorptionFactor < 1
                          ? ` (${((insulinBreakdown.absorptionFactor - 1) * 100).toFixed(1)}% decrease)`
                          : ' (no adjustment)'}
                </li>
                <li>• Meal timing: {((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}%
                  {insulinBreakdown.mealTimingFactor > 1
                      ? ` (+${((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}% increase)`
                      : insulinBreakdown.mealTimingFactor < 1
                          ? ` (${((insulinBreakdown.mealTimingFactor - 1) * 100).toFixed(1)}% decrease)`
                          : ' (no adjustment)'}
                </li>
                <li>• Time of day: {((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}%
                  {insulinBreakdown.timeOfDayFactor > 1
                      ? ` (+${((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}% increase)`
                      : insulinBreakdown.timeOfDayFactor < 1
                          ? ` (${((insulinBreakdown.timeOfDayFactor - 1) * 100).toFixed(1)}% decrease)`
                          : ' (no adjustment)'}
                </li>
                <li>• Activity impact: {(insulinBreakdown.activityImpact * 100).toFixed(1)}%
                  {insulinBreakdown.activityImpact > 0
                      ? ` (+${(insulinBreakdown.activityImpact * 100).toFixed(1)}% increase)`
                      : insulinBreakdown.activityImpact < 0
                          ? ` (${(insulinBreakdown.activityImpact * 100).toFixed(1)}% decrease)`
                          : ' (no adjustment)'}
                </li>
                {/* Medical Factors Section */}
{insulinBreakdown.medical_factors && (
  <>
    <li className={styles.breakdownSection}>
      <strong>Medical Adjustments:</strong>
    </li>
    {Object.entries(insulinBreakdown.medical_factors.conditions || {}).map(([name, factor]) => (
      <li key={name}>
        • {name}: {((factor - 1) * 100).toFixed(1)}%
        {factor > 1
          ? ` (+${((factor - 1) * 100).toFixed(1)}% increase)`
          : factor < 1
            ? ` (${((factor - 1) * 100).toFixed(1)}% decrease)`
            : ' (no adjustment)'}
      </li>
    ))}
    {Object.entries(insulinBreakdown.medical_factors.medications || {}).map(([name, factor]) => (
      <li key={name}>
        • {name}: {((factor - 1) * 100).toFixed(1)}%
        {factor > 1
          ? ` (+${((factor - 1) * 100).toFixed(1)}% increase)`
          : factor < 1
            ? ` (${((factor - 1) * 100).toFixed(1)}% decrease)`
            : ' (no adjustment)'}
      </li>
    ))}
    <li className={styles.summaryLine}>
      <strong>Total Medical Impact: {((insulinBreakdown.medical_factors.total - 1) * 100).toFixed(1)}%</strong>
    </li>
  </>
)}
                <li className={styles.summaryLine}>
                  <strong>Net Adjustment: {(
                      ((insulinBreakdown.absorptionFactor - 1) * 100) +
                      ((insulinBreakdown.mealTimingFactor - 1) * 100) +
                      ((insulinBreakdown.timeOfDayFactor - 1) * 100) +
                      (insulinBreakdown.activityImpact * 100)
                  ).toFixed(1)}%</strong>
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