/**
 * BG_Effect.js - Utility functions for blood glucose effect calculations
 * Now includes unified meal impact model for both visualization and insulin calculation systems
 */

/****** UNIFIED MODEL CORE FUNCTIONS ******/

/**
 * Calculate total carbohydrate equivalents from nutrition data - SHARED CALCULATION
 *
 * @param {Object} nutrition - Nutrition data (carbs, protein, fat)
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Object} - Total carbohydrate equivalents and components
 */
export function calculateCarbEquivalents(nutrition, patientConstants) {
  if (!nutrition) return {
    totalCarbEquiv: 0,
    carbsActual: 0,
    proteinCarbEquiv: 0,
    fatCarbEquiv: 0,
    fiberReduction: 0
  };

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
  const totalCarbEquiv = Math.max(0, carbs + proteinCarbEquiv + fatCarbEquiv - fiberReduction);

  return {
    totalCarbEquiv,
    carbsActual: carbs,
    proteinCarbEquiv,
    fatCarbEquiv,
    fiberReduction
  };
}

/**
 * Unified meal impact calculation - Used by BOTH visualization and insulin calculation
 *
 * @param {Object} mealData - Meal data with nutrition information
 * @param {Object} patientConstants - Patient-specific constants
 * @param {Object} options - Additional calculation options
 * @returns {Object} - Meal impact data for both visualization and insulin calculation
 */
export function calculateUnifiedMealImpact(mealData, patientConstants, options = {}) {
  const {
    includeTimeCurve = false,
    durationHours = 6,
    timeInterval = 5, // minutes
    currentTime = new Date()
  } = options;

  if (!mealData || !patientConstants) {
    return {
      carbEquivalents: { totalCarbEquiv: 0 },
      baseInsulin: 0,
      peakImpact: 0,
      bgImpact: 0,
      timeCurve: []
    };
  }

  try {
    // Extract meal nutrition data or use defaults
    const nutrition = mealData.nutrition || {};
    const mealType = mealData.mealType || 'normal';
    const absorptionType = nutrition.absorptionType || 'medium';

    // Get absorption modifiers from constants
    const absorptionModifiers = patientConstants.absorption_modifiers || {
      very_fast: 1.4, fast: 1.2, medium: 1.0, slow: 0.8, very_slow: 0.6
    };

    // Calculate carb equivalents (shared calculation)
    const carbEquivalents = calculateCarbEquivalents(nutrition, patientConstants);

    // Get adjustment factors
    const absorptionFactor = absorptionModifiers[absorptionType] || 1.0;
    const mealTimingFactor = patientConstants.meal_timing_factors?.[mealType] || 1.0;

    // Calculate base insulin using unified formula - MATCHES INSULIN CALCULATION
    const baseInsulin = carbEquivalents.totalCarbEquiv / patientConstants.insulin_to_carb_ratio;
    const adjustedInsulin = baseInsulin * absorptionFactor * mealTimingFactor;

    // Calculate peak BG impact using unified formula - MATCHES VISUALIZATION
    const carbToBgFactor = patientConstants.carb_to_bg_factor || 4.0;
    const peakBgImpact = carbEquivalents.totalCarbEquiv * carbToBgFactor * absorptionFactor;

    // Create calculation summary (matches format used in meal-only records)
    const calculationSummary = {
      base_insulin: baseInsulin,
      adjustment_factors: {
        absorption_rate: absorptionFactor,
        meal_timing: mealTimingFactor
      },
      meal_only_suggested_insulin: adjustedInsulin
    };

    // If we don't need the time curve, return just the calculations
    if (!includeTimeCurve) {
      return {
        carbEquivalents,
        baseInsulin,
        adjustedInsulin,
        peakBgImpact,
        calculationSummary
      };
    }

    // Generate time curve for visualization (existing functionality from calculateMealEffect)
    const timeCurve = generateMealImpactCurve(
      carbEquivalents.totalCarbEquiv,
      absorptionType,
      mealData.timestamp || currentTime.getTime(),
      durationHours,
      timeInterval,
      carbToBgFactor,
      absorptionFactor,
      patientConstants
    );

    return {
      carbEquivalents,
      baseInsulin,
      adjustedInsulin,
      peakBgImpact,
      calculationSummary,
      timeCurve
    };
  } catch (error) {
    console.error("Error in unified meal impact calculation:", error);
    return {
      carbEquivalents: { totalCarbEquiv: 0 },
      baseInsulin: 0,
      peakImpact: 0,
      bgImpact: 0,
      timeCurve: [],
      error: error.message
    };
  }
}

