/**
 * BG_Effect.js - Utility functions for blood glucose effect calculations
 *
 * This utility provides functions to calculate and visualize the effects of
 * various factors (meals, insulin, activity) on blood glucose levels.
 */

/****** MEAL EFFECT CALCULATIONS ******/

/**
 * Calculate the effect of a meal on blood glucose levels over time
 *
 * @param {Object} meal - The meal data object
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} effectDurationHours - Duration of effect in hours
 * @param {Object} TimeManager - TimeManager utility for time calculations
 * @returns {Array} Array of effect points over time
 */
function calculateMealEffect(meal, patientConstants, effectDurationHours = 6, TimeManager) {
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
}

/**
 * Calculate total carbohydrate equivalents from nutrition data
 *
 * @param {Object} nutrition - Nutrition data (carbs, protein, fat)
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {number} - Total carbohydrate equivalents
 */
function calculateCarbEquivalents(nutrition, patientConstants) {
  if (!nutrition) return 0;

  // Extract nutritional values
  const carbs = nutrition.carbs || nutrition.totalCarbs || 0;
  const protein = nutrition.protein || nutrition.totalProtein || 0;
  const fat = nutrition.fat || nutrition.totalFat || 0;
  const fiber = nutrition.fiber || 0;

  // Get conversion factors from patient constants or use defaults
  const proteinFactor = patientConstants?.protein_factor || 0.5;
  const fatFactor = patientConstants?.fat_factor || 0.2;
  const fiberFactor = patientConstants?.fiber_factor || 0.1;

  // Calculate protein and fat carb equivalents
  const proteinCarbEquiv = protein * proteinFactor;
  const fatCarbEquiv = fat * fatFactor;
  const fiberReduction = fiber * fiberFactor;

  // Calculate total carb equivalents (carbs + protein equiv + fat equiv - fiber reduction)
  const totalCarbEquiv = carbs + proteinCarbEquiv + fatCarbEquiv - fiberReduction;

  // Ensure result is not negative
  return Math.max(0, totalCarbEquiv);
}

