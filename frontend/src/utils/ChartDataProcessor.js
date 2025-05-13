/**
 * ChartDataProcessor.js
 * 
 * Comprehensive utility for processing and combining meal, blood glucose, and 
 * insulin data for visualization in charts.
 */
import TimeManager from './TimeManager';
import TimeEffect from './TimeEffect';

/**
 * Prepares chart data by processing historical vs future points
 * @param {Array} data - Combined timeline data
 * @param {Object} options - Configuration options
 * @returns {Array} - Processed data ready for visualization
 */
export const prepareChartData = (data, options = {}) => {
  if (!data || !Array.isArray(data)) return [];
  
  const now = new Date().getTime();
  const { targetGlucose = 100 } = options;

  return data.map(point => {
    const isHistorical = point.timestamp < now;
    const newPoint = { ...point };

    // For historical data (before now)
    if (isHistorical) {
      if (!point.isActualReading) {
        // For estimated points, hide the bloodSugar (dark purple) line
        // but keep estimatedBloodSugar (light purple) line
        newPoint.bloodSugar = null;
      }
      // For actual readings, keep both values so dots appear correctly
    }

    // Store the original bloodSugar value for tooltips
    newPoint.bloodSugarWithMealEffect = point.bloodSugar;

    // Process insulin bidirectional values if present
    if (point.insulinDoses) {
      newPoint.insulinBars = {};
      Object.entries(point.insulinDoses).forEach(([type, dose]) => {
        if (dose > 0) {
          newPoint.insulinBars[type] = getBidirectionalValue(dose, 'insulin');
        }
      });
    }

    // Process meal bidirectional values
    if (point.mealCarbs) {
      newPoint.mealBars = {};
      Object.entries(point.mealCarbs).forEach(([id, carbs]) => {
        if (carbs > 0) {
          newPoint.mealBars[id] = getBidirectionalValue(carbs, 'meal');
        }
      });
    }

    return newPoint;
  });
};

/**
 * Get bidirectional values for chart bars
 * @param {number} value - Original value
 * @param {string} type - Data type (meal or insulin)
 * @returns {number|null} - Directional value (positive for meals, negative for insulin)
 */
export const getBidirectionalValue = (value, type) => {
  if (!value || value === 0) return null;
  
  // Meals go up (positive), insulin goes down (negative)
  if (type.includes('insulin') || type.includes('acting')) {
    return -Math.abs(value); // Make insulin values negative
  }
  
  return Math.abs(value); // Make meal values positive
};

/**
 * Generate combined timeline data showing meal impacts on blood glucose
 *
 * @param {Array} mealData - Array of meal objects
 * @param {Array} bloodGlucoseData - Array of blood glucose readings
 * @param {Array} insulinData - Array of insulin doses
 * @param {Object} options - Configuration options
 * @param {Object} contextFunctions - Blood sugar context functions
 * @param {Object} TimeManager - TimeManager utility
 * @returns {Array} Combined timeline data with meal and insulin effects
 */
