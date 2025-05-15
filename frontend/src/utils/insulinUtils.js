/**
 * insulinUtils.js - Comprehensive insulin utility functions
 *
 * This utility provides functions for insulin type management, recommendation,
 * effect calculations, and visualization of insulin activity on blood glucose levels.
 */

import { SHARED_CONSTANTS } from '../constants/shared_constants';

// =====================================
// INSULIN TYPE MANAGEMENT
// =====================================

// Get all available insulin types (excluding non-insulin medications)
export const getAvailableInsulinTypes = () => {
  const medicationFactors = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors;

  // Filter to include only insulin types (those with type containing "acting")
  return Object.entries(medicationFactors)
    .filter(([key, value]) => value.type && value.type.includes('acting'))
    .map(([key, value]) => ({
      id: key,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      ...value,
      displayName: `${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${value.type.split('_')[0]} acting)`
    }))
    .sort((a, b) => {
      // Sort by action type: rapid, short, intermediate, long, mixed
      const typeOrder = {
        'rapid': 1,
        'short': 2,
        'intermediate': 3,
        'long': 4,
        'mixed': 5
      };

      const typeA = a.type.split('_')[0];
      const typeB = b.type.split('_')[0];

      return typeOrder[typeA] - typeOrder[typeB];
    });
};

// Format insulin name for display
export const formatInsulinName = (insulinType) => {
  if (!insulinType) return '';

  const insulin = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors[insulinType];
  if (!insulin) return insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return `${insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${insulin.type.split('_')[0]} acting)`;
};

// Group insulin types by action profile
export const getInsulinTypesByCategory = () => {
  const insulinTypes = getAvailableInsulinTypes();

  return insulinTypes.reduce((acc, insulin) => {
    const category = insulin.type.split('_')[0];
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(insulin);
    return acc;
  }, {});
};

// =====================================
// INSULIN RECOMMENDATION
// =====================================

// Recommend insulin type based on meal context
export const recommendInsulinType = (mealType, foods, currentTime) => {
  // Get hour of day (0-23)
  const hour = new Date(currentTime || Date.now()).getHours();

  // Default to regular insulin
  let recommended = 'regular_insulin';

  // Check if any food has very fast absorption
  const hasFastFood = foods.some(food =>
    food.details.absorption_type === 'very_fast' || food.details.absorption_type === 'fast'
  );

  // Check if any food has very slow absorption
  const hasSlowFood = foods.some(food =>
    food.details.absorption_type === 'very_slow' || food.details.absorption_type === 'slow'
  );

  // Morning meals often need rapid insulin due to dawn phenomenon
  if (mealType === 'breakfast' || (hour >= 6 && hour <= 10)) {
    if (hasFastFood) {
      return 'insulin_aspart'; // Fast food in morning needs very rapid insulin
    } else {
      return 'insulin_lispro'; // Regular breakfast
    }
  }

  // For slower absorbing dinner meals, regular insulin may be better
  if (mealType === 'dinner' && hasSlowFood) {
    return 'regular_insulin';
  }

  // For most meals with fast carbs, rapid insulins are preferred
  if (hasFastFood) {
    return 'insulin_lispro';
  }

  // For slow absorbing foods at any time
  if (hasSlowFood) {
    return 'regular_insulin'; // Longer action profile matches slower absorption
  }

  // Default recommendation based on meal type
  const mealTypeRecommendations = {
    'breakfast': 'insulin_lispro',
    'lunch': 'insulin_aspart',
    'dinner': 'insulin_glulisine',
    'snack': 'insulin_aspart'
  };

  return mealTypeRecommendations[mealType] || recommended;
};

// =====================================
// INSULIN EFFECT CALCULATIONS
// =====================================

/**
 * Get insulin parameters for a specific insulin type
 *
 * @param {string} insulinType - The type of insulin
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Object} Insulin parameters
 */