/****** DATA VISUALIZATION AND TIMELINE GENERATION ******/

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
function generateMealTimelineData(
  mealData,
  bloodGlucoseData,
  options = {},
  contextFunctions = {},
  TimeManager
) {
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

    // CRITICAL FIX: Ensure we have a sufficient time range for all views
    const now = new Date().getTime();

    // Step 1: Use timeScale if provided, and ensure it has sufficient range
    let minTime = timeScale && typeof timeScale.start === 'number' ? timeScale.start : now - (24 * 60 * 60 * 1000);
    let maxTime = timeScale && typeof timeScale.end === 'number' ? timeScale.end : now + (24 * 60 * 60 * 1000);

    // Step 2: Find meal and blood glucose timestamps
    const allMealTimes = mealData.map(m => m.timestamp).filter(t => !isNaN(t) && t > 0);
    const allBGTimes = (bloodGlucoseData || [])
      .map(d => d.readingTime)
      .filter(t => !isNaN(t) && t > 0);

    // Step 3: Consider meal and BG data points in timeframe calculation, but don't let them restrict range
    if (allMealTimes.length > 0) {
      minTime = Math.min(minTime, Math.min(...allMealTimes));
      maxTime = Math.max(maxTime, Math.max(...allMealTimes));
    }

    if (allBGTimes.length > 0) {
      minTime = Math.min(minTime, Math.min(...allBGTimes));
      maxTime = Math.max(maxTime, Math.max(...allBGTimes));
    }

    // Step 4: CRITICAL - Ensure we have enough future time to show meal effects
    // Include at least enough future time for the full effect duration
    const minFutureTime = now + (effectDurationHours * 60 * 60 * 1000);

    // If we need more future time than currently calculated, extend it
    if (maxTime < minFutureTime) {
      maxTime = minFutureTime;
    }

    // Additional safety check: If we have a very narrow time window, expand it
    const timeRange = maxTime - minTime;
    if (timeRange < 6 * 60 * 60 * 1000) { // Less than 6 hours
      console.log("Expanding narrow time range for proper meal effect visualization");
      minTime = now - (12 * 60 * 60 * 1000); // At least 12 hours back
      maxTime = now + (12 * 60 * 60 * 1000); // At least 12 hours forward
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

    // IMPROVEMENT: Create a timeline using consistent interval logic
    const timelineData = [];
    let interval = 15 * 60 * 1000; // Default 15 minutes

    // Adjust interval based on timeline length to prevent too many points
    const totalHours = (maxTime - minTime) / (60 * 60 * 1000);
    if (totalHours > 72) { // More than 3 days
      interval = 30 * 60 * 1000; // Use 30-minute intervals
    } else if (totalHours <= 6) { // 6 hours or less
      interval = 5 * 60 * 1000; // Use 5-minute intervals for higher resolution
    }

    let currentTime = minTime;
    let pointsWithEffects = 0;

    // Generate the timeline
    while (currentTime <= maxTime) {
      // Use context's getBloodSugarAtTime to get the blood sugar at this time point
      const bsAtTime = getBloodSugarAtTime(currentTime);

      // Create the time point data structure
      const timePoint = {
        timestamp: currentTime,
        formattedTime: TimeManager.formatDate
          ? TimeManager.formatDate(new Date(currentTime), TimeManager.formats?.DATETIME_DISPLAY || 'datetime')
          : new Date(currentTime).toLocaleString(),
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

    const processedTimelineData = prepareTimelineData(timelineData, targetGlucose);
    console.log(`Processed ${processedTimelineData.length} timeline data points with historical/future split`);
    return processedTimelineData;
  } catch (error) {
    console.error('Error generating meal timeline data:', error);
    return [];
  }
}

/**
 * Process timeline data for historical vs. future display
 *
 * @param {Array} timelineData - Raw timeline data
 * @param {number} targetGlucose - Target blood glucose level
 * @returns {Array} - Processed timeline data
 */
function prepareTimelineData(timelineData, targetGlucose) {
  if (!timelineData || !Array.isArray(timelineData)) return [];

  const now = new Date().getTime();

  return timelineData.map(point => {
    const isHistorical = point.timestamp < now;
    const newPoint = { ...point };

    // Always save the baseline blood sugar, regardless of historical/future
    newPoint.baselineBloodSugar = newPoint.estimatedBloodSugar;

    // For historical points that aren't actual readings, show only baseline values
    if (isHistorical && !point.isActualReading) {
      // Store the meal effect version for tooltips
      newPoint.bloodSugarWithMealEffect = newPoint.bloodSugar;
      // Set displayed blood sugar to baseline (no meal effect)
      newPoint.bloodSugar = newPoint.estimatedBloodSugar;
    }
    // For future points, ensure we maintain both values
    else if (!isHistorical) {
      // Keep bloodSugar as is (with meal effects)
      // Make sure estimatedBloodSugar has a valid value for future points
      if (!newPoint.estimatedBloodSugar || newPoint.estimatedBloodSugar === 0) {
        // Find a reasonable baseline value - either from context or target glucose
        newPoint.estimatedBloodSugar = point.totalMealEffect > 0 ?
          (newPoint.bloodSugar - (point.mealImpactMgdL || 0)) :
          newPoint.bloodSugar;
      }
    }

    return newPoint;
  });
}

/**
 * Prepare chart data for rendering, with specific historical vs future handling
 *
 * @param {Array} data - The processed timeline data
 * @param {Object} options - Configuration options
 * @returns {Array} - Data ready for chart rendering
 */
function prepareChartData(data, options = {}) {
  if (!data || !Array.isArray(data)) return [];

  const { targetGlucose = 100 } = options;
  const now = new Date().getTime();

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
    // For future data (after now)
    else {
      // IMPORTANT: Don't null out estimatedBloodSugar for future points
      // Keep both lines for future projection

      // Ensure we have a valid estimatedBloodSugar for the baseline
      if (newPoint.estimatedBloodSugar === null || newPoint.estimatedBloodSugar === undefined ||
          newPoint.estimatedBloodSugar === 0) {
        // If missing, use the original baseline from the bloodSugar context
        // or fall back to target glucose as a reasonable baseline
        newPoint.estimatedBloodSugar = newPoint.baselineBloodSugar || targetGlucose;
      }

      // Make sure bloodSugar (with meal effect) is properly set for future points
      if (!point.isActualReading) {
        // Keep the bloodSugar value for the dark purple line (with meal effect)
      }
    }

    // Store the original bloodSugar value for tooltips
    newPoint.bloodSugarWithMealEffect = point.bloodSugar;

    return newPoint;
  });
}

/****** INSULIN EFFECT CALCULATIONS ******/

/**
 * Calculate effect of insulin on blood glucose levels
 *
 * @param {Object} insulinDose - Insulin dose information
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} duration - Effect duration in hours
 * @returns {Array} Array of effect points over time
 */
function calculateInsulinEffect(insulinDose, patientConstants, duration = 6) {
  // To be implemented for insulin integration
  return [];
}

/****** DATA ANALYSIS AND STATISTICS ******/

/**
 * Calculate nutritional distribution from a list of meals
 *
 * @param {Array} meals - Array of meal objects
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Object} - Aggregated nutrition data
 */
