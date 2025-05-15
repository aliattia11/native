import TimeManager from './TimeManager';

/**
 * TimeEffect - Utility for calculating time-based effects on blood glucose
 * This utility mirrors the backend's time-related effect calculations
 */
class TimeEffect {


  /**
   * Calculate the effect of a meal on blood glucose over time
   * @param {object} meal - Meal data with timestamp and nutrition info
   * @param {object} absorptionModifiers - Absorption modifiers by type
   * @returns {object} Current meal effect data
   */
  static calculateMealEffect(meal, absorptionModifiers, proteinFactor = 0.5, fatFactor = 0.2) {
    if (!meal?.timestamp || !meal?.nutrition) {
      return { active: false, intensity: 0 };
    }

    const { carbs = 0, protein = 0, fat = 0 } = meal.nutrition;
    const absorptionType = meal.nutrition.absorption_type || 'medium';
    const absorptionFactor = absorptionModifiers?.[absorptionType] || 1.0;

    // Calculate carb equivalents
    const proteinCarbEquiv = protein * proteinFactor;
    const fatCarbEquiv = fat * fatFactor;
    const totalCarbEquiv = carbs + proteinCarbEquiv + fatCarbEquiv;

    // Calculate meal duration based on composition and absorption
    // Higher fat/protein extends duration, higher absorption factor shortens it
    const baseDuration = 2 + (fat * 0.02) + (protein * 0.01);
    const adjustedDuration = baseDuration / absorptionFactor;

    // Calculate peak time (carb-heavy meals peak faster)
    const carbRatio = carbs / Math.max(1, carbs + protein + fat);
    const basePeak = 0.5 + ((1 - carbRatio) * 0.5); // Low carb ratio = later peak
    const adjustedPeak = basePeak / absorptionFactor;

    // Calculate hours since meal
    const mealTime = new Date(meal.timestamp);
    const currentTime = new Date();
    const hoursSince = (currentTime - mealTime) / (1000 * 60 * 60);

    // Calculate effect intensity
    const active = hoursSince < adjustedDuration;
    let intensity = 0;

    if (hoursSince < adjustedPeak) {
      // Rising phase - shape varies by absorption type
      if (absorptionType === 'fast') {
        // Fast absorption means steeper initial rise (exponential-like)
        intensity = Math.min(1.0, Math.pow(hoursSince / adjustedPeak, 0.7));
      } else if (absorptionType === 'slow') {
        // Slow absorption means more gradual rise (logarithmic-like)
        intensity = Math.min(1.0, Math.pow(hoursSince / adjustedPeak, 1.3));
      } else {
        // Medium/default is linear
        intensity = Math.min(1.0, hoursSince / adjustedPeak);
      }
    } else if (hoursSince < adjustedDuration) {
      // Falling phase - also shape varies by absorption type
      const fallRatio = (hoursSince - adjustedPeak) / (adjustedDuration - adjustedPeak);
      if (absorptionType === 'fast') {
        // Fast absorption means steeper decline
        intensity = Math.max(0, 1.0 - Math.pow(fallRatio, 0.7));
      } else if (absorptionType === 'slow') {
        // Slow absorption means more gradual decline with a tail
        intensity = Math.max(0, 1.0 - Math.pow(fallRatio, 0.5));
      } else {
        // Medium/default is linear
        intensity = Math.max(0, 1.0 - fallRatio);
      }
    }

    // Scale by total carb equivalent (not just carbs)
    const effectiveStrength = intensity * totalCarbEquiv;

    return {
      active,
      intensity,
      hoursSince,
      remainingHours: Math.max(0, adjustedDuration - hoursSince),
      percentRemaining: Math.max(0, 100 * (1 - (hoursSince / adjustedDuration))),
      effectiveStrength,
      peak: adjustedPeak,
      duration: adjustedDuration,
      absorptionType,
      totalCarbEquiv,
      carbs,
      proteinCarbEquiv,
      fatCarbEquiv
    };
  }