export const getInsulinParameters = (insulinType, patientConstants) => {
  // Default parameters if not found in patient constants
  const defaultParams = {
    onset_hours: 0.5,
    peak_hours: 2.0,
    duration_hours: 4.0,
    type: 'rapid_acting'
  };

  // Try to get from patient constants
  const medicationFactors = patientConstants?.medication_factors || {};
  return medicationFactors[insulinType] || defaultParams;
};

/**
 * Standardized insulin activity model shared across application components
 * @param {number} hoursSinceDose - Hours since insulin administration
 * @param {Object} params - Insulin pharmacokinetic parameters
 * @returns {number} - Activity percentage (0-100)
 */
export const calculateInsulinActivityPercentage = (hoursSinceDose, params) => {
  // Extract parameters with defaults for safety
  const onset_hours = params?.onset_hours || 0.5;
  const peak_hours = params?.peak_hours || 2.0;
  const duration_hours = params?.duration_hours || 4.0;

  // Return 0 if outside valid time range
  if (hoursSinceDose < 0 || hoursSinceDose > duration_hours) {
    return 0;
  }

  // For peakless insulins like Glargine
  if (params?.type === 'long_acting' && params?.is_peakless) {
    // Gradual onset followed by flat effect
    if (hoursSinceDose < onset_hours) {
      return (hoursSinceDose / onset_hours) * 80; // Ramp up to 80% effect
    }
    // Flat effect with slight decay at end of duration
    const timeLeft = duration_hours - hoursSinceDose;
    const endDecayHours = Math.min(6, duration_hours * 0.15); // Last 15% of duration or 6 hours

    if (timeLeft <= endDecayHours) {
      return 80 * (timeLeft / endDecayHours);
    }
    return 80; // Constant 80% effect for most of duration
  }

  // Standard insulin with onset, peak, and decay phases
  // Onset phase (0% to 30%)
  if (hoursSinceDose < onset_hours) {
    return 30 * (hoursSinceDose / onset_hours);
  }

  // Peak phase (30% to 100%)
  if (hoursSinceDose < peak_hours) {
    return 30 + (70 * (hoursSinceDose - onset_hours) / (peak_hours - onset_hours));
  }

  // Decay phase (100% to 0%)
  return 100 * ((duration_hours - hoursSinceDose) / (duration_hours - peak_hours));
};

/**
 * Calculate the effect of an insulin dose on blood glucose over time
 *
 * @param {Object} dose - The insulin dose data object
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Array} Array of effect points over time
 */
export const calculateInsulinEffect = (dose, patientConstants) => {
  if (!dose || !patientConstants) {
    return [];
  }

  try {
    // Extract insulin parameters
    const insulinType = dose.medication || dose.insulinType;
    const doseAmount = dose.dose || 0;

    if (doseAmount <= 0) {
      return [];
    }

    // Get insulin parameters from patient constants
    const insulinParams = getInsulinParameters(insulinType, patientConstants);
    const {
      onset_hours = 0.5,
      peak_hours = 2.0,
      duration_hours = 4.0
    } = insulinParams;

    // Time of administration
    const administrationTime = dose.administrationTime || dose.taken_at || dose.timestamp;
    if (!administrationTime) {
      console.warn("Missing administration time for dose:", dose);
      return [];
    }

    // Generate the effect curve
    const results = [];
    const durationMinutes = duration_hours * 60;

    // Generate points at 5-minute intervals for smoother curves
    for (let minute = 0; minute <= durationMinutes; minute += 5) {
      const hoursSinceDose = minute / 60;

      // Calculate activity using standardized model
      const activityPercent = calculateInsulinActivityPercentage(hoursSinceDose, insulinParams);

      // Calculate active insulin units
      const activeUnits = (doseAmount * activityPercent) / 100;

      // Timestamp for this point
      const timestamp = typeof administrationTime === 'number'
        ? administrationTime + (minute * 60 * 1000)
        : new Date(administrationTime).getTime() + (minute * 60 * 1000);

      results.push({
        timestamp,
        hoursSinceDose,
        activityPercent,
        activeUnits,
        insulinType
      });
    }

    return results;
  } catch (error) {
    console.error("Error calculating insulin effect:", error);
    return [];
  }
};

