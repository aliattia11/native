import React, { useState, useEffect, useCallback, useRef, useContext, useMemo } from 'react';
import { useConstants } from '../contexts/ConstantsContext';
import TimeContext from '../contexts/TimeContext';
import axios from 'axios';
import { FaInfoCircle, FaChevronDown, FaChevronUp, FaFileImport, FaSync, FaHistory } from 'react-icons/fa';
import FoodSection from './FoodSection';
import {
  calculateTotalNutrients,
  calculateInsulinDose,
  getHealthFactorsBreakdown
} from './EnhancedPatientConstantsCalc';
import InsulinInput from './InsulinInput';
import BloodSugarInput from './BloodSugarInput';
import ActivityRecording from './ActivityRecording';
import TimeManager from '../utils/TimeManager';
import { MEAL_TYPES } from '../constants';
import { recommendInsulinType } from '../utils/insulinUtils';
import styles from './MealInput.module.css';

const MealInput = () => {
  // Get TimeContext and set up unified time utilities
  const timeContext = useContext(TimeContext);

  // Create a single timeUtils object with memoization that handles all cases consistently
  const timeUtils = useMemo(() => {
    return {
      getCurrentTime: () => TimeManager.getCurrentTimeISOString(),
      localToUTC: (localTime) => TimeManager.localToUTCISOString(localTime),
      formatDateTime: (timestamp, format) => {
        if (!timestamp) return '';
        return TimeManager.formatDateTime(timestamp);
      },
      getUserTimeZone: () => TimeManager.getUserTimeZone(),
      calculateDuration: (start, end) => TimeManager.calculateDuration(start, end),
      formatRelativeTime: (time) => TimeManager.formatRelativeTime(time),
      parseTimestamp: (timestamp) => TimeManager.parseTimestamp(timestamp)
    };
  }, []);

  const { patientConstants, loading, error, refreshConstants } = useConstants();
  const [mealType, setMealType] = useState('');
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [activitiesFromRecording, setActivitiesFromRecording] = useState([]);
  const [activityImpactFromRecording, setActivityImpactFromRecording] = useState(1.0);
  const [activityImpact, setActivityImpact] = useState(1.0);
  const [bloodSugar, setBloodSugar] = useState('');
  const [bloodSugarTimestamp, setBloodSugarTimestamp] = useState('');
  const [suggestedInsulin, setSuggestedInsulin] = useState('');
  const [suggestedInsulinType, setSuggestedInsulinType] = useState('');
  const [insulinBreakdown, setInsulinBreakdown] = useState(null);
  const [insulinData, setInsulinData] = useState({
    type: '',
    dose: '',
    notes: ''
  });
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [healthFactors, setHealthFactors] = useState(null);
  const [backendCalculation, setBackendCalculation] = useState(null);
  const [expandedCard, setExpandedCard] = useState(null);
  const [bloodSugarSource, setBloodSugarSource] = useState('direct');
  const [userTimeZone, setUserTimeZone] = useState('');

  // Import functionality states
  const [importStatus, setImportStatus] = useState(null);
  const [showRecentMeals, setShowRecentMeals] = useState(false);
  const [recentMeals, setRecentMeals] = useState([]);
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);

  // Create a ref for the file input element
  const fileInputRef = useRef(null);

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(timeUtils.getUserTimeZone());
  }, [timeUtils]);

  // Handler for InsulinInput changes
  const handleInsulinChange = (data) => {
    setInsulinData(data);
  };

  // Handler for ActivityRecording updates
  const handleActivityUpdate = (newActivities, totalImpact) => {
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

      // Get recommended insulin type based on meal context
      if (mealType) {
        const recommended = recommendInsulinType(
          mealType,
          selectedFoods,
          new Date()
        );
        setSuggestedInsulinType(recommended);
      }
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

  // Fetch recent meals
  const fetchRecentMeals = useCallback(async () => {
    try {
      setIsLoadingMeals(true);
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No authentication token found');
        return;
      }

      console.log('Fetching from meals-only endpoint...');
      const response = await axios.get(
        'http://localhost:5000/api/meals-only',
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          params: {
            limit: 10
          }
        }
      );

      if (response.data && response.data.meals) {
        console.log('Meals-only response:', response.data);
        setRecentMeals(response.data.meals);

        // Debug the calculation summary data
        response.data.meals.forEach((meal, index) => {
          console.log(`Meal ${index + 1}:`, {
            id: meal.id,
            mealType: meal.mealType,
            hasCalculationSummary: !!meal.calculation_summary,
            meal_only_suggested_insulin: meal.calculation_summary?.meal_only_suggested_insulin
          });
        });
      }
    } catch (error) {
      console.error('Error fetching from meals-only endpoint:', error);
      setMessage('Failed to load recent meals');
    } finally {
      setIsLoadingMeals(false);
    }
  }, []);

  // Toggle recent meals view
  const toggleRecentMeals = () => {
    setShowRecentMeals(prev => !prev);
    if (!showRecentMeals) {
      fetchRecentMeals();
    }
  };

  // Handle import button click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file upload for import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'csv' && fileExt !== 'json') {
      setImportStatus({
        type: 'error',
        message: 'Invalid file format. Please select a CSV or JSON file.'
      });
      return;
    }

    setIsSubmitting(true);
    setImportStatus({ type: 'info', message: 'Validating file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'meals');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // First validate the file
      const validationResponse = await axios.post(
        'http://localhost:5000/api/import/validate',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!validationResponse.data.valid) {
        setImportStatus({
          type: 'error',
          message: 'File validation failed',
          details: validationResponse.data.errors?.join('\n')
        });
        setIsSubmitting(false);
        return;
      }

      // If validation passes, proceed with import
      setImportStatus({ type: 'info', message: 'Importing data...' });

      const importResponse = await axios.post(
        'http://localhost:5000/api/import',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const results = importResponse.data.results;

      setImportStatus({
        type: 'success',
        message: `Successfully imported ${results.meals_imported || 0} meals`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh the recent meals list and constants
      await fetchRecentMeals();
      await refreshConstants();

      // Reset form states
      setMealType('');
      setSelectedFoods([]);
      setActivitiesFromRecording([]);
      setBloodSugar('');
      setSuggestedInsulin('');
      setInsulinBreakdown(null);
      setInsulinData({
        type: '',
        dose: '',
        notes: ''
      });
      setSuggestedInsulinType('');

    } catch (error) {
      console.error('Error importing data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Prevent accidental form submissions
  const preventFormSubmission = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      return false;
    }
  };

  // Add event listener to prevent form submissions on Enter
  useEffect(() => {
    document.addEventListener('keydown', preventFormSubmission);
    return () => {
      document.removeEventListener('keydown', preventFormSubmission);
    };
  }, []);

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

      // Make sure we have a properly formatted UTC timestamp for blood sugar reading
      const utcBloodSugarTimestamp = timeUtils.localToUTC(bloodSugarTimestamp);
      console.log('Submitting blood sugar timestamp (UTC):', utcBloodSugarTimestamp);

      // Get activity IDs if activities were recorded separately
      let activityIds = [];

      // If we have recorded activities separately before this meal submission
      if (activitiesFromRecording.length > 0) {
        try {
          // First record the activities separately to get their IDs
          const activitiesData = {
            expectedActivities: activitiesFromRecording.map(activity => {
              const durationData = timeUtils.calculateDuration(activity.startTime, activity.endTime);

              // Convert local time to UTC for API
              const startTimeUTC = timeUtils.localToUTC(activity.startTime);
              const endTimeUTC = timeUtils.localToUTC(activity.endTime);

              return {
                level: activity.level,
                duration: TimeManager.hoursToTimeString(durationData.totalHours),
                expectedTime: startTimeUTC,
                startTime: startTimeUTC,
                endTime: endTimeUTC,
                impact: activity.impact,
                notes: ""
              };
            }),
            completedActivities: [] // We typically use expected activities in meal context
          };

          const activityResponse = await axios.post(
            'http://localhost:5000/api/record-activities',
            activitiesData,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          // Store the IDs of created activities
          if (activityResponse.data && activityResponse.data.activity_ids) {
            activityIds = activityResponse.data.activity_ids;
            console.log('Activities recorded separately with IDs:', activityIds);
          }
        } catch (error) {
          console.warn('Failed to record activities separately:', error);
          // Continue with meal submission even if activity recording fails
        }
      }

      // Create meal data object
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
        // Don't send activities array anymore, just IDs
        activityIds: activityIds, // Use the array of activity IDs
        bloodSugar: bloodSugar ? parseFloat(bloodSugar) : null,
        bloodSugarTimestamp: utcBloodSugarTimestamp,
        bloodSugarSource,
        intendedInsulin: insulinData.dose ? parseFloat(insulinData.dose) : null,
        intendedInsulinType: insulinData.type,
        suggestedInsulinType,
        notes: insulinData.notes,
        calculationFactors: {
          absorptionFactor: insulinBreakdown?.absorptionFactor,
          mealTimingFactor: insulinBreakdown?.mealTimingFactor,
          activityImpact: activityImpactFromRecording,
          healthMultiplier: healthFactors?.healthMultiplier,
          medications: healthFactors?.medications?.map(med => ({
            name: med.name,
            factor: med.factor,
            status: med.status,
            hoursSinceLastDose: med.hoursSinceLastDose
          })) || [],
          conditions: healthFactors?.conditions?.map(condition => ({
            name: condition.name,
            factor: condition.factor
          })) || []
        }
      };

      // Add medication scheduling information if insulin is being logged
      if (insulinData.dose && insulinData.type) {
        const administrationTime = insulinData.administrationTime ?
          timeUtils.localToUTC(insulinData.administrationTime) :
          new Date().toISOString();

        mealData.medicationLog = {
          is_insulin: true,
          dose: parseFloat(insulinData.dose),
          medication: insulinData.type,
          scheduled_time: administrationTime, // Make sure this is in UTC
          notes: insulinData.notes,
          meal_context: {
            meal_type: mealType,
            blood_sugar: bloodSugar ? parseFloat(bloodSugar) : null,
            suggested_dose: suggestedInsulin ? parseFloat(suggestedInsulin) : null,
          }
        };
      }

      console.log('Submitting meal with data:', mealData);
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

      // Log the response for debugging
      console.log('Meal submission response:', response.data);

      // Reset form
      setMealType('');
      setSelectedFoods([]);
      setActivitiesFromRecording([]);
      setBloodSugar('');
      setSuggestedInsulin('');
      setInsulinBreakdown(null);
      setInsulinData({
        type: '',
        dose: '',
        notes: ''
      });
      setSuggestedInsulinType('');

      // Refresh constants to update medication schedules
      if (insulinData.dose && insulinData.type) {
        await refreshConstants();
      }

      // Refresh recent meals
      await fetchRecentMeals();

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
      <div className={styles.mealHeader}>
        <h2 className={styles.title}>Log Your Meal</h2>
        <div className={styles.actionButtons}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.refreshButton}`}
            onClick={fetchRecentMeals}
            title="Refresh meals"
            disabled={isSubmitting}
          >
            <FaSync className={isLoadingMeals ? styles.spin : ""} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.historyButton}`}
            onClick={toggleRecentMeals}
            title={showRecentMeals ? "Hide recent meals" : "Show recent meals"}
          >
            <FaHistory />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.importButton}`}
            onClick={handleImportClick}
            title="Import meals"
            disabled={isSubmitting}
          >
            <FaFileImport />
          </button>
          {/* Hidden file input triggered by the import button */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".csv,.json"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Add timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times stored in UTC but displayed in your local timezone)</span>
      </div>

      {/* Import Status Message */}
      {importStatus && (
        <div className={`${styles.message} ${styles[importStatus.type]}`}>
          <FaInfoCircle className={styles.messageIcon} />
          <div className={styles.messageContent}>
            <h4>{importStatus.message}</h4>
            {importStatus.details && (
              <pre className={styles.details}>{importStatus.details}</pre>
            )}
          </div>
        </div>
      )}

      {/* Recent Meals Section */}
      {showRecentMeals && (
        <div className={styles.recentMeals}>
          <h3>Recent Meals ({recentMeals.length})</h3>
          {isLoadingMeals ? (
            <div className={styles.loadingMeals}>Loading recent meals...</div>
          ) : recentMeals.length > 0 ? (
            <div className={styles.mealsList}>
              {recentMeals.map((meal) => (
                <div key={meal.id} className={styles.mealItem}>
                  <div className={styles.mealHeader}>
                    <span className={styles.mealType}>
                      {meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}
                    </span>
                    <span className={styles.mealTimestamp}>
                      {timeUtils.formatDateTime(meal.timestamp)}
                    </span>
                  </div>
                  <div className={styles.mealDetails}>
                    <div className={styles.foodItems}>
                      {meal.foodItems.length > 0 ? (
                        <div>
                          {meal.foodItems.slice(0, 3).map((food, idx) => (
                            <span key={idx} className={styles.foodItem}>
                              {food.name}
                            </span>
                          ))}
                          {meal.foodItems.length > 3 && (
                            <span className={styles.moreFoods}>
                              +{meal.foodItems.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className={styles.noFoods}>No food items</span>
                      )}
                    </div>
                    <div className={styles.mealNutrition}>
                      <span>{meal.nutrition?.carbs || 0}g carbs</span>
                      <span>{meal.nutrition?.protein || 0}g protein</span>
                      <span>{meal.nutrition?.fat || 0}g fat</span>
                    </div>

                    {/* Prominently display calculation summary with meal_only_suggested_insulin */}
                    {meal.calculation_summary && (
                      <div className={styles.mealCalculationSummary}>
                        <div className={styles.calcRow}>
                          <span className={styles.calcLabel}>Base Units:</span>
                          <span className={styles.calcValue}>{meal.calculation_summary.base_insulin?.toFixed(1) || 'N/A'}</span>
                        </div>

                        {meal.calculation_summary.adjustment_factors && (
                          <div className={styles.calcRow}>
                            <span className={styles.calcLabel}>Adjustments:</span>
                            <span className={styles.calcValue}>
                              <span className={styles.adjFactor}>
                                Abs: {((meal.calculation_summary.adjustment_factors.absorption_rate - 1) * 100).toFixed(0)}%
                              </span>
                              <span className={styles.adjFactor}>
                                Timing: {((meal.calculation_summary.adjustment_factors.meal_timing - 1) * 100).toFixed(0)}%
                              </span>
                            </span>
                          </div>
                        )}

                        {/* Prominently display meal_only_suggested_insulin */}
                        {meal.calculation_summary.meal_only_suggested_insulin !== undefined && (
                          <div className={`${styles.calcRow} ${styles.suggestedInsulinRow}`}>
                            <span className={styles.calcLabel}>Meal Only Suggested Insulin:</span>
                            <span className={styles.suggestedValue}>
                              {meal.calculation_summary.meal_only_suggested_insulin.toFixed(1)} units
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.noMeals}>No recent meals found</p>
          )}
          <div className={styles.mealsFooter}>
            <span className={styles.viewAllMeals}>
              <a href="#" onClick={(e) => {
                e.preventDefault();
                window.location.href = '/meal-history';
              }}>
                View all meals →
              </a>
            </span>
          </div>
        </div>
      )}

      <form className={styles.form} onSubmit={handleSubmit} onKeyDown={preventFormSubmission}>
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
              onBloodSugarChange={(value, timestamp) => {
                setBloodSugar(value);
                // Store the timestamp as provided - will be converted to UTC when submitting
                setBloodSugarTimestamp(timestamp || new Date().toISOString());
                setBloodSugarSource('direct');

                // Log for debugging
                console.log('Blood sugar timestamp set:', timestamp);
              }}
              disabled={isSubmitting}
              standalone={false}
              className={styles.mealInputBloodSugar}
              useTimeContext={false} // Don't use timeContext directly in sub-components
            />
            {bloodSugarTimestamp && (
              <div className="timestamp-display">
                Reading time: {timeUtils.formatDateTime(bloodSugarTimestamp)}
              </div>
            )}
          </div>
        </div>

        {/* Unified InsulinInput component */}
        <div className={styles.formField}>
          <InsulinInput
            isStandalone={false}
            initialInsulin={insulinData.type}
            initialDose={insulinData.dose}
            onInsulinChange={handleInsulinChange}
            suggestedInsulin={suggestedInsulin}
            suggestedInsulinType={suggestedInsulinType}
            className={styles.mealInputInsulin}
          />
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
                      {/* Removed the Time of day factor */}
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
                            (Base insulin × Absorption × Meal timing × Activity factor)
                            {/* Removed Time of day from the formula explanation */}
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

      <style jsx="true">{`
        .timestamp-display {
          font-size: 0.85em;
          color: #666;
          margin-top: 5px;
          margin-bottom: 10px;
          font-style: italic;
        }
        
        .timezone-info {
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 15px;
        }
        
        .timezone-note {
          font-style: italic;
        }
      `}</style>
    </div>
  );
};

export default MealInput;