  /**
   * Calculate the effect of activity on blood glucose
   * @param {object} activity - Activity data with level, start/end times
   * @param {object} activityCoefficients - Coefficients by activity level
   * @returns {object} Current activity effect data
   */
  static calculateActivityEffect(activity, activityCoefficients = {}) {
    if (!activity?.startTime) {
      return { active: false, intensity: 0 };
    }

    const startTime = new Date(activity.startTime);
    const endTime = activity.endTime ? new Date(activity.endTime) : startTime;
    const currentTime = new Date();

    // Calculate activity duration in hours
    const activityDuration = Math.max(0, (endTime - startTime) / (1000 * 60 * 60));

    // Get activity coefficient
    const level = activity.level || 0;
    const coefficient = activityCoefficients[level] || 1.0;

    // Calculate effect duration (higher intensity = longer effect)
    const effectDuration = Math.min(24, 2 + (activityDuration * (1 + level * 0.2)));

    // Check if activity is in progress or finished
    const inProgress = currentTime >= startTime && currentTime <= endTime;
    const hoursSinceEnd = inProgress ? 0 : (currentTime - endTime) / (1000 * 60 * 60);
    const active = inProgress || hoursSinceEnd < effectDuration;

    // Calculate current intensity
    let intensity = 0;
    if (inProgress) {
      // During activity, intensity builds up
      const progressRatio = (currentTime - startTime) / Math.max(0.1, endTime - startTime);
      intensity = Math.min(1.0, progressRatio * 0.8 + 0.2);
    } else if (active) {
      // After activity, effect gradually declines
      intensity = Math.max(0, 1.0 - (hoursSinceEnd / effectDuration));
    }

    // Scale by coefficient (higher levels have stronger effects)
    const scaledIntensity = intensity * Math.abs(coefficient - 1);

    return {
      active,
      intensity: scaledIntensity,
      inProgress,
      hoursSinceEnd,
      hoursSinceStart: (currentTime - startTime) / (1000 * 60 * 60),
      activityDuration,
      effectDuration,
      remainingHours: inProgress ? effectDuration : Math.max(0, effectDuration - hoursSinceEnd),
      percentComplete: inProgress ?
        ((currentTime - startTime) / (endTime - startTime)) * 100 :
        Math.min(100, (hoursSinceEnd / effectDuration) * 100)
    };
  }



  /**
   * Enhanced meal effect calculation with extended information for visualization
   * @param {object} meal - Meal data with nutrition info
   * @param {object} patientConstants - Patient-specific constants
   * @param {number} effectDurationHours - Hours to project (default 6)
   * @returns {object} Complete meal effect data for visualization
   */
  static calculateExtendedMealEffect(meal, patientConstants, effectDurationHours = 6) {
    if (!meal || !patientConstants) {
      console.log("Missing meal or patientConstants data");
      return { impact: {}, curve: [], mealDetails: meal || {} };
    }

    try {
      // Get absorption modifiers from constants
      const absorptionModifiers = patientConstants.absorption_modifiers || {
        very_fast: 1.4,
        fast: 1.2,
        medium: 1.0,
        slow: 0.8,
        very_slow: 0.6
      };

      // Create patient factors object from constants
      const patientFactors = {
        proteinFactor: patientConstants?.protein_factor || 0.5,
        fatFactor: patientConstants?.fat_factor || 0.2,
        fiberFactor: 0.1,
        absorptionFactors: absorptionModifiers,
        dawnPhenomenonFactor: patientConstants?.dawn_phenomenon_factor || 1.2
      };

      // Calculate basic impact using existing method
      const bgImpact = this.calculateBGImpact(meal, patientFactors);

      // Generate curve points with existing method
      const curvePoints = this.calculateBGImpactCurve(meal, patientFactors,
          effectDurationHours, 15);

      // Return complete results
      return {
        impact: bgImpact,
        curve: curvePoints,
        mealDetails: meal
      };
    } catch (error) {
      console.error("Error calculating extended meal effect:", error);
      return { impact: {}, curve: [], mealDetails: meal };
    }
  }