export const generateCombinedData = (
  mealData,
  bloodGlucoseData,
  insulinData = [],
  options = {},
  contextFunctions = {},
  TimeManager
) => {
  const {
    timeScale = { start: 0, end: 0, tickInterval: 3600000 },
    targetGlucose = 100,
    includeFutureEffect = false,
    futureHours = 6,
    effectDurationHours = 6,
    patientConstants = {}
  } = options;

  const {
    getBloodSugarAtTime = () => null,
    getBloodSugarStatus = () => ({ status: 'normal', color: '#000000' }),
    getFilteredData = data => data
  } = contextFunctions;

  try {
    if (!mealData || !Array.isArray(mealData) || mealData.length === 0) {
      console.log("No meal data available");
      return [];
    }

    // Find the earliest and latest timestamps
    const allMealTimes = mealData.map(m => m.timestamp).filter(t => !isNaN(t) && t > 0);
    const allBGTimes = bloodGlucoseData
      .map(d => d.readingTime)
      .filter(t => !isNaN(t) && t > 0);
    
    // Add insulin times if available
    const allInsulinTimes = insulinData?.map(d => d.administrationTime)?.filter(t => !isNaN(t) && t > 0) || [];

    const allTimestamps = [...allMealTimes, ...allBGTimes, ...allInsulinTimes];
    if (allTimestamps.length === 0) {
      console.log("No valid timestamps found");
      return [];
    }

    let minTime = Math.min(...allTimestamps);
    let maxTime = Math.max(...allTimestamps);

    // If including future effects, extend the timeline
    if (includeFutureEffect) {
      const futureTime = TimeManager.getFutureProjectionTime(futureHours);
      maxTime = Math.max(maxTime, futureTime);
    }

    console.log(`Timeline range: ${new Date(minTime)} to ${new Date(maxTime)}`);

    // Get filtered blood sugar data
    let contextBloodSugarData = getFilteredData(bloodGlucoseData);
    
    // Create maps for quick lookups
    const actualReadingsMap = new Map();
    const estimatedReadingsMap = new Map();

    // Populate blood glucose readings maps
    bloodGlucoseData.forEach(reading => {
      if (reading && reading.isActualReading) {
        actualReadingsMap.set(reading.readingTime, reading);
      } else if (reading && (reading.isEstimated || reading.isInterpolated)) {
        estimatedReadingsMap.set(reading.readingTime, reading);
      }
    });

    // Process meal effects for all meals
    console.log("Processing meal effects for", mealData.length, "meals");
    const mealEffects = mealData
      .filter(meal => meal && !isNaN(meal.timestamp) && meal.timestamp > 0)
      .map(meal => {
        const effects = calculateMealEffect(meal, patientConstants, effectDurationHours, TimeManager);
        return {
          meal,
          effects
        };
      });
      
    // Process insulin effects if insulin data is provided
    console.log("Processing insulin effects for", insulinData?.length || 0, "doses");
    const insulinEffects = insulinData
      ?.filter(dose => dose && !isNaN(dose.administrationTime) && dose.administrationTime > 0)
      ?.map(dose => {
        const effects = calculateInsulinEffect(dose, patientConstants, effectDurationHours);
        return {
          dose,
          effects
        };
      }) || [];

    // Create a timeline using 15-minute intervals
    const timelineData = [];
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds
    let currentTime = minTime;
    let pointsWithEffects = 0;

    // Generate the timeline
    while (currentTime <= maxTime) {
      // Use context's getBloodSugarAtTime to get the blood sugar at this time point
      const bsAtTime = getBloodSugarAtTime(currentTime);

      // Create the time point data structure
      const timePoint = {
        timestamp: currentTime,
        formattedTime: TimeManager.formatDate(
          new Date(currentTime),
          TimeManager.formats.DATETIME_DISPLAY
        ),
        meals: [],
        mealEffects: {},
        totalMealEffect: 0,
        
        // Insulin data
        insulinDoses: {},
        insulinEffects: {},
        totalInsulinEffect: 0,
        
        // Net effect (meal effect minus insulin effect)
        netEffect: 0,

        // Use data from context if available
        bloodSugar: bsAtTime ? bsAtTime.bloodSugar : targetGlucose,
        estimatedBloodSugar: bsAtTime ? bsAtTime.bloodSugar : targetGlucose,
        isActualReading: bsAtTime ? bsAtTime.isActualReading : false,
        isInterpolated: bsAtTime ? bsAtTime.isInterpolated : false,
        isEstimated: bsAtTime ? bsAtTime.isEstimated : false,
        dataType: bsAtTime ? bsAtTime.dataType : 'estimated',
        status: bsAtTime ? bsAtTime.status : getBloodSugarStatus(targetGlucose, targetGlucose)
      };

      // Add meals that occurred at this time point
      mealData.forEach(meal => {
        // Check if meal occurred within 15 minutes of this time point
        if (meal && !isNaN(meal.timestamp) && Math.abs(meal.timestamp - currentTime) < interval / 2) {
          // Add meal to the meals array for tooltip display
          timePoint.meals.push({
            id: meal.id,
            mealType: meal.mealType,
            carbs: meal.nutrition?.totalCarbs || 0,
            protein: meal.nutrition?.totalProtein || 0,
            fat: meal.nutrition?.totalFat || 0,
            totalCarbEquiv: meal.nutrition?.totalCarbEquiv || 0
          });

          // Create a property like "mealCarbs.123" where 123 is the meal ID
          if (meal.id) {
            timePoint[`mealCarbs.${meal.id}`] = meal.nutrition?.totalCarbs || 0;
          }
        }
      });
      
      // Add insulin doses to this time point
      if (insulinData && insulinData.length > 0) {
        insulinData.forEach(dose => {
          // Check if insulin dose occurred within 15 minutes of this time point
          if (dose && !isNaN(dose.administrationTime) && 
              Math.abs(dose.administrationTime - currentTime) < interval / 2) {
            const insulinType = dose.medication;
            
            // Increment dose counter for this insulin type
            timePoint.insulinDoses[insulinType] = 
              (timePoint.insulinDoses[insulinType] || 0) + dose.dose;
              
            // Store details for tooltip display
            if (!timePoint.insulinDetails) timePoint.insulinDetails = [];
            timePoint.insulinDetails.push({
              type: insulinType,
              dose: dose.dose,
              time: dose.administrationTime,
              formattedTime: dose.formattedTime || TimeManager.formatDate(
                new Date(dose.administrationTime),
                TimeManager.formats.DATETIME_DISPLAY
              )
            });
          }
        });
      }

      // Calculate combined meal effects at this time point
      mealEffects.forEach(({ meal, effects }) => {
        if (!Array.isArray(effects)) {
          console.warn(`Invalid effects array for meal:`, meal);
          return;
        }

        // Find effect at this time point
        const effect = effects.find(e => Math.abs(e.timestamp - currentTime) < interval / 2);
        if (effect && !isNaN(effect.impactValue) && effect.impactValue > 0) {
          const mealId = meal.id;
          if (mealId) {
            timePoint.mealEffects[mealId] = effect.impactValue;
            timePoint[`mealEffect.${mealId}`] = effect.impactValue;

            // Track total effect
            timePoint.totalMealEffect += effect.impactValue;
          }
        }
      });
      
      // Calculate insulin effects at this time point
      insulinEffects.forEach(({ dose, effects }) => {
        if (!Array.isArray(effects)) {
          console.warn(`Invalid effects array for insulin:`, dose);
          return;
        }
        
        // Find effect at this time point
        const effect = effects.find(e => Math.abs(e.timestamp - currentTime) < interval / 2);
        if (effect && !isNaN(effect.impactValue) && effect.impactValue > 0) {
          const insulinType = dose.medication;
          
          timePoint.insulinEffects[insulinType] = 
            (timePoint.insulinEffects[insulinType] || 0) + effect.impactValue;
            
          // Track total insulin effect
          timePoint.totalInsulinEffect += effect.impactValue;
        }
      });

      // Validate totalMealEffect
      if (isNaN(timePoint.totalMealEffect)) {
        console.warn("NaN totalMealEffect detected at", timePoint.formattedTime);
        timePoint.totalMealEffect = 0;
      }
      
      // Validate totalInsulinEffect
      if (isNaN(timePoint.totalInsulinEffect)) {
        console.warn("NaN totalInsulinEffect detected at", timePoint.formattedTime);
        timePoint.totalInsulinEffect = 0;
      }
      
      // Calculate net effect (meal effect minus insulin effect)
      // Use an insulin sensitivity factor to convert insulin units to glucose impact
      const insulinSensitivityFactor = patientConstants?.insulin_sensitivity_factor || 50; // mg/dL per unit
      timePoint.netEffect = timePoint.totalMealEffect - 
        (timePoint.totalInsulinEffect * (insulinSensitivityFactor / 10)); // Scaling factor

      // Apply meal effect calculations
      if (timePoint.totalMealEffect > 0) {
        // Get patient-specific carb-to-glucose factor from constants
        const carbToBgFactor = patientConstants?.carb_to_bg_factor || 4.0;

        // Calculate meal impact using the patient-specific factor
        const mealImpact = timePoint.totalMealEffect * carbToBgFactor;

        // Store the raw meal impact without rounding
        timePoint.mealImpactMgdL = mealImpact;

        // FIRST CALCULATION: Impact on estimated blood sugar
        if (!timePoint.isActualReading) {
          // Ensure we maintain the original estimated blood sugar
          timePoint.estimatedBloodSugar = timePoint.bloodSugar;

          // Apply meal effect to blood sugar value
          timePoint.bloodSugar = Math.max(70, timePoint.estimatedBloodSugar + mealImpact);
          timePoint.affectedByMeal = true;
          pointsWithEffects++;
        }

        // SECOND CALCULATION: Calculate hypothetical impact on target blood sugar
        timePoint.targetWithMealEffect = Math.max(70, targetGlucose + mealImpact);

        // Calculate deviation from target with the meal effect applied
        timePoint.targetDeviation = timePoint.bloodSugar - targetGlucose;
        timePoint.targetDeviationPercent = Math.round((timePoint.bloodSugar / targetGlucose) * 100);

        // Update status based on new value
        timePoint.status = getBloodSugarStatus(timePoint.bloodSugar, targetGlucose);
      }
      
      // Apply insulin effect if present
      if (timePoint.totalInsulinEffect > 0) {
        const insulinImpact = timePoint.totalInsulinEffect * 
          (patientConstants?.insulin_sensitivity_factor || 50); // mg/dL per unit
          
        timePoint.insulinImpactMgdL = insulinImpact;
        
        // Only apply to non-actual readings
        if (!timePoint.isActualReading) {
          // Calculate predicted blood sugar with insulin effect
          timePoint.predictedBloodSugar = Math.max(
            70, 
            (timePoint.bloodSugar || timePoint.estimatedBloodSugar) - insulinImpact
          );
        }
      }

      // Add the time point to timeline data
      timelineData.push(timePoint);
      currentTime += interval;
    }
    
    const now = new Date().getTime();
    const processedTimelineData = timelineData.map(point => {
      const isHistorical = point.timestamp < now;

      // Create a new object to avoid mutating the original
      const processedPoint = { ...point };

      // Always save the baseline blood sugar, regardless of historical/future
      processedPoint.baselineBloodSugar = processedPoint.estimatedBloodSugar;

      // For historical points that aren't actual readings, show only baseline values
      if (isHistorical && !point.isActualReading) {
        // Store the meal effect version for tooltips
        processedPoint.bloodSugarWithMealEffect = processedPoint.bloodSugar;
        // Set displayed blood sugar to baseline (no meal effect)
        processedPoint.bloodSugar = processedPoint.estimatedBloodSugar;
      }
      // For future points, ensure we maintain both values
      else if (!isHistorical) {
        // Keep bloodSugar as is (with meal effects)
        // Make sure estimatedBloodSugar has a valid value for future points
        if (!processedPoint.estimatedBloodSugar || processedPoint.estimatedBloodSugar === 0) {
          // Find a reasonable baseline value - either from context or target glucose
          processedPoint.estimatedBloodSugar = point.totalMealEffect > 0 ?
            (processedPoint.bloodSugar - (point.mealImpactMgdL || 0)) :
            processedPoint.bloodSugar;
        }
      }

      return processedPoint;
    });

    console.log(`Processed ${processedTimelineData.length} timeline data points with historical/future split`);
    return processedTimelineData;

  } catch (error) {
    console.error('Error generating combined data:', error);
    return [];
  }
};