/**
 * Calculate blood glucose impact from active insulin
 *
 * @param {number} activeInsulin - Active insulin in units
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {number} Blood glucose impact in mg/dL
 */
export const calculateBgImpactFromInsulin = (activeInsulin, patientConstants) => {
  if (activeInsulin <= 0) return 0;

  // Get insulin sensitivity factor (ISF) - how much 1 unit lowers BG
  const isf = patientConstants?.correction_factor || 50; // Default: 1 unit lowers BG by 50 mg/dL

  // Calculate BG impact (negative value since insulin lowers glucose)
  return -(activeInsulin * isf);
};

/**
 * Calculate bidirectional value for bar chart visualization
 *
 * @param {number} value - The value to convert
 * @returns {number} Negative value for downward visualization
 */
export const getBidirectionalValue = (value) => {
  if (!value || isNaN(value) || value <= 0) return null;
  return -Math.abs(value); // Make insulin doses negative for downward bars
};

/**
 * Calculate combined effects of multiple insulin doses at a specific time
 *
 * @param {Array} insulinDoses - Array of insulin dose objects
 * @param {number} targetTime - Timestamp to calculate effect for
 * @param {Object} patientConstants - Patient-specific constants
 * @returns {Object} Combined insulin effect information
 */
export const calculateCombinedInsulinEffect = (insulinDoses, targetTime, patientConstants) => {
  if (!insulinDoses || insulinDoses.length === 0) {
    return {
      totalActiveInsulin: 0,
      insulinContributions: [],
      bgImpact: 0
    };
  }

  // Calculate effect from each dose
  const contributions = [];
  let totalActiveInsulin = 0;

  insulinDoses.forEach(dose => {
    const doseTime = dose.administrationTime || dose.taken_at || dose.timestamp;
    if (!doseTime) return;

    // Convert to timestamp if not already
    const doseTimestamp = typeof doseTime === 'number' ? doseTime : new Date(doseTime).getTime();

    // Calculate hours since dose
    const hoursSinceDose = (targetTime - doseTimestamp) / (3600 * 1000);

    // Skip if dose is in future or too old
    if (hoursSinceDose < 0 || hoursSinceDose > 24) {
      return;
    }

    // Get insulin parameters - THIS IS WHERE WE'RE USING THE FUNCTION
    const insulinType = dose.medication || dose.insulinType;
    const insulinParams = getInsulinParameters(insulinType, patientConstants);

    // Log the actual parameters being used for verification
    console.log(`Using ${insulinType} parameters: onset=${insulinParams.onset_hours}h, peak=${insulinParams.peak_hours}h, duration=${insulinParams.duration_hours}h`);

    // Skip if outside duration - Now using the insulin-specific duration
    if (hoursSinceDose > insulinParams.duration_hours) {
      return;
    }

    // Calculate activity percent using standardized function
    const activityPercent = calculateInsulinActivityPercentage(hoursSinceDose, insulinParams);

    // Calculate active insulin units
    const doseAmount = dose.dose || 0;
    const activeUnits = (doseAmount * activityPercent) / 100;

    // Add to total
    totalActiveInsulin += activeUnits;

    // Track individual contribution
    contributions.push({
      dose: doseAmount,
      activeUnits,
      activityPercent,
      insulinType,
      hoursSinceDose
    });
  });

  // Calculate blood glucose impact using patient-specific correction factor
  const correctionFactor = patientConstants?.correction_factor || 50;
  const bgImpact = -1 * totalActiveInsulin * correctionFactor;

  return {
    totalActiveInsulin,
    insulinContributions: contributions,
    bgImpact
  };
};

// =====================================
// MEDICATION AND HEALTH EFFECT CALCULATIONS - MIGRATED FROM TimeEffect
// =====================================

/**
 * Calculate medication effect based on time since last dose
 * @param {string} medication - Medication identifier
 * @param {object} medData - Medication data with onset, peak, duration
 * @param {object} schedule - Medication schedule with dailyTimes
 * @param {Date} currentTime - Current time to calculate effect for
 * @returns {object} Effect data including factor and status
 */
