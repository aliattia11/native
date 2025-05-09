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
 * Calculate Blood Glucose Impact curve over time for a meal
 * @param {object} meal - Meal data with timestamp and nutrition
 * @param {object} patientFactors - Patient-specific factors
 * @param {number} hoursToProject - How many hours to project (default 6)
 * @param {number} intervalMinutes - Data point interval in minutes (default 15)
 * @returns {Array} Array of time points with projected BG impact
 */
static calculateBGImpactCurve(meal, patientFactors, hoursToProject = 6, intervalMinutes = 15) {
  if (!meal?.timestamp || !meal?.nutrition) {
    return [];
  }

  // Get meal parameters
  const { carbs = 0, protein = 0, fat = 0 } = meal.nutrition;
  const absorptionType = meal.nutrition.absorption_type || 'medium';

  // Get patient-specific factors
  const {
    proteinFactor = 0.5,
    fatFactor = 0.2,
    absorptionFactors = { slow: 0.7, medium: 1.0, fast: 1.3 }
  } = patientFactors || {};

  // Calculate carb equivalents
  const proteinCarbEquiv = protein * proteinFactor;
  const fatCarbEquiv = fat * fatFactor;
  const totalCarbEquiv = carbs + proteinCarbEquiv + fatCarbEquiv;

  // Get absorption factor
  const absorptionFactor = absorptionFactors[absorptionType] || 1.0;

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
    const impactValue = intensity * totalCarbEquiv;

    dataPoints.push({
      time: timePoint,
      hoursSinceMeal,
      intensity,
      impactValue: Math.round(impactValue * 10) / 10,
      timestamp: timePoint.getTime(),
      formattedTime: TimeManager.formatDate(timePoint, TimeManager.formats.CHART_TICKS_SHORT)
    });

    // Stop if we've reached zero impact after the duration
    if (hoursSinceMeal > duration * 1.2 && intensity === 0) {
      break;
    }
  }

  return dataPoints;
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

  /**
   * Calculate Blood Glucose Impact (BGImpact) for a meal
   * @param {object} meal - Meal data with carbs, protein, fat
   * @param {object} patientFactors - Patient-specific factors
   * @returns {object} BGImpact data with value and components
   */
  static calculateBGImpact(meal, patientFactors) {
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
  }

  /**
   * Calculate Blood Glucose Impact curve over time
   * @param {object} meal - Meal data with timestamp and nutrition
   * @param {object} patientFactors - Patient-specific factors
   * @param {number} hoursToProject - How many hours to project (default 6)
   * @param {number} intervalMinutes - Data point interval in minutes (default 15)
   * @returns {Array} Array of time points with projected BG impact
   */
  static calculateBGImpactCurve(meal, patientFactors, hoursToProject = 6, intervalMinutes = 15) {
    if (!meal?.timestamp || !meal?.nutrition) {
      return [];
    }

    // Get the BGImpact total value
    const bgImpact = this.calculateBGImpact(meal, patientFactors);

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

      dataPoints.push({
        time: timePoint,
        hoursSinceMeal,
        intensity,
        impactValue: Math.round(impactValue * 10) / 10,
        formattedTime: TimeManager.formatDate(timePoint, TimeManager.formats.CHART_TICKS_SHORT)
      });

      // Stop if we've reached zero impact after the duration
      if (hoursSinceMeal > duration * 1.2 && intensity === 0) {
        break;
      }
    }

    return dataPoints;
  }
}

export default TimeEffect;