/**
 * Calculate the effect of a meal on blood glucose levels over time
 */
export const calculateMealEffect = (meal, patientConstants, effectDurationHours = 6, TimeManager) => {
  if (!meal || !patientConstants) {
    console.log("Missing meal or patientConstants data");
    return [];
  }

  try {
    // Extract meal nutrition data or use defaults
    const nutrition = meal.nutrition || {};
    const totalCarbEquiv = nutrition.totalCarbEquiv || nutrition.totalCarbs || 0;
    const absorptionType = nutrition.absorptionType || 'medium';

    // Get absorption modifiers from constants
    const absorptionModifiers = patientConstants.absorption_modifiers || {
      very_fast: 1.4,
      fast: 1.2,
      medium: 1.0,
      slow: 0.8,
      very_slow: 0.6
    };

    // Define peak and duration based on absorption type
    const absorptionFactor = absorptionModifiers[absorptionType] || 1.0;
    const peakHour = absorptionType === 'fast' ? 1.0 :
                    absorptionType === 'slow' ? 2.0 : 1.5;
    const durationHours = Math.min(effectDurationHours, 10);

    // Generate the effect curve
    const startTime = meal.timestamp;
    const results = [];

    // Generate points at 5-minute intervals for smoother curves
    for (let minute = 0; minute <= durationHours * 60; minute += 5) {
      const hoursSinceMeal = minute / 60;
      let impactValue = 0;

      // Calculate impact using an enhanced physiological model
      if (hoursSinceMeal <= peakHour) {
        // Rising phase with smoother curve (modified bell curve)
        const normalizedTime = hoursSinceMeal / peakHour;
        // This formula creates a smoother rise with physiologically plausible acceleration
        impactValue = totalCarbEquiv * (Math.pow(normalizedTime, 1.2)) * Math.exp(1 - normalizedTime);
      } else if (hoursSinceMeal <= durationHours) {
        // Falling phase with gradual decay (more realistic)
        const decayRate = 0.8 / (durationHours - peakHour);
        const normalizedTime = hoursSinceMeal - peakHour;
        // Smoother exponential decay
        impactValue = totalCarbEquiv * 0.95 * Math.exp(-normalizedTime * decayRate);
      }

      // Apply absorption factor
      impactValue *= absorptionFactor;

      // Timestamp for this point
      const timestamp = startTime + (minute * 60 * 1000);

      results.push({
        timestamp,
        hoursSinceMeal,
        impactValue: Math.max(0, impactValue)
      });
    }

    return results;
  } catch (error) {
    console.error("Error calculating meal effect:", error);
    return [];
  }
};