export const calculateMedicationEffect = (medication, medData, schedule, currentTime = new Date()) => {
  if (!medData) return { status: 'Unknown', factor: 1.0 };

  if (medData.duration_based && schedule) {
    const startDate = new Date(schedule.startDate);
    const endDate = new Date(schedule.endDate);

    // Check schedule validity
    if (currentTime < startDate) {
      return {
        status: 'Scheduled to start',
        startDate: startDate.toLocaleDateString(),
        factor: 1.0
      };
    }

    if (currentTime > endDate) {
      return {
        status: 'Schedule ended',
        endDate: endDate.toLocaleDateString(),
        factor: 1.0
      };
    }

    // Find last dose time
    const lastDoseTime = findLastDoseTime(schedule.dailyTimes, currentTime);
    const hoursSinceLastDose = (currentTime - lastDoseTime) / (1000 * 60 * 60);

    // Calculate effect based on medication phase
    if (hoursSinceLastDose < medData.onset_hours) {
      return {
        status: 'Ramping up',
        factor: 1.0 + ((medData.factor - 1.0) * (hoursSinceLastDose / medData.onset_hours)),
        lastDose: lastDoseTime.toLocaleString(),
        hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
      };
    } else if (hoursSinceLastDose < medData.peak_hours) {
      return {
        status: 'Peak effect',
        factor: medData.factor,
        lastDose: lastDoseTime.toLocaleString(),
        hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
      };
    } else if (hoursSinceLastDose < medData.duration_hours) {
      const remainingEffect = (medData.duration_hours - hoursSinceLastDose) /
                           (medData.duration_hours - medData.peak_hours);
      return {
        status: 'Tapering',
        factor: 1.0 + ((medData.factor - 1.0) * remainingEffect),
        lastDose: lastDoseTime.toLocaleString(),
        hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
      };
    }

    return {
      status: 'No current effect',
      factor: 1.0,
      lastDose: lastDoseTime.toLocaleString(),
      hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
    };
  }

  // Non-duration based medications
  return {
    status: 'Constant effect',
    factor: medData.factor || 1.0
  };
};

/**
 * Find the last dose time based on daily schedule
 * @param {Array} dailyTimes - List of daily time strings (HH:MM format)
 * @param {Date} currentTime - Current reference time
 * @returns {Date} Last dose time
 */
export const findLastDoseTime = (dailyTimes, currentTime = new Date()) => {
  // Convert daily times to Date objects for the current or previous day
  const doseTimes = dailyTimes.map(time => {
    const [hours, minutes] = time.split(':');
    const doseTime = new Date(currentTime);
    doseTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

    // If this time is in the future today, use yesterday's time
    if (doseTime > currentTime) {
      doseTime.setDate(doseTime.getDate() - 1);
    }

    return doseTime;
  });

  // Find the most recent dose time
  if (doseTimes.length === 0) {
    return new Date(currentTime.getTime() - 24 * 60 * 60 * 1000); // Default to 24h ago if no times
  }

  return doseTimes.reduce((latest, current) => {
    return (current > latest && current <= currentTime) ? current : latest;
  }, new Date(0));
};

/**
 * Calculate insulin effect on blood glucose at a specific time
 * @param {Object} insulin - Insulin dose information
 * @param {number} timestamp - Target timestamp to calculate effect
 * @param {Object} patientConstants - Patient constants
 * @returns {Object} - Effect information including BG impact
 */
