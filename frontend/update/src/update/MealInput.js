import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus } from 'react-icons/fa';
import DurationInput from './DurationInput';
import FoodSection from './FoodSection';
import {
  SHARED_CONSTANTS,
  DEFAULT_PATIENT_CONSTANTS,
  usePatientConstants,
  convertToStandardUnit,
  getMeasurementSystem,
  calculateInsulinDose
} from '../constants/EnhancedConstants';
import styles from './MealInput.module.css';

const ActivityItem = ({ index, item, updateItem, removeItem, activityCoefficients }) => (
  <div className={styles.activityItem}>
    <select
      value={item.level}
      onChange={(e) => updateItem(index, { ...item, level: parseInt(e.target.value) })}
      required
    >
      {Object.entries(activityCoefficients).map(([value, _]) => (
        <option key={value} value={value}>
          {value === "-2" ? "Sleep" :
           value === "-1" ? "Very Low Activity" :
           value === "0" ? "Normal Activity" :
           value === "1" ? "High Activity" :
           "Vigorous Activity"}
        </option>
      ))}
    </select>
    <DurationInput
      value={item.duration}
      onChange={(newDuration) => updateItem(index, { ...item, duration: newDuration })}
    />
    <button type="button" onClick={() => removeItem(index)} className={styles.removeButton}>
      <FaMinus />
    </button>
  </div>
);

const MealInput = () => {
  const { patientConstants, loading: constantsLoading } = usePatientConstants();
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

  const calculateInsulinNeeds = useCallback(() => {
    if (selectedFoods.length === 0 || constantsLoading) {
      setSuggestedInsulin('');
      setInsulinBreakdown(null);
      return;
    }

    const totalNutrition = selectedFoods.reduce((acc, food) => {
      const portionSystem = getMeasurementSystem(food.portion.unit);
      const servingSystem = getMeasurementSystem(food.details.serving_size?.unit || 'serving');

      let conversionRatio = 1;

      if (portionSystem === SHARED_CONSTANTS.MEASUREMENT_SYSTEMS.WEIGHT) {
        const portionInGrams = convertToStandardUnit(food.portion.amount, food.portion.unit);
        const servingSizeInGrams = convertToStandardUnit(
          food.details.serving_size?.amount || 100,
          food.details.serving_size?.unit || 'g'
        );
        conversionRatio = portionInGrams / servingSizeInGrams;
      } else if (portionSystem === SHARED_CONSTANTS.MEASUREMENT_SYSTEMS.VOLUME &&
                 servingSystem === SHARED_CONSTANTS.MEASUREMENT_SYSTEMS.VOLUME) {
        const portionInMl = convertToStandardUnit(food.portion.amount, food.portion.unit);
        const servingInMl = convertToStandardUnit(
          food.details.serving_size?.amount || 1,
          food.details.serving_size?.unit || 'serving'
        );
        conversionRatio = portionInMl / servingInMl;
      }

      return {
        carbs: acc.carbs + ((food.details.carbs || 0) * conversionRatio),
        protein: acc.protein + ((food.details.protein || 0) * conversionRatio),
        fat: acc.fat + ((food.details.fat || 0) * conversionRatio),
        absorptionType: food.details.absorption_type || 'medium'
      };
    }, { carbs: 0, protein: 0, fat: 0, absorptionType: 'medium' });

    const insulinCalculation = calculateInsulinDose({
      ...totalNutrition,
      bloodSugar: parseFloat(bloodSugar),
      activities,
      patientConstants
    });

    setSuggestedInsulin(insulinCalculation.total);
    setInsulinBreakdown(insulinCalculation.breakdown);
    setActivityImpact(insulinCalculation.breakdown.activityImpact || 0);
  }, [selectedFoods, bloodSugar, activities, patientConstants, constantsLoading]);

  useEffect(() => {
    const fetchPatientConstants = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get('http://localhost:5000/api/patient/constants', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.data.constants) {
          setPatientConstants(response.data.constants);
        }
      } catch (error) {
        console.error('Error fetching patient constants:', error);
        setPatientConstants(defaultPatientConstants);
      }
    };

    fetchPatientConstants();
  }, []);

  useEffect(() => {
    if (selectedFoods.length > 0 || activities.length > 0 || bloodSugar) {
      calculateInsulinNeeds();
    }
  }, [selectedFoods, activities, bloodSugar, mealType, patientConstants, calculateInsulinNeeds]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('Submitting meal...');

    try {
      const token = localStorage.getItem('token');

      const formattedFoodItems = selectedFoods.map(food => ({
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
      }));

      const formattedActivities = activities.map(activity => ({
        level: parseInt(activity.level),
        duration: typeof activity.duration === 'string'
          ? activity.duration
          : `${Math.floor(activity.duration)}:${Math.round((activity.duration % 1) * 60).toString().padStart(2, '0')}`
      }));

      const mealData = {
        mealType,
        foodItems: formattedFoodItems,
        activities: formattedActivities,
        bloodSugar: bloodSugar ? parseFloat(bloodSugar) : null,
        intendedInsulin: intendedInsulin ? parseFloat(intendedInsulin) : null,
        suggestedInsulin: suggestedInsulin ? parseFloat(suggestedInsulin) : null,
        notes
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
      setNotes('');
    } catch (error) {
      console.error('Error submitting meal:', error);
      setMessage(`Error: ${error.response?.data?.error || error.message}`);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Log Your Meal</h2>
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formField}>
          <label>Meal Type</label>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            required
          >
            <option value="">Select type</option>
            {SHARED_CONSTANTS.MEAL_TYPES.map(type => (
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
              activityCoefficients={patientConstants.activity_coefficients}
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
            <label>Blood Sugar Level (mg/dL)</label>
            <input
              type="number"
              value={bloodSugar}
              onChange={(e) => setBloodSugar(e.target.value)}
              placeholder="Enter blood sugar level"
              required
            />
          </div>

          <div className={styles.formField}>
            <label>Intended Insulin Intake (units)</label>
            <input
              type="number"
              value={intendedInsulin}
              onChange={(e) => setIntendedInsulin(e.target.value)}
              placeholder="Enter intended insulin intake"
              required
            />
          </div>

          <div className={`${styles.formField} ${styles.readOnlyField}`}>
            <label>Suggested Insulin Intake (units)</label>
            <input
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
              <li>Base insulin from carbs: {insulinBreakdown.carbInsulin} units</li>
              <li>Protein contribution: {insulinBreakdown.proteinContribution} units</li>
              <li>Fat contribution: {insulinBreakdown.fatContribution} units</li>
              <li>Activity impact: {(insulinBreakdown.activityImpact * 100).toFixed(1)}%</li>
              <li>Correction insulin: {insulinBreakdown.correctionInsulin} units</li>
              <li>Absorption factor: {insulinBreakdown.absorptionFactor}x</li>
            </ul>
          </div>
        )}

        {selectedFoods.length > 0 && (
          <div className={styles.timingGuidelines}>
            <h4>Insulin Timing Guidelines</h4>
            {selectedFoods.map(food => {
              const absorptionType = food.details.absorption_type || 'medium';
              const guideline = patientConstants.insulin_timing_guidelines[absorptionType];
              return (
                <p key={food.id}>
                  {food.name}: {guideline.description}
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

        <button className={styles.submitButton} type="submit">
          Log Meal
        </button>
      </form>

      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
};

export default MealInput;