function calculateNutritionDistribution(meals, patientConstants) {
  if (!meals || !Array.isArray(meals) || meals.length === 0) {
    return {
      avgCarbs: 0,
      avgProtein: 0,
      avgFat: 0,
      avgCarbEquivalent: 0,
      avgPeakTime: 0,
      avgEffectDuration: 0
    };
  }

  const totalCarbs = meals.reduce((sum, meal) => sum + (meal.nutrition?.totalCarbs || 0), 0);
  const totalProtein = meals.reduce((sum, meal) => sum + (meal.nutrition?.totalProtein || 0), 0);
  const totalFat = meals.reduce((sum, meal) => sum + (meal.nutrition?.totalFat || 0), 0);

  // Calculate total carb equivalents using our new function
  const totalCarbEquiv = meals.reduce((sum, meal) => {
    if (!meal.nutrition) return sum;
    return sum + calculateCarbEquivalents(meal.nutrition, patientConstants);
  }, 0);

  // Calculate estimated peak time based on meal composition
  const totalPeakTime = meals.reduce((sum, meal) => {
    const carbs = meal.nutrition?.totalCarbs || 0;
    const protein = meal.nutrition?.totalProtein || 0;
    const fat = meal.nutrition?.totalFat || 0;
    const total = carbs + protein + fat;

    // Higher carb meals peak faster
    const carbRatio = total > 0 ? carbs / total : 0.5;
    const basePeak = 0.5 + ((1 - carbRatio) * 0.5);

    // Adjust for absorption type
    const absorptionType = meal.nutrition?.absorptionType || 'medium';
    const absorptionFactor = absorptionType === 'fast' ? 1.2 :
                           absorptionType === 'slow' ? 0.8 : 1.0;

    return sum + (basePeak / absorptionFactor);
  }, 0);

  // Calculate estimated effect duration based on meal composition
  const totalDuration = meals.reduce((sum, meal) => {
    const fat = meal.nutrition?.totalFat || 0;
    const protein = meal.nutrition?.totalProtein || 0;

    // Higher fat/protein extends duration
    const baseDuration = 2 + (fat * 0.02) + (protein * 0.01);

    // Adjust for absorption type
    const absorptionType = meal.nutrition?.absorptionType || 'medium';
    const absorptionFactor = absorptionType === 'fast' ? 1.2 :
                           absorptionType === 'slow' ? 0.8 : 1.0;

    return sum + (baseDuration / absorptionFactor);
  }, 0);

  return {
    avgCarbs: totalCarbs / meals.length,
    avgProtein: totalProtein / meals.length,
    avgFat: totalFat / meals.length,
    avgCarbEquivalent: totalCarbEquiv / meals.length,
    avgPeakTime: totalPeakTime / meals.length,
    avgEffectDuration: totalDuration / meals.length
  };
}

/**
 * Calculate statistics for meal effects
 *
 * @param {Array} meals - Array of meal objects
 * @param {Array} combinedData - Combined data points with meal effects
 * @returns {Object} - Statistical analysis
 */
function calculateMealStatistics(meals, combinedData) {
  if (!meals || !combinedData || meals.length === 0 || combinedData.length === 0) {
    return {
      maxEffect: 0,
      avgEffect: 0,
      effectVariance: 0,
      mealTypes: {}
    };
  }

  // Find the maximum meal effect in the combined data
  const maxEffect = Math.max(...combinedData
    .filter(d => d.totalMealEffect > 0)
    .map(d => d.totalMealEffect));

  // Calculate average meal effect
  const effectPoints = combinedData.filter(d => d.totalMealEffect > 0);
  const avgEffect = effectPoints.length > 0 ?
    effectPoints.reduce((sum, d) => sum + d.totalMealEffect, 0) / effectPoints.length : 0;

  // Calculate variance in meal effects
  const effectVariance = effectPoints.length > 0 ?
    Math.sqrt(effectPoints.reduce((sum, d) => sum + Math.pow(d.totalMealEffect - avgEffect, 2), 0) / effectPoints.length) : 0;

  // Count meal types
  const mealTypes = meals.reduce((count, meal) => {
    const type = meal.mealType || 'unknown';
    count[type] = (count[type] || 0) + 1;
    return count;
  }, {});

  return {
    maxEffect,
    avgEffect,
    effectVariance,
    mealTypes
  };
}

/****** UTILITY FUNCTIONS ******/

/**
 * Apply date preset for non-TimeContext users
 *
 * @param {number} days - Number of days to include
 * @returns {Object} - Date range object with start and end dates
 */
function applyDatePreset(days) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);

  // Simple date formatter for YYYY-MM-DD format
  const formatToYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const startStr = formatToYYYYMMDD(start);

  let end;
  if (days === 1) {
    // For "Last 24h": past day plus 12 hours
    end = new Date(now);
    end.setHours(end.getHours() + 12);
  } else {
    // Default: add one future day
    end = new Date(now);
    end.setDate(end.getDate() + 1);
  }
  const endStr = formatToYYYYMMDD(end);

  return { start: startStr, end: endStr };
}

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
function generateCombinedEffectsTimeline(
  mealData,
  insulinData,
  activityData,
  bloodGlucoseData,
  options = {},
  contextFunctions = {},
  TimeManager
) {
  // This will be enhanced to combine all effect types into one timeline
  // For now, just call the meal timeline generator
  return generateMealTimelineData(mealData, bloodGlucoseData, options, contextFunctions, TimeManager);
}

// Export all functions
export {
  calculateMealEffect,
  generateMealTimelineData,
  prepareChartData,
  prepareTimelineData,
  calculateInsulinEffect,
  generateCombinedEffectsTimeline,
  calculateCarbEquivalents,
  calculateNutritionDistribution,
  calculateMealStatistics,
  applyDatePreset
};