/**
 * Calculate the effect of insulin on blood glucose over time
 * @param {Object} dose - Insulin dose data
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} effectDurationHours - Maximum duration to calculate
 * @returns {Array} Array of effect points
 */
export const calculateInsulinEffect = (dose, patientConstants, effectDurationHours = 6) => {
  if (!dose || !patientConstants) {
    console.log("Missing dose or patientConstants data");
    return [];
  }
  
  try {
    // Extract insulin data
    const insulinType = dose.medication || 'regular_insulin';
    const doseAmount = dose.dose || 0;
    const administrationTime = dose.administrationTime || Date.now();
    
    // Get insulin parameters from patient constants
    const insulinParams = patientConstants.medication_factors?.[insulinType] || {
      onset_hours: 0.5,
      peak_hours: 2.0,
      duration_hours: 4.0
    };
    
    const onsetHours = insulinParams.onset_hours || 0.5;
    const peakHours = insulinParams.peak_hours || 2.0;
    const durationHours = Math.min(insulinParams.duration_hours || 4.0, effectDurationHours);
    
    // Generate the effect curve
    const results = [];
    
    // Generate points at 5-minute intervals for smoother curves
    for (let minute = 0; minute <= durationHours * 60; minute += 5) {
      const hoursSinceDose = minute / 60;
      let impactValue = 0;
      
      // Calculate impact using insulin action curve
      if (hoursSinceDose < onsetHours) {
        // Slow initial rise during onset phase
        impactValue = doseAmount * (hoursSinceDose / onsetHours) * 0.3;
      } else if (hoursSinceDose < peakHours) {
        // Steeper rise to peak
        const normalizedTime = (hoursSinceDose - onsetHours) / (peakHours - onsetHours);
        impactValue = doseAmount * (0.3 + normalizedTime * 0.7);
      } else if (hoursSinceDose <= durationHours) {
        // Gradual decay from peak
        const normalizedTime = (hoursSinceDose - peakHours) / (durationHours - peakHours);
        impactValue = doseAmount * Math.max(0, 1 - normalizedTime);
      }
      
      // Timestamp for this point
      const timestamp = administrationTime + (minute * 60 * 1000);
      
      results.push({
        timestamp, 
        hoursSinceDose,
        impactValue: Math.max(0, impactValue)
      });
    }
    
    return results;
  } catch (error) {
    console.error("Error calculating insulin effect:", error);
    return [];
  }
};

