import React, { useState, useEffect, useCallback } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import axios from 'axios';
import { FaInfoCircle, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import FoodSection from './FoodSection';
import {
  calculateTotalNutrients,
  calculateInsulinDose,
  getHealthFactorsBreakdown
} from './EnhancedPatientConstantsCalc';
import BloodSugarInput from './BloodSugarInput';
import ActivityRecording from './ActivityRecording';
import { MEAL_TYPES, INSULIN_TYPES } from '../constants';
import styles from './MealInput.module.css';

const MealInput = () => {
  const { patientConstants, loading, error, refreshConstants } = useConstants();
  const [mealType, setMealType] = useState('');
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [activitiesFromRecording, setActivitiesFromRecording] = useState([]);
  const [activityImpactFromRecording, setActivityImpactFromRecording] = useState(1.0);
  const [activityImpact, setActivityImpact] = useState(1.0); // Add this line
  const [bloodSugar, setBloodSugar] = useState('');
  const [intendedInsulin, setIntendedInsulin] = useState('');
  const [suggestedInsulin, setSuggestedInsulin] = useState('');
  const [insulinBreakdown, setInsulinBreakdown] = useState(null);
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthFactors, setHealthFactors] = useState(null);
  const [backendCalculation, setBackendCalculation] = useState(null);
  const [intendedInsulinType, setIntendedInsulinType] = useState('');
  const [suggestedInsulinType, setSuggestedInsulinType] = useState('regular_insulin');
  const [expandedCard, setExpandedCard] = useState(null);
  const [bloodSugarSource, setBloodSugarSource] = useState('direct');

  // Handler for ActivityRecording updates
const handleActivityUpdate = (newActivities, totalImpact) => {
  // Add console.log to debug the received activities
  console.log('Received activities:', newActivities);

  setActivitiesFromRecording(newActivities.map(activity => ({
    level: activity.level,
    duration: activity.duration,
    type: activity.type,
    impact: activity.impact,
    startTime: activity.startTime,
    endTime: activity.endTime
  })));
  setActivityImpactFromRecording(totalImpact);
  setActivityImpact(totalImpact);
};
  // Continue from previous part...

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
        activities: activitiesFromRecording.map(activity => ({
          level: activity.level,
          duration: activity.duration,
          impact: activity.impact
        })),
        patientConstants,
        mealType
      });

      setSuggestedInsulin(insulinCalculation.total);
      setInsulinBreakdown(insulinCalculation.breakdown);
    } catch (error) {
      console.error('Error calculating insulin:', error);
      setMessage('Error calculating insulin needs: ' + error.message);
    }
  }, [selectedFoods, bloodSugar, activitiesFromRecording, patientConstants, mealType]);

  // Effect for calculating insulin needs and health factors
  useEffect(() => {
    if (!loading && patientConstants && (selectedFoods.length > 0 || bloodSugar)) {
      const healthFactorsData = getHealthFactorsBreakdown(patientConstants);
      setHealthFactors(healthFactorsData);
      calculateInsulinNeeds();
    }
  }, [selectedFoods, activitiesFromRecording, bloodSugar, mealType, patientConstants, loading, calculateInsulinNeeds]);

  // Effect for refreshing constants
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

  const handleCardClick = (cardName) => {
    setExpandedCard(expandedCard === cardName ? null : cardName);
  };

  const getAvailableInsulinTypes = () => {
  try {
    if (!patientConstants?.medication_factors) {
      return [];
    }

    return Object.entries(patientConstants.medication_factors)
      .filter(([_, details]) => details.type && details.type.includes('insulin'))
      .map(([name, details]) => ({
        name,
        displayName: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        category: details.type,
        ...details
      }))
      .sort((a, b) => {
        // Sort by type first, then by name
        if (a.type !== b.type) {
          // Define order of insulin types
          const typeOrder = {
            'rapid_acting_insulin': 1,
            'short_acting_insulin': 2,
            'intermediate_acting_insulin': 3,
            'long_acting_insulin': 4,
            'mixed_insulin': 5
          };
          return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        }
        return a.displayName.localeCompare(b.displayName);
      });
  } catch (error) {
    console.error('Error getting insulin types:', error);
    return [];
  }
};

  // Continue from previous part...

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientConstants) {
      setMessage('Error: Patient constants not loaded');
      return;
    }

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

    const mealData = {
      mealType,
      recordingType: 'meal',
      foodItems: selectedFoods.map(food => {
          const isWeightMeasurement = food.portion.activeMeasurement === 'weight';
          const amount = isWeightMeasurement ? food.portion.w_amount : food.portion.amount;
          const unit = isWeightMeasurement ? food.portion.w_unit : food.portion.unit;

          if (!amount || !unit) {
            throw new Error(`Invalid measurement for food item: ${food.name}`);
          }

          return {
            name: food.name,
            portion: {
              amount: parseFloat(amount) || 1,
              unit: unit || (isWeightMeasurement ? 'g' : 'ml'),
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
        activities: activitiesFromRecording.map(activity => ({
        level: activity.level,
        duration: activity.duration,
        type: activity.type,
        impact: activity.impact,
        startTime: activity.startTime,
        endTime: activity.endTime,
        })),
        bloodSugar: bloodSugar ? parseFloat(bloodSugar) : null,
        bloodSugarSource,
        intendedInsulin: intendedInsulin ? parseFloat(intendedInsulin) : null,
        intendedInsulinType,
        suggestedInsulinType,
        notes,
        calculationFactors: {
          absorptionFactor: insulinBreakdown?.absorptionFactor,
          timeOfDayFactor: insulinBreakdown?.timeOfDayFactor,
          mealTimingFactor: insulinBreakdown?.mealTimingFactor,
          activityImpact: activityImpactFromRecording,
          healthMultiplier: healthFactors?.healthMultiplier,
          medications: healthFactors?.medications.map(med => ({
            name: med.name,
            factor: med.factor,
            status: med.status,
            hoursSinceLastDose: med.hoursSinceLastDose
          })),
          conditions: healthFactors?.conditions.map(condition => ({
            name: condition.name,
            factor: condition.factor
          }))
        }
      };

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

      setBackendCalculation(response.data.insulinCalculation);
      setMessage('Meal logged successfully!');

      // Reset form
      setMealType('');
      setSelectedFoods([]);
      setActivitiesFromRecording([]);
      setBloodSugar('');
      setIntendedInsulin('');
      setSuggestedInsulin('');
      setInsulinBreakdown(null);
      setNotes('');
      setIntendedInsulinType('');
      setSuggestedInsulinType('regular_insulin');

    } catch (error) {
      console.error('Error submitting meal:', error);
      const errorMessage = error.response?.data?.error || error.message;
      setMessage(`Error: ${errorMessage}`);
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
          <ActivityRecording
            standalone={false}
            onActivityUpdate={handleActivityUpdate}
            initialActivities={activitiesFromRecording}
          />
        </div>

        <div className={styles.measurementSection}>
          <div className={styles.formField}>
            <label htmlFor="bloodSugar">Blood Sugar Level</label>
            <BloodSugarInput
              initialValue={bloodSugar}
              onBloodSugarChange={(value) => {
                setBloodSugar(value);
                setBloodSugarSource('direct');
              }}
              disabled={isSubmitting}
              standalone={false}
              className={styles.mealInputBloodSugar}
            />
          </div>

          <div className={`${styles.formField} ${styles.readOnlyField}`}>
            <label htmlFor="suggestedInsulin">Suggested Insulin Intake (units)</label>
            <div className={styles.insulinInputGroup}>
              <input
                  id="suggestedInsulin"
                  type="number"
                  value={suggestedInsulin}
                  readOnly
                  placeholder="Calculated based on meal and activities"
              />
              <input
                  id="suggestedInsulinType"
                  type="text"
                  value={(() => {
                    const insulin = patientConstants?.medication_factors?.[suggestedInsulinType];
                    if (!insulin) return '';
                    return `${suggestedInsulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} 
            (${insulin.type.split('_')[0]} acting)`;
                  })()}
                  readOnly
                  className={styles.insulinTypeReadOnly}
              />
            </div>
          </div>
        </div>

        <div className={styles.formField}>
          <label htmlFor="intendedInsulin">Intended Insulin Intake (units)</label>
          <div className={styles.insulinInputGroup}>
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
          <select
  id="intendedInsulinType"
  value={intendedInsulinType}
  onChange={(e) => setIntendedInsulinType(e.target.value)}
  required
  className={styles.insulinTypeSelect}
>
  <option value="">Select Type</option>
  {getAvailableInsulinTypes().map(insulin => (
    <option key={insulin.name} value={insulin.name}>
      {insulin.displayName} ({insulin.type.split('_')[0]} acting
      {insulin.brand_names ? ` - ${insulin.brand_names.join(', ')}` : ''})
    </option>
  ))}
          </select>
          </div>
        </div>

        {selectedFoods.length > 0 && insulinBreakdown && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <h3 className={styles.sectionTitle}>
                  Insulin Calculation Summary
                  <div className={styles.tooltip}>
                  <FaInfoCircle className={styles.infoIcon}/>
          <span className={styles.tooltipText}>
            Click on any card to see detailed breakdown
          </span>
        </div>
      </h3>
    </div>

    <div className={styles.breakdownGrid}>
      {/* Base Insulin Card */}
      <div
        className={`${styles.breakdownCard} ${expandedCard === 'base' ? styles.expanded : ''}`}
        onClick={() => handleCardClick('base')}
                        >
                            <div className={styles.breakdownHeader}>
                                <div className={styles.headerContent}>
                                    <span>Base Insulin Needs</span>
                                    {expandedCard === 'base' ? <FaChevronUp/> : <FaChevronDown/>}
                                </div>
                                <div className={styles.breakdownValue}>{insulinBreakdown.baseInsulin.toFixed(1)} units
                                </div>
                            </div>

                            {expandedCard === 'base' && (
                                <div className={styles.expandedContent}>
                                    <ul>
                                        <li>Carbohydrate insulin: {insulinBreakdown.carbInsulin.toFixed(1)} units</li>
                                        <li>Protein
                                            contribution: {insulinBreakdown.proteinContribution.toFixed(1)} units
                                        </li>
                                        <li>Fat contribution: {insulinBreakdown.fatContribution.toFixed(1)} units</li>
                                        <li className={styles.summaryLine}>
                                            Total Base Units: {insulinBreakdown.baseInsulin.toFixed(1)} units
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>

                        {/* Activity Impact Card */}
                     {/* Activity Impact Card */}
      <div
        className={`${styles.breakdownCard} ${expandedCard === 'activity' ? styles.expanded : ''}`}
        onClick={() => handleCardClick('activity')}
      >
        <div className={styles.breakdownHeader}>
          <div className={styles.headerContent}>
            <span>Activity Impact</span>
            {expandedCard === 'activity' ? <FaChevronUp/> : <FaChevronDown/>}
          </div>
          <div className={`${styles.breakdownValue} ${
            activityImpactFromRecording < 1 ? styles.impactNegative : styles.impactPositive
          }`}>
            {((activityImpactFromRecording - 1) * 100).toFixed(1)}%
            {activityImpactFromRecording !== 1 && (activityImpactFromRecording > 1 ? ' Increase' : ' Decrease')}
          </div>
        </div>

        {expandedCard === 'activity' && activitiesFromRecording.length > 0 && (
          <div className={styles.expandedContent}>
            {activitiesFromRecording.map((activity, index) => (
              <div key={index} className={styles.activityDetail}>
                <span>Activity {index + 1}:</span>
                <span>Level: {activity.level}</span>
                <span>Duration: {activity.duration}</span>
              </div>
            ))}
          </div>
        )}
      </div>

                        {/* Pharmacodynamic Adjustments Card */}
                        <div
                            className={`${styles.breakdownCard} ${expandedCard === 'adjustment' ? styles.expanded : ''}`}
                            onClick={() => handleCardClick('adjustment')}
                        >
                            <div className={styles.breakdownHeader}>
                                <div className={styles.headerContent}>
                                    <span>Pharmacodynamic Adjustments</span>
                                    {expandedCard === 'adjustment' ? <FaChevronUp/> : <FaChevronDown/>}
                                </div>
                                <div className={styles.breakdownValue}>
                                    {[
                                        insulinBreakdown.absorptionFactor,
                                        insulinBreakdown.mealTimingFactor,
                                        insulinBreakdown.timeOfDayFactor,
                                        insulinBreakdown.activityImpact
                                    ].some(factor => factor !== 1) ? (
                                        <span className={styles.valueHighlight}>
                Adjustments applied: {insulinBreakdown.adjustedInsulin.toFixed(1)} units
              </span>
                                    ) : '0.0% (no adjustment)'}
                                </div>
                            </div>

                            {expandedCard === 'adjustment' && (
                                <div className={styles.expandedContent}>
                                    <ul>
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
                                        <li className={styles.summaryLine}>
                                            Adjusted Insulin: <span className={styles.valueHighlight}>
                  {insulinBreakdown.adjustedInsulin.toFixed(1)}
                </span> units
                                            <div className={styles.formulaExplanation}>
                                                <small>
                                                    (Base insulin × Absorption × Meal timing × Time of day × Activity
                                                    factor)
                                                </small>
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>


                        {/* Pharmacokinetics Adjustments Card */}
                        {healthFactors && healthFactors.healthMultiplier !== 1 && (
                            <div
                                className={`${styles.breakdownCard} ${expandedCard === 'health' ? styles.expanded : ''}`}
                                onClick={() => handleCardClick('health')}
                            >
                                <div className={styles.breakdownHeader}>
                                    <div className={styles.headerContent}>
                                        <span>Pharmacokinetics Adjustments</span>
                                        {expandedCard === 'health' ? <FaChevronUp/> : <FaChevronDown/>}
                                    </div>
                                    <div className={`${styles.breakdownValue} ${
                                        healthFactors.healthMultiplier < 1 ? styles.impactNegative : styles.impactPositive
                                    }`}>
                                        {((healthFactors.healthMultiplier - 1) * 100).toFixed(1)}%
                                        {healthFactors.healthMultiplier > 1 ? ' Increase' : ' Decrease'}
                                    </div>
                                </div>

                                {expandedCard === 'health' && (
                                    <div className={styles.expandedContent}>
                                        {healthFactors.conditions.length > 0 && (
                                            <div className={styles.healthSection}>
                                                <h4>Active Conditions:</h4>
                                                <ul>
                                                    {healthFactors.conditions.map(condition => (
                                                        <li key={condition.name}>
                                                            {condition.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
                                                            {condition.percentage}%
                                                            {condition.factor > 1
                                                                ? ` (+${condition.percentage}% increase)`
                                                                : ` (${condition.percentage}% decrease)`}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {healthFactors.medications.length > 0 && (
                                            <div className={styles.healthSection}>
                                                <h4>Medications:</h4>
                                                {healthFactors.medications.map(med => (
                                                    <div key={med.name} className={styles.medicationEffect}>
                                                        <h5>{med.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h5>
                                                        <div className={styles.effectDetails}>
                                                            <p>Status: {med.status}</p>
                                                            {med.lastDose && <p>Last dose: {med.lastDose}</p>}
                                                            {med.hoursSinceLastDose &&
                                                                <p>Hours since last
                                                                    dose: {med.hoursSinceLastDose.toFixed(1)}h</p>}
                                                            <p>Current effect: {((med.factor - 1) * 100).toFixed(1)}%
                                                                {med.factor > 1 ? ' increase' : ' decrease'}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Correction Insulin Card */}
                        <div
                            className={`${styles.breakdownCard} ${expandedCard === 'correction' ? styles.expanded : ''}`}
                            onClick={() => handleCardClick('correction')}
                        >
                            <div className={styles.breakdownHeader}>
                                <div className={styles.headerContent}>
                                    <span>Correction Insulin</span>
                                    {expandedCard === 'correction' ? <FaChevronUp/> : <FaChevronDown/>}
                                </div>
                                <div className={styles.breakdownValue}>
                                    {insulinBreakdown.correctionInsulin.toFixed(1)} units
                                </div>
                            </div>

                            {expandedCard === 'correction' && (
                                <div className={styles.expandedContent}>
                                    <ul>
                                        <li>Correction insulin: <span
                                            className={styles.valueHighlight}>{insulinBreakdown.correctionInsulin.toFixed(1)} units</span>
                                        </li>
                                        <li className={styles.summaryLine}>
                                            <strong>Adjusted Insulin: <span className={styles.valueHighlight}>
                  {insulinBreakdown.adjustedInsulin.toFixed(1)}
                </span> units</strong>
                                            <div className={styles.formulaExplanation}>
                                                <small>
                                                    (Current blood sugar - Target blood sugar) / Correction factor
                                                </small>
                                            </div>
                                        </li>
                                    </ul>
                                </div>
                            )}
                        </div>


                        {/* Final Calculation Card */}
                        <div
                            className={`${styles.breakdownCard} ${expandedCard === 'final' ? styles.expanded : ''}`}
                            onClick={() => handleCardClick('final')}
                        >
                            <div className={styles.breakdownHeader}>
                                <div className={styles.headerContent}>
                                    <span>Suggested Insulin Dose</span>
                                    {expandedCard === 'final' ? <FaChevronUp/> : <FaChevronDown/>}
                                </div>
                                <div className={styles.breakdownValue}>{suggestedInsulin} units</div>
                            </div>

                            {expandedCard === 'final' && (
                                <div className={styles.expandedContent}>
                                    <div className={styles.calculationBreakdown}>
                                        <p>Adjusted Insulin: {insulinBreakdown.adjustedInsulin.toFixed(1)} units</p>
                                        {insulinBreakdown.correctionInsulin !== 0 && (
                                            <p>Correction: {insulinBreakdown.correctionInsulin.toFixed(1)} units</p>
                                        )}
                                        <p>Health Multiplier: ×{insulinBreakdown.healthMultiplier.toFixed(2)}</p>
                                        <div className={styles.formulaExplanation}>
                                            <small>
                                                Formula:
                                                ({insulinBreakdown.adjustedInsulin.toFixed(1)} + {insulinBreakdown.correctionInsulin.toFixed(1)})
                                                × {insulinBreakdown.healthMultiplier.toFixed(2)} = {suggestedInsulin} units
                                            </small>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
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


            {backendCalculation && (
                <div className={styles.backendCalculation}>
                    <h4>Last Backend Calculation Result</h4>
                    <ul>
                        <li>Total Insulin: {backendCalculation.total} units</li>
                        <li className={styles.breakdownSection}>
                            <strong>Base Units</strong>
                            <div>
                                <li>Carbohydrate insulin: {backendCalculation.breakdown.carb_insulin} units</li>
                                <li>Protein contribution: {backendCalculation.breakdown.protein_contribution} units</li>
                                <li>Fat contribution: {backendCalculation.breakdown.fat_contribution} units</li>
                                <li className={styles.summaryLine}>
                                    <strong>Total Base Units: {backendCalculation.breakdown.base_insulin} units</strong>
                                </li>
                            </div>
                        </li>

                        <li className={styles.breakdownSection}>
                            <strong>Adjustment Factors</strong>
                            <div>
                                <li>Absorption
                                    rate: {((backendCalculation.breakdown.absorption_factor - 1) * 100).toFixed(1)}%
                                </li>
                                <li>Meal
                                    timing: {((backendCalculation.breakdown.meal_timing_factor - 1) * 100).toFixed(1)}%
                                </li>
                                <li>Time of day: {((backendCalculation.breakdown.time_factor - 1) * 100).toFixed(1)}%
                                </li>
                                <li>Activity
                                    impact: {((backendCalculation.breakdown.activity_coefficient - 1) * 100).toFixed(1)}%
                                </li>
                                <li>Health
                                    multiplier: {((backendCalculation.breakdown.health_multiplier - 1) * 100).toFixed(1)}%
                                </li>
                            </div>
                        </li>

                        {backendCalculation.breakdown.correction_insulin !== 0 && (
                            <li className={styles.breakdownSection}>
                                <strong>Correction Units</strong>
                                <div>
                                    <li>Correction insulin: {backendCalculation.breakdown.correction_insulin} units</li>
                                </div>
                            </li>
                        )}

                        <li className={styles.summaryLine}>
                            <strong>Final Total: {backendCalculation.total} units</strong>
                        </li>
                    </ul>
                </div>
            )}


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