export const calculateInsulinBgEffect = (insulin, timestamp, patientConstants) => {
  if (!insulin || !timestamp || !patientConstants) {
    return { activeInsulin: 0, bgImpact: 0, activityPercent: 0 };
  }

  // Get administration time
  const doseTime = insulin.administrationTime || insulin.taken_at || insulin.timestamp;
  if (!doseTime) return { activeInsulin: 0, bgImpact: 0, activityPercent: 0 };

  // Convert to timestamp if needed
  const doseTimestamp = typeof doseTime === 'number' ? doseTime : new Date(doseTime).getTime();

  // Calculate hours since dose
  const hoursSinceDose = (timestamp - doseTimestamp) / (3600 * 1000);

  // Get insulin parameters
  const insulinType = insulin.medication || insulin.insulinType;
  const insulinParams = patientConstants.medication_factors?.[insulinType] || {
    onset_hours: 0.5,
    peak_hours: 2.0,
    duration_hours: 4.0
  };

  // Calculate activity percentage
  const activityPercent = calculateInsulinActivityPercentage(hoursSinceDose, insulinParams);

  // Calculate active insulin
  const doseAmount = insulin.dose || 0;
  const activeInsulin = (doseAmount * activityPercent) / 100;

  // Calculate BG impact using correction factor
  const correctionFactor = patientConstants.correction_factor || 50;
  const bgImpact = -1 * activeInsulin * correctionFactor;

  return {
    activeInsulin,
    bgImpact,
    activityPercent,
    insulinType,
    hoursSinceDose
  };
};

/**
 * Calculate time of day factor for insulin needs
 * @param {object} timeOfDayFactors - Factors by time period
 * @param {Date} currentTime - Time to calculate factor for
 * @returns {number} Time of day factor
 */
export const getTimeOfDayFactor = (timeOfDayFactors, currentTime = new Date()) => {
  if (!timeOfDayFactors) return 1.0;

  const hour = currentTime.getHours();

  // Check each time period
  for (const [, periodData] of Object.entries(timeOfDayFactors)) {
    const [startHour, endHour] = periodData.hours;
    if (hour >= startHour && hour < endHour) {
      return periodData.factor;
    }
  }

  // Default to daytime
  return timeOfDayFactors.daytime?.factor || 1.0;
};

// =====================================
// BLOOD GLUCOSE IMPACT CALCULATIONS - MIGRATED FROM TimeEffect
// =====================================

/**
 * Calculate Blood Glucose Impact (BGImpact) for a meal
 * @param {object} meal - Meal data with carbs, protein, fat
 * @param {object} patientFactors - Patient-specific factors
 * @returns {object} BGImpact data with value and components
 */
export const calculateBGImpact = (meal, patientFactors) => {
  if (!meal || !patientFactors) {
    return { bgImpactValue: 0, components: {}, active: false };
  }

  const {
    carbs = 0,
    protein = 0,
    fat = 0,
    fiber = 0,
    glycemicIndex = null,
    absorptionType = 'medium'
  } = meal.nutrition || {};

  // Get patient-specific factors
  const {
    proteinFactor = 0.5,
    fatFactor = 0.2,
    fiberFactor = 0.1,
    absorptionFactors = { slow: 0.7, medium: 1.0, fast: 1.3 }
  } = patientFactors;

  // Calculate absorption factor
  const absorptionFactor = absorptionFactors[absorptionType] || 1.0;

  // Base impact calculation
  const carbsContribution = carbs;
  const proteinContribution = protein * proteinFactor;
  const fatContribution = fat * fatFactor;
  const fiberReduction = fiber * fiberFactor * -1; // Fiber reduces impact

  // Calculate base BGImpact
  let baseImpact = carbsContribution + proteinContribution + fatContribution + fiberReduction;
  baseImpact = Math.max(0, baseImpact); // Ensure impact isn't negative

  // Apply absorption factor
  let adjustedImpact = baseImpact * absorptionFactor;

  // Apply glycemic index adjustment if available
  if (glycemicIndex !== null && glycemicIndex !== undefined) {
    // Normalize glycemic index (0-100 scale)
    // Higher GI means faster & higher impact
    const giAdjustment = glycemicIndex / 55; // Medium GI is around 55
    adjustedImpact = adjustedImpact * giAdjustment;
  }

  // Calculate meal timing effect
  const mealTime = meal.timestamp ? new Date(meal.timestamp) : new Date();
  const hour = mealTime.getHours();
  let timeOfDayFactor = 1.0;

  // Apply dawn phenomenon effect (higher impact in morning)
  if (hour >= 5 && hour < 10) {
    timeOfDayFactor = patientFactors.dawnPhenomenonFactor || 1.2;
  }

  // Apply final time of day adjustment
  const finalImpact = adjustedImpact * timeOfDayFactor;

  // Round to 1 decimal place
  const roundedImpact = Math.round(finalImpact * 10) / 10;

  return {
    bgImpactValue: roundedImpact,
    components: {
      carbs: carbsContribution,
      protein: proteinContribution,
      fat: fatContribution,
      fiber: fiberReduction
    },
    factors: {
      absorption: absorptionFactor,
      glycemicIndex: glycemicIndex ? (glycemicIndex / 55) : 1.0,
      timeOfDay: timeOfDayFactor
    },
    baseImpact: Math.round(baseImpact * 10) / 10
  };
};

