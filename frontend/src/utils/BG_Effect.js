/**
 * BG_Effect.js - Utility functions for blood glucose effect calculations
 * 
 * This utility provides functions to calculate and visualize the effects of
 * various factors (meals, insulin, activity) on blood glucose levels.
 */

/**
 * Calculate the effect of a meal on blood glucose levels over time
 * 
 * @param {Object} meal - The meal data object
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} effectDurationHours - Duration of effect in hours
 * @param {Object} TimeManager - TimeManager utility for time calculations
 * @returns {Array} Array of effect points over time
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
    const durationHours = Math.min(effectDurationHours, 6);

    // Generate the effect curve similar to the original implementation
     const startTime = meal.timestamp;
    const results = [];

    // Generate points at 5-minute intervals instead of 15 for smoother curves
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
        const decayRate = 0.8 / (durationHours - peakHour); // Slightly slower decay
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
 * Generate combined timeline data showing meal impacts on blood glucose
 *
 * @param {Array} mealData - Array of meal objects
 * @param {Array} bloodGlucoseData - Array of blood glucose readings
 * @param {Object} options - Configuration options
 * @param {Object} contextFunctions - Blood sugar context functions
 * @param {Object} TimeManager - TimeManager utility
 * @returns {Array} Combined timeline data with meal effects
 */
export const generateMealTimelineData = (
  mealData,
  bloodGlucoseData,
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

    const allTimestamps = [...allMealTimes, ...allBGTimes];
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
    console.log("Filtered blood sugar readings from context:", contextBloodSugarData.length);

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

      // Validate totalMealEffect
      if (isNaN(timePoint.totalMealEffect)) {
        console.warn("NaN totalMealEffect detected at", timePoint.formattedTime);
        timePoint.totalMealEffect = 0;
      }

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
      // If no meal effect, blood sugar should equal baseline
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
    console.error('Error generating meal timeline data:', error);
    return [];
  }
};

/**
 * Calculate effect of insulin on blood glucose levels
 *
 * @param {Object} insulinDose - Insulin dose information
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} duration - Effect duration in hours
 * @returns {Array} Array of effect points over time
 */
export const calculateInsulinEffect = (insulinDose, patientConstants, duration = 6) => {
  // Implementation for insulin effect calculation
  // This would be similar to calculateMealEffect but with insulin-specific calculations
  // To be implemented based on insulin physiological model

  // Placeholder return for now
  return [];
};

/**
 * Calculate effect of physical activity on blood glucose levels
 *
 * @param {Object} activity - Activity data object
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} duration - Effect duration in hours
 * @returns {Array} Array of effect points over time
 */
export const calculateActivityEffect = (activity, patientConstants, duration = 6) => {
  // Implementation for activity effect calculation
  // This would model how physical activity impacts blood glucose
  // To be implemented based on activity physiological model

  // Placeholder return for now
  return [];
};

/**
 * Calculate combined effect of multiple factors (meals, insulin, activity)
 * on blood glucose levels
 * 
 * @param {Array} mealData - Array of meal objects
 * @param {Array} insulinData - Array of insulin dose objects
 * @param {Array} activityData - Array of activity objects
 * @param {Array} bloodGlucoseData - Array of blood glucose readings
 * @param {Object} options - Configuration options
 * @param {Object} contextFunctions - Blood sugar context functions
 * @param {Object} TimeManager - TimeManager utility
 * @returns {Array} Combined timeline data with all effects
 */
export const generateCombinedEffectsTimeline = (
  mealData, 
  insulinData, 
  activityData,
  bloodGlucoseData, 
  options = {}, 
  contextFunctions = {}, 
  TimeManager
) => {
  // This would combine all effect types into one timeline
  // Would leverage the individual effect calculation functions
  // For now, just call the meal timeline generator
  return generateMealTimelineData(mealData, bloodGlucoseData, options, contextFunctions, TimeManager);
};