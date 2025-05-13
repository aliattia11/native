/**
 * InsulinEffect.js - Utility functions for insulin effect calculations
 * 
 * This utility provides functions to calculate the effects of insulin on blood glucose levels,
 * supporting the visualization of insulin activity and its interaction with meal effects.
 */

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
      let activityPercent = 0;

      // Calculate activity using a physiological model
      if (hoursSinceDose < onset_hours) {
        // Linear ramp up to onset
        activityPercent = (hoursSinceDose / onset_hours) * 30; // 0-30%
      } else if (hoursSinceDose < peak_hours) {
        // Rise to peak
        activityPercent = 30 + ((hoursSinceDose - onset_hours) /
                               (peak_hours - onset_hours)) * 70; // 30-100%
      } else if (hoursSinceDose <= duration_hours) {
        // Decay from peak
        activityPercent = 100 * ((duration_hours - hoursSinceDose) /
                                (duration_hours - peak_hours)); // 100-0%
      }

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

    // Get insulin parameters
    const insulinParams = getInsulinParameters(dose.medication || dose.insulinType, patientConstants);
    const { onset_hours, peak_hours, duration_hours } = insulinParams;

    // Skip if outside duration
    if (hoursSinceDose > duration_hours) {
      return;
    }

    // Calculate activity percent
    let activityPercent = 0;

    if (hoursSinceDose < onset_hours) {
      // Linear ramp up to onset
      activityPercent = (hoursSinceDose / onset_hours) * 30; // 0-30%
    } else if (hoursSinceDose < peak_hours) {
      // Rise to peak
      activityPercent = 30 + ((hoursSinceDose - onset_hours) /
                             (peak_hours - onset_hours)) * 70; // 30-100%
    } else {
      // Decay from peak
      activityPercent = 100 * ((duration_hours - hoursSinceDose) /
                              (duration_hours - peak_hours)); // 100-0%
    }

    // Ensure it's between 0-100%
    activityPercent = Math.max(0, Math.min(100, activityPercent));

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
      insulinType: dose.medication || dose.insulinType,
      hoursSinceDose
    });
  });

  // Calculate blood glucose impact
  const bgImpact = calculateBgImpactFromInsulin(totalActiveInsulin, patientConstants);

  return {
    totalActiveInsulin,
    insulinContributions: contributions,
    bgImpact
  };
};

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
          TimeManager.formats.DATETIME_DISPLAY
        ),
        insulinDoses: {},
        insulinBars: {}, // For bidirectional bars
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