/**
 * Helper function to get consistent colors for different data types
 * @param {string} type - Type of data (meal type or insulin type)
 * @param {boolean} isEffect - Whether this is for an effect line
 * @returns {string} - Color hex code
 */
export const getDataColor = (type, isEffect = false) => {
  // Enhanced color scheme with separate colors for meals and insulin
  const colorMap = {
    // Meal colors (upward)
    'breakfast': '#9c6ade',
    'lunch': '#50c878',
    'dinner': '#ff5722',
    'snack': '#ffc107',
    'normal': '#8a2be2',
    
    // Insulin colors (downward)
    'rapid_acting': '#0088FE',
    'short_acting': '#00C49F',
    'intermediate_acting': '#FFBB28',
    'long_acting': '#FF8042',
    'regular_insulin': '#8884d8',
    'insulin_lispro': '#82ca9d',
    'insulin_aspart': '#ffc658',
    'insulin_glulisine': '#ff8042',
    'nph_insulin': '#0088fe',
    'insulin_detemir': '#00C49F',
    'insulin_glargine': '#FFBB28',
    'insulin_degludec': '#FF8042'
  };

  const baseColor = colorMap[type] || 
                   (type.includes('insulin') ? '#8884d8' : '#9c6ade');

  if (isEffect) {
    // For effect lines, use a slightly different shade
    return adjustColorBrightness(baseColor, -15);
  }

  return baseColor;
};