/**
 * Generate meal impact curve over time - Used by visualization system
 *
 * @param {number} totalCarbEquiv - Total carbohydrate equivalents
 * @param {string} absorptionType - Absorption type (very_fast, fast, medium, slow, very_slow)
 * @param {number} startTimestamp - Start time of the meal
 * @param {number} durationHours - Duration to project in hours
 * @param {number} intervalMinutes - Time interval between data points in minutes
 * @param {number} carbToBgFactor - Factor to convert carb units to blood glucose impact
 * @param {number} absorptionFactor - Absorption rate modifier
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Array} Array of time points with impact values
 */
function generateMealImpactCurve(
  totalCarbEquiv,
  absorptionType = 'medium',
  startTimestamp = Date.now(),
  durationHours = 6,
  intervalMinutes = 5,
  carbToBgFactor = 4.0,
  absorptionFactor = 1.0,
  patientConstants = {}
) {
  // Calculate peak and duration based on absorption type
  const peakHour = absorptionType === 'fast' ? 1.0 :
                  absorptionType === 'slow' ? 2.0 : 1.5;
  const duration = Math.min(durationHours, 10);

  const results = [];

  // Generate points at specified intervals
  for (let minute = 0; minute <= durationHours * 60; minute += intervalMinutes) {
    const hoursSinceMeal = minute / 60;
    let impactValue = 0;

    // Calculate impact using the physiological model
    if (hoursSinceMeal <= peakHour) {
      // Rising phase with smoother curve
      const normalizedTime = hoursSinceMeal / peakHour;
      impactValue = totalCarbEquiv * (Math.pow(normalizedTime, 1.1)) * Math.exp(1 - normalizedTime);
    } else if (hoursSinceMeal <= duration) {
      // Falling phase with gradual decay
      const normalizedTime = hoursSinceMeal - peakHour;
      const decayRate = (0.7 + 0.3) / (duration - peakHour);
      impactValue = totalCarbEquiv * 0.95 * Math.exp(-normalizedTime * decayRate);
    }

    // Apply absorption factor
    impactValue *= absorptionFactor;

    // Calculate BG impact in mg/dL
    const bgImpact = impactValue * carbToBgFactor;

    // Timestamp for this point
    const timestamp = startTimestamp + (minute * 60 * 1000);

    results.push({
      timestamp,
      hoursSinceMeal,
      impactValue: Math.max(0, impactValue),
      bgImpact: Math.max(0, bgImpact)
    });
  }

  return results;
}

/****** ORIGINAL MEAL EFFECT CALCULATIONS - NOW USING UNIFIED MODEL ******/

/**
 * Calculate the effect of a meal on blood glucose levels over time
 * Now enhanced to use the unified meal impact model
 *
 * @param {Object} meal - The meal data object
 * @param {Object} patientConstants - Patient-specific constants
 * @param {number} effectDurationHours - Duration of effect in hours
 * @param {Object} TimeManager - TimeManager utility for time calculations
 * @returns {Array} Array of effect points over time
 */
export function calculateMealEffect(meal, patientConstants, effectDurationHours = 6, TimeManager) {
  if (!meal || !patientConstants) {
    console.log("Missing meal or patientConstants data");
    return [];
  }

  try {
    // Use the unified model with time curve option enabled
    const unifiedResult = calculateUnifiedMealImpact(meal, patientConstants, {
      includeTimeCurve: true,
      durationHours: effectDurationHours,
      currentTime: new Date()
    });

    // Return the time curve for backward compatibility
    return unifiedResult.timeCurve;
  } catch (error) {
    console.error("Error calculating meal effect:", error);
    return [];
  }
}

/****** DATA VISUALIZATION AND TIMELINE GENERATION ******/

/**
 * Generate combined timeline data showing meal impacts on blood glucose
 * Now uses the unified meal impact model for consistency
 *
 * @param {Array} mealData - Array of meal objects
 * @param {Array} bloodGlucoseData - Array of blood glucose readings
 * @param {Object} options - Configuration options
 * @param {Object} contextFunctions - Blood sugar context functions
 * @param {Object} TimeManager - TimeManager utility
 * @returns {Array} Combined timeline data with meal effects
 */