/**
 * Calculate Blood Glucose Impact curve over time
 * @param {object} meal - Meal data with timestamp and nutrition
 * @param {object} patientFactors - Patient-specific factors
 * @param {number} hoursToProject - How many hours to project (default 6)
 * @param {number} intervalMinutes - Data point interval in minutes (default 15)
 * @returns {Array} Array of time points with projected BG impact
 */
export const calculateBGImpactCurve = (meal, patientFactors, hoursToProject = 6, intervalMinutes = 15) => {
  if (!meal?.timestamp || !meal?.nutrition) {
    return [];
  }

  // Get the BGImpact total value
  const bgImpact = calculateBGImpact(meal, patientFactors);

  // Get key parameters to model the curve
  const { carbs = 0, protein = 0, fat = 0 } = meal.nutrition;
  const absorptionType = meal.nutrition.absorption_type || 'medium';
  const absorptionFactor = patientFactors?.absorptionFactors?.[absorptionType] || 1.0;

  // Calculate meal curve shape parameters
  // Higher fat/protein extends duration, higher absorption factor shortens it
  const fatProteinRatio = (fat + protein) / Math.max(1, carbs + protein + fat);
  const baseDuration = 3 + (fatProteinRatio * 3); // 3-6 hours depending on composition
  const duration = baseDuration / absorptionFactor; // Adjust for absorption rate

  // Calculate peak time (carb-heavy meals peak faster)
  const carbRatio = carbs / Math.max(1, carbs + protein + fat);
  const basePeakHours = 0.5 + ((1 - carbRatio) * 1.0); // 0.5-1.5 hours depending on carb content
  const peakHours = basePeakHours / absorptionFactor; // Adjust for absorption

  const mealTime = new Date(meal.timestamp);
  const dataPoints = [];

  // Generate data points for the curve
  for (let i = 0; i <= hoursToProject * (60 / intervalMinutes); i++) {
    const minutesSinceMeal = i * intervalMinutes;
    const hoursSinceMeal = minutesSinceMeal / 60;

    // Calculate time point
    const timePoint = new Date(mealTime.getTime() + minutesSinceMeal * 60 * 1000);

    // Calculate impact intensity at this time
    let intensity = 0;

    if (hoursSinceMeal < peakHours) {
      // Rising phase - use quadratic curve for faster initial rise
      intensity = Math.pow(hoursSinceMeal / peakHours, 1.8);
    } else if (hoursSinceMeal < duration) {
      // Falling phase - protein/fat extend the tail
      let fallRatio = (hoursSinceMeal - peakHours) / (duration - peakHours);

      // Apply digestion model based on meal composition
      if (fatProteinRatio > 0.5) {
        // High protein/fat meals have slower decay with a longer tail
        intensity = 1.0 - Math.pow(fallRatio, 0.7);
      } else {
        // Carb-heavy meals decline more rapidly
        intensity = 1.0 - Math.pow(fallRatio, 1.2);
      }
    } else {
      // After full duration
      intensity = 0;
    }

    // Scale intensity by total impact value
    const impactValue = intensity * bgImpact.bgImpactValue;

    // Format time if TimeManager is available
    let formattedTime = timePoint.toLocaleTimeString();
    if (typeof window !== 'undefined' && window.TimeManager && window.TimeManager.formatDate) {
      formattedTime = window.TimeManager.formatDate(timePoint, window.TimeManager.formats.CHART_TICKS_SHORT);
    }

    dataPoints.push({
      time: timePoint,
      hoursSinceMeal,
      intensity,
      impactValue: Math.round(impactValue * 10) / 10,
      timestamp: timePoint.getTime(),
      formattedTime
    });

    // Stop if we've reached zero impact after the duration
    if (hoursSinceMeal > duration * 1.2 && intensity === 0) {
      break;
    }
  }

  return dataPoints;
};