/**
 * Helper function to adjust color brightness
 * @param {string} hex - Hex color code
 * @param {number} percent - Percentage to adjust brightness
 * @returns {string} - Adjusted hex color code
 */
export const adjustColorBrightness = (hex, percent) => {
  let r = parseInt(hex.substring(1, 3), 16);
  let g = parseInt(hex.substring(3, 5), 16);
  let b = parseInt(hex.substring(5, 7), 16);

  r = Math.min(255, Math.max(0, r + percent));
  g = Math.min(255, Math.max(0, g + percent));
  b = Math.min(255, Math.max(0, b + percent));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

/**
 * Format legend text to clean up labels
 * @param {string} value - Label value
 * @returns {string} - Formatted label
 */
export const formatLegendText = (value) => {
  // Format specific data series properly
  if (value === 'bloodSugar') {
    return 'Blood Sugar (with meal effects, future)';
  } else if (value === 'estimatedBloodSugar') {
    return 'Baseline Blood Sugar (historical)';
  } else if (value === 'targetWithMealEffect') {
    return 'Target + Meal Effect';
  } else if (value === 'totalMealEffect') {
    return 'Total Meal Effect';
  } else if (value === 'totalInsulinEffect' || value === 'totalInsulinEffectValue') {
    return 'Total Active Insulin';
  }
  
  // Handle meal-related entries
  if (value.includes('mealCarbs.')) {
    return 'Meal Carbs';
  } else if (value.includes('mealEffect.')) {
    return 'Meal Effect';
  }
  
  // Handle insulin-related entries
  if (value.includes('insulinBars.') || value.includes('insulinDoses.')) {
    // Extract insulin type from the key
    const insulinType = value.split('.')[1];
    return `${insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Dose`;
  } else if (value.includes('insulinEffect.')) {
    const insulinType = value.split('.')[1];
    return `${insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Effect`;
  }

  // For meal entries with timestamps, make them cleaner
  if (value.includes('breakfast') || value.includes('lunch') ||
      value.includes('dinner') || value.includes('snack')) {
    // Get just the meal type without timestamp
    const mealType = value.split(' (')[0];
    return mealType.charAt(0).toUpperCase() + mealType.slice(1);
  }

  return value;
};