export function generateMealTimelineData(
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
      const futureTime = TimeManager.getFutureProjectionTime
        ? TimeManager.getFutureProjectionTime(futureHours)
        : new Date().getTime() + (futureHours * 60 * 60 * 1000);
      maxTime = Math.max(maxTime, futureTime);
    }

    console.log(`Timeline range: ${new Date(minTime)} to ${new Date(maxTime)}`);

    // Get filtered blood sugar data
    let contextBloodSugarData = getFilteredData(bloodGlucoseData);
    console.log("Filtered blood sugar readings from context:", contextBloodSugarData.length);

    // Process meal effects with unified model
    console.log("Processing meal effects using unified model for", mealData.length, "meals");
    const mealEffects = mealData
      .filter(meal => meal && !isNaN(meal.timestamp) && meal.timestamp > 0)
      .map(meal => {
        try {
          // Calculate unified impact for this meal
          const unifiedImpact = calculateUnifiedMealImpact(meal, patientConstants, {
            includeTimeCurve: true,
            durationHours: effectDurationHours,
            currentTime: new Date()
          });

          return {
            meal,
            effects: unifiedImpact.timeCurve,
            unifiedImpact
          };
        } catch (error) {
          console.error("Error processing meal effect:", error, meal);
          return {
            meal,
            effects: [],
            unifiedImpact: null
          };
        }
      });

    // Create a timeline using 15-minute intervals
    const timelineData = [];
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds
    let currentTime = minTime;

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
      mealEffects.forEach(({ meal, effects, unifiedImpact }) => {
        if (!Array.isArray(effects)) {
          console.warn(`Invalid effects array for meal:`, meal);
          return;
        }

        // Find effect at this time point
        const effect = effects.find(e => Math.abs(e.timestamp - currentTime) < interval / 2);
        if (effect && !isNaN(effect.bgImpact) && effect.bgImpact > 0) {
          const mealId = meal.id;
          if (mealId) {
            timePoint.mealEffects[mealId] = effect.bgImpact;
            timePoint[`mealEffect.${mealId}`] = effect.bgImpact;

            // Store unified calculation data in time point for tooltips
            if (unifiedImpact?.calculationSummary) {
              timePoint[`mealInsulin.${mealId}`] = unifiedImpact.calculationSummary.meal_only_suggested_insulin;
            }

            // Track total effect - now consistently uses bgImpact for conversion
            timePoint.totalMealEffect += effect.bgImpact;
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
        // Store the raw meal impact directly (no need to convert anymore)
        timePoint.mealImpactMgdL = timePoint.totalMealEffect;

        // FIRST CALCULATION: Impact on estimated blood sugar
        if (!timePoint.isActualReading) {
          // Ensure we maintain the original estimated blood sugar
          timePoint.estimatedBloodSugar = timePoint.bloodSugar;

          // Apply meal effect to blood sugar value
          timePoint.bloodSugar = Math.max(70, timePoint.estimatedBloodSugar + timePoint.mealImpactMgdL);
          timePoint.affectedByMeal = true;
        }

        // SECOND CALCULATION: Calculate hypothetical impact on target blood sugar
        timePoint.targetWithMealEffect = Math.max(70, targetGlucose + timePoint.mealImpactMgdL);

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
export function prepareTimelineData(timelineData, targetGlucose) {
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
export function prepareChartData(data, options = {}) {
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
export function calculateInsulinEffect(insulinDose, patientConstants, duration = 6) {
  // This is a placeholder - actual implementation is in insulinUtils.js
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
export function calculateNutritionDistribution(meals, patientConstants) {
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

  // Calculate total carb equivalents using our unified function
  const totalCarbEquiv = meals.reduce((sum, meal) => {
    if (!meal.nutrition) return sum;
    const carbEquivResult = calculateCarbEquivalents(meal.nutrition, patientConstants);
    return sum + carbEquivResult.totalCarbEquiv;
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
export function calculateMealStatistics(meals, combinedData) {
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
export function applyDatePreset(days) {
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
export function generateCombinedEffectsTimeline(
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