  /**
   * Estimate baseline blood glucose at a specific timestamp
   * @param {number} timestamp - Target timestamp to estimate blood glucose
   * @param {Array} timelineData - Array of blood glucose data points
   * @param {number} target - Target blood glucose value (default 100)
   * @returns {number} Estimated baseline blood glucose
   */
  static estimateBaseline(timestamp, timelineData, target = 100) {
    // If no timeline data, return target
    if (!timelineData || timelineData.length === 0) {
      return target;
    }

    const targetTime = new Date(timestamp).getTime();

    // Find closest actual readings before and after
    const actualReadings = timelineData.filter(point => point.isActualReading);

    if (actualReadings.length === 0) {
      return target;
    }

    // Sort readings by time distance from target
    const sortedByDistance = [...actualReadings].sort((a, b) => {
      const distA = Math.abs(a.timestamp || a.readingTime - targetTime);
      const distB = Math.abs(b.timestamp || b.readingTime - targetTime);
      return distA - distB;
    });

    // If there's a very close reading (within 15 minutes), use it
    const closestReading = sortedByDistance[0];
    const readingTime = closestReading.timestamp || closestReading.readingTime;
    if (Math.abs(readingTime - targetTime) < 15 * 60 * 1000) {
      return closestReading.bloodSugar;
    }

    // Otherwise find before and after readings for interpolation
    const before = actualReadings
      .filter(reading => (reading.timestamp || reading.readingTime) <= targetTime)
      .sort((a, b) => (b.timestamp || b.readingTime) - (a.timestamp || a.readingTime))[0];

    const after = actualReadings
      .filter(reading => (reading.timestamp || reading.readingTime) > targetTime)
      .sort((a, b) => (a.timestamp || a.readingTime) - (b.timestamp || b.readingTime))[0];

    // If we have both before and after, interpolate
    if (before && after) {
      const beforeTime = before.timestamp || before.readingTime;
      const afterTime = after.timestamp || after.readingTime;
      const totalTimeSpan = afterTime - beforeTime;

      if (totalTimeSpan === 0) return before.bloodSugar;

      const ratio = (targetTime - beforeTime) / totalTimeSpan;
      return before.bloodSugar + ratio * (after.bloodSugar - before.bloodSugar);
    }

    // If we only have one, use it
    if (before) return before.bloodSugar;
    if (after) return after.bloodSugar;

    // Fallback to target
    return target;
  }

  /**
   * Process blood glucose predictions with meal effects
   * @param {Array} timelineData - Array of data points with timestamps
   * @param {number} target - Target blood glucose value
   * @param {boolean} showMealEffect - Whether to apply meal effects
   * @param {number} mealImpactFactor - Factor to scale meal impact (default 0.5)
   * @param {number} minSafeBG - Minimum safe blood glucose level (default 70)
   */
  static processBloodGlucosePredictions(timelineData, target,
      showMealEffect = true, mealImpactFactor = 0.5, minSafeBG = 70) {

    // Find points with actual readings
    const actualReadingPoints = timelineData.filter(point => point.isActualReading);

    if (actualReadingPoints.length === 0 && target) {
      // If no actual readings but we have a target, use target as baseline for all
      timelineData.forEach(point => {
        point.estimatedBloodSugar = target;

        // Apply meal effect to estimated blood sugar
        if (showMealEffect && point.totalMealEffect > 0) {
          const mealImpact = point.totalMealEffect * mealImpactFactor;
          point.bloodSugar = Math.max(minSafeBG, target + mealImpact);
        } else {
          point.bloodSugar = target;
        }
      });
      return;
    }

    // For each time point
    for (let i = 0; i < timelineData.length; i++) {
      const point = timelineData[i];

      // Skip if it's an actual reading
      if (point.isActualReading) continue;

      // Estimate baseline blood sugar for this point
      point.estimatedBloodSugar = this.estimateBaseline(
        point.timestamp, timelineData, target);

      // Apply meal effect to estimated blood sugar
      if (showMealEffect && point.totalMealEffect > 0) {
        const mealImpact = point.totalMealEffect * mealImpactFactor;
        point.bloodSugar = Math.max(minSafeBG,
            point.estimatedBloodSugar + mealImpact);
      } else {
        point.bloodSugar = point.estimatedBloodSugar;
      }
    }
  }
}

export default TimeEffect;