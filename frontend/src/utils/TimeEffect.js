import TimeManager from './TimeManager';

/**
 * TimeEffect - Utility for calculating time-based effects on blood glucose
 * This utility mirrors the backend's time-related effect calculations
 */
class TimeEffect {
  /**
   * Calculate medication effect based on time since last dose
   * @param {string} medication - Medication identifier
   * @param {object} medData - Medication data with onset, peak, duration
   * @param {object} schedule - Medication schedule with dailyTimes
   * @param {Date} currentTime - Current time to calculate effect for
   * @returns {object} Effect data including factor and status
   */
  static calculateMedicationEffect(medication, medData, schedule, currentTime = new Date()) {
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
      const lastDoseTime = this.findLastDoseTime(schedule.dailyTimes, currentTime);
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
  }

  /**
   * Find the last dose time based on daily schedule
   * @param {Array} dailyTimes - List of daily time strings (HH:MM format)
   * @param {Date} currentTime - Current reference time
   * @returns {Date} Last dose time
   */
  static findLastDoseTime(dailyTimes, currentTime = new Date()) {
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
  }

  /**
   * Calculate effect of insulin on blood glucose over time
   * @param {object} insulin - Insulin data including type, dose, administrationTime
   * @param {object} insulinProfile - Data about onset, peak, duration
   * @returns {object} Current effect data
   */
  static calculateInsulinEffect(insulin, insulinProfile) {
    if (!insulin?.administrationTime || !insulinProfile) {
      return { active: false, intensity: 0, percentRemaining: 0 };
    }
    
    const { onset_hours = 0.5, peak_hours = 2, duration_hours = 4 } = insulinProfile;
    const adminTime = new Date(insulin.administrationTime);
    const currentTime = new Date();
    const hoursSince = (currentTime - adminTime) / (1000 * 60 * 60);
    
    // Check if insulin is still active
    const active = hoursSince < duration_hours;
    
    // Calculate effect intensity
    let intensity = 0;
    if (hoursSince < onset_hours) {
      // Ramping up to onset
      intensity = (hoursSince / onset_hours) * 0.2;
    } else if (hoursSince < peak_hours) {
      // Building from onset to peak
      intensity = 0.2 + ((hoursSince - onset_hours) / (peak_hours - onset_hours)) * 0.8;
    } else if (hoursSince < duration_hours) {
      // Declining from peak to end
      intensity = 1.0 - ((hoursSince - peak_hours) / (duration_hours - peak_hours));
    } else {
      // After duration has passed
      intensity = 0;
    }
    
    // Calculate percentage of insulin remaining
    const percentRemaining = Math.max(0, 100 * (1 - (hoursSince / duration_hours)));
    
    return {
      active,
      intensity,
      hoursSince,
      remainingHours: Math.max(0, duration_hours - hoursSince),
      percentRemaining,
      effectiveStrength: intensity * insulin.dose
    };
  }

  /**
   * Calculate the effect of a meal on blood glucose over time
   * @param {object} meal - Meal data with timestamp and nutrition info
   * @param {object} absorptionModifiers - Absorption modifiers by type
   * @returns {object} Current meal effect data
   */
  static calculateMealEffect(meal, absorptionModifiers) {
    if (!meal?.timestamp || !meal?.nutrition) {
      return { active: false, intensity: 0 };
    }
    
    const { carbs = 0, protein = 0, fat = 0 } = meal.nutrition;
    const absorptionType = meal.nutrition.absorption_type || 'medium';
    const absorptionFactor = absorptionModifiers?.[absorptionType] || 1.0;
    
    // Calculate meal duration based on composition and absorption
    // Higher fat/protein extends duration, higher absorption factor shortens it
    const baseDuration = 2 + (fat * 0.02) + (protein * 0.01);
    const adjustedDuration = baseDuration / absorptionFactor;
    
    // Calculate peak time (carb-heavy meals peak faster)
    const carbRatio = carbs / Math.max(1, carbs + protein + fat);
    const basePeak = 0.5 + ((1 - carbRatio) * 0.5);
    const adjustedPeak = basePeak / absorptionFactor;
    
    // Calculate hours since meal
    const mealTime = new Date(meal.timestamp);
    const currentTime = new Date();
    const hoursSince = (currentTime - mealTime) / (1000 * 60 * 60);
    
    // Calculate effect intensity
    const active = hoursSince < adjustedDuration;
    let intensity = 0;
    
    if (hoursSince < adjustedPeak) {
      // Rising phase
      intensity = Math.min(1.0, hoursSince / adjustedPeak);
    } else if (hoursSince < adjustedDuration) {
      // Falling phase
      intensity = Math.max(0, 1.0 - ((hoursSince - adjustedPeak) / (adjustedDuration - adjustedPeak)));
    }
    
    // Scale by carb content (main driver of glucose rise)
    const effectiveStrength = intensity * carbs;
    
    return {
      active,
      intensity,
      hoursSince,
      remainingHours: Math.max(0, adjustedDuration - hoursSince),
      percentRemaining: Math.max(0, 100 * (1 - (hoursSince / adjustedDuration))),
      effectiveStrength,
      peak: adjustedPeak,
      duration: adjustedDuration
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
   * Calculate time of day factor for insulin needs
   * @param {object} timeOfDayFactors - Factors by time period
   * @param {Date} currentTime - Time to calculate factor for
   * @returns {number} Time of day factor
   */
  static getTimeOfDayFactor(timeOfDayFactors, currentTime = new Date()) {
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
  }
}

export default TimeEffect;