// =====================================
// VISUALIZATION & TIMELINE FUNCTIONS
// =====================================

/**
 * Generate timeline data for insulin doses
 *
 * @param {Array} insulinDoses - Array of insulin doses
 * @param {Object} options - Configuration options
 * @param {Object} TimeManager - Time management utility
 * @returns {Array} Timeline data with insulin effects
 */
export const generateInsulinTimelineData = (insulinDoses, options, TimeManager) => {
  const {
    timeScale = { start: 0, end: 0 },
    patientConstants = {}
  } = options;

  if (!insulinDoses || insulinDoses.length === 0) {
    return [];
  }

  try {
    // Generate timeline with 15-minute intervals
    const timeline = [];
    const interval = 15 * 60 * 1000; // 15 minutes

    for (let time = timeScale.start; time <= timeScale.end; time += interval) {
      const timePoint = {
        timestamp: time,
        formattedTime: TimeManager.formatDate(
          new Date(time),
          TimeManager.formats.DATETIME_DISPLAY || 'YYYY-MM-DD HH:mm:ss'
        ),
        insulinDoses: {},
        insulinBars: {},
        activeInsulin: 0,
        bgImpact: 0
      };

      // Check if any insulin dose was administered at this time point (±7.5 min)
      insulinDoses.forEach(dose => {
        const doseTime = dose.administrationTime || dose.taken_at || dose.timestamp;
        if (!doseTime) return;

        // Convert to timestamp if not already
        const doseTimestamp = typeof doseTime === 'number' ? doseTime : new Date(doseTime).getTime();

        // If dose is within this interval window
        if (Math.abs(doseTimestamp - time) <= interval / 2) {
          const insulinType = dose.medication || dose.insulinType;
          const doseAmount = dose.dose || 0;

          // Record dose
          timePoint.insulinDoses[insulinType] = (timePoint.insulinDoses[insulinType] || 0) + doseAmount;

          // Add bidirectional value for bar chart
          timePoint.insulinBars[insulinType] = getBidirectionalValue(timePoint.insulinDoses[insulinType]);

          // Add dose details
          if (!timePoint.doseDetails) timePoint.doseDetails = [];
          timePoint.doseDetails.push({
            insulinType,
            doseAmount,
            timestamp: doseTimestamp
          });
        }
      });

      // Calculate combined insulin effect at this time
      const insulinEffect = calculateCombinedInsulinEffect(insulinDoses, time, patientConstants);
      timePoint.activeInsulin = insulinEffect.totalActiveInsulin;
      timePoint.bgImpact = insulinEffect.bgImpact;
      timePoint.insulinContributions = insulinEffect.insulinContributions;

      // Add bidirectional value for active insulin visualization
      timePoint.activeInsulinBidirectional = getBidirectionalValue(timePoint.activeInsulin);

      timeline.push(timePoint);
    }

    return timeline;
  } catch (error) {
    console.error("Error generating insulin timeline data:", error);
    return [];
  }
};

export default {
  getAvailableInsulinTypes,
  formatInsulinName,
  getInsulinTypesByCategory,
  recommendInsulinType,
  getInsulinParameters,
  calculateInsulinActivityPercentage,
  calculateInsulinEffect,
  calculateBgImpactFromInsulin,
  getBidirectionalValue,
  calculateCombinedInsulinEffect,
  calculateMedicationEffect,
  findLastDoseTime,
  calculateInsulinBgEffect,
  getTimeOfDayFactor,
  calculateBGImpact,
  calculateBGImpactCurve,
  generateInsulinTimelineData
};