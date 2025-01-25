// Part 1: Core Functions and Utilities

import {
  MEASUREMENT_SYSTEMS,
  VOLUME_MEASUREMENTS,
  WEIGHT_MEASUREMENTS,
  convertToGrams as baseConvertToGrams,
  convertToMl as baseConvertToMl
} from '../constants';

// Conversion utilities
const convertToGrams = (amount, unit) => {
  if (baseConvertToGrams) {
    return baseConvertToGrams(amount, unit);
  }
  if (WEIGHT_MEASUREMENTS[unit]) {
    return amount * WEIGHT_MEASUREMENTS[unit].grams;
  }
  return amount;
};

const convertToMl = (amount, unit) => {
  if (baseConvertToMl) {
    return baseConvertToMl(amount, unit);
  }
  if (VOLUME_MEASUREMENTS[unit]) {
    return amount * VOLUME_MEASUREMENTS[unit].ml;
  }
  return amount;
};

// Core calculation function
const calculateHealthFactorsData = (patientConstants, options = {}) => {
  if (!patientConstants) return null;

  const currentDate = new Date();
  const { formatNames = false } = options;

  const result = {
    healthMultiplier: 1.0,
    conditions: [],
    medications: [],
    summary: '',
    hasHealthFactors: false
  };

  // Calculate conditions impact
  if (patientConstants.active_conditions?.length > 0) {
  result.conditions = patientConstants.active_conditions
  .map(condition => {
    const conditionData = patientConstants.disease_factors[condition];
    if (!conditionData?.factor) return null;

    const factor = parseFloat(conditionData.factor);
    const percentChange = ((factor - 1) * 100).toFixed(1);

    return {
      name: formatNames
        ? condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        : condition,
      factor: factor,
      percentage: percentChange, // Add this explicit field
      isIncrease: factor > 1
    };
  })
  .filter(Boolean);
  }

  // Calculate medications impact
  if (patientConstants.active_medications?.length > 0) {
    result.medications = patientConstants.active_medications
      .map(medication => {
        const medData = patientConstants.medication_factors[medication];
        const schedule = patientConstants.medication_schedules?.[medication];
        if (!medData) return null;

        const medicationEffect = calculateMedicationEffect(medication, medData, schedule, currentDate);
        if (!medicationEffect) return null;

        return {
          name: formatNames
            ? medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            : medication,
          ...medicationEffect,
          percentChange: ((medicationEffect.factor - 1) * 100).toFixed(1),
          isIncrease: medicationEffect.factor > 1
        };
      })
      .filter(Boolean);
  }

  // Calculate combined health multiplier
  result.healthMultiplier = calculateHealthFactors(patientConstants);

  // Format summary
  const percentageChange = ((result.healthMultiplier - 1) * 100).toFixed(1);
  result.summary = `${percentageChange}%${
    result.healthMultiplier > 1 
      ? ` (+${percentageChange}% increase)` 
      : ` (${percentageChange}% decrease)`
  }`;

  result.hasHealthFactors = result.conditions.length > 0 || result.medications.length > 0;

  return result;
};

// Interface functions
export const calculateHealthFactorsDetails = (patientConstants) => {
  return calculateHealthFactorsData(patientConstants);
};

export const getHealthFactorsDisplayData = (patientConstants) => {
  const data = calculateHealthFactorsData(patientConstants, { formatNames: true });
  return {
    activeConditions: data.conditions,
    medications: data.medications,
    hasHealthFactors: data.hasHealthFactors
  };
};

export const getHealthFactorsBreakdown = (patientConstants, currentDate = new Date()) => {
  const data = calculateHealthFactorsData(patientConstants);
  return {
    conditions: data.conditions,
    medications: data.medications,
    healthMultiplier: data.healthMultiplier
  };
};
// Part 2: Medication and Activity Calculations

export const calculateMedicationEffect = (medication, medData, schedule, currentDate) => {
  if (!medData) return null;

  if (medData.duration_based && schedule) {
    const startDate = new Date(schedule.startDate);
    const endDate = new Date(schedule.endDate);

    // Check schedule validity
    if (currentDate < startDate) {
      return {
        status: 'Scheduled to start',
        startDate: startDate.toLocaleDateString(),
        factor: 1.0
      };
    }

    if (currentDate > endDate) {
      return {
        status: 'Schedule ended',
        endDate: endDate.toLocaleDateString(),
        factor: 1.0
      };
    }

    // Calculate last dose timing
    const lastDoseTime = schedule.dailyTimes
      .map(time => {
        const [hours, minutes] = time.split(':');
        const doseTime = new Date(currentDate);
        doseTime.setHours(hours, minutes, 0, 0);
        if (doseTime > currentDate) {
          doseTime.setDate(doseTime.getDate() - 1);
        }
        return doseTime;
      })
      .sort((a, b) => b - a)[0];

    const hoursSinceLastDose = (currentDate - lastDoseTime) / (1000 * 60 * 60);

    // Calculate medication phase and factor
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
    factor: medData.factor
  };
};

export const calculateHealthFactors = (patientConstants) => {
  if (!patientConstants) return 1.0;

  let healthMultiplier = 1.0;
  const currentDate = new Date();

  // Calculate disease impacts
  const activeConditions = patientConstants.active_conditions || [];
  activeConditions.forEach(condition => {
    const diseaseData = patientConstants.disease_factors[condition];
    if (diseaseData && diseaseData.factor) {
      healthMultiplier *= diseaseData.factor;
    }
  });

  // Calculate medication impacts
  const activeMedications = patientConstants.active_medications || [];
  activeMedications.forEach(medication => {
    const medData = patientConstants.medication_factors[medication];
    if (!medData || !medData.factor) return;

    if (medData.duration_based) {
      const schedule = patientConstants.medication_schedules?.[medication];
      if (schedule) {
        const medicationEffect = calculateMedicationEffect(medication, medData, schedule, currentDate);
        if (medicationEffect) {
          healthMultiplier *= medicationEffect.factor;
        }
      } else {
        healthMultiplier *= medData.factor;
      }
    } else {
      healthMultiplier *= medData.factor;
    }
  });

  return healthMultiplier;
};

export const calculateActivityImpact = (activities, patientConstants) => {
  if (!activities || !patientConstants?.activity_coefficients) {
    return 1.0;
  }

  let totalImpact = 1.0;

  activities.forEach(activity => {
    // Get the base coefficient (defaults to 1.0 for normal activity)
    const coefficient = patientConstants.activity_coefficients[activity.level.toString()] || 1.0;

    // Calculate duration in hours
    const duration = typeof activity.duration === 'string'
      ? parseFloat(activity.duration.split(':')[0]) + (parseFloat(activity.duration.split(':')[1]) || 0) / 60
      : activity.duration;

    // Calculate duration weight (capped at 2 hours)
    const durationWeight = Math.min(duration / 2, 1);

    // Calculate weighted impact
    // For normal activity (coefficient = 1.0), this will result in no change
    const weightedImpact = 1.0 + ((coefficient - 1.0) * durationWeight);

    // Multiply into total impact
    totalImpact *= weightedImpact;
  });

  return 1.0 + (totalImpact - 1.0); // Match backend format
};

export const validateMedicationSchedule = (schedule) => {
  const errors = [];
  const startDateObj = new Date(schedule.startDate);
  const endDateObj = new Date(schedule.endDate);
  const currentDate = new Date();
  currentDate.setHours(0, 0, 0, 0);

  // Validate dates
  if (!schedule.startDate || !schedule.endDate) {
    errors.push('Start and end dates are required');
  } else {
    if (startDateObj < currentDate) {
      errors.push('Start date cannot be in the past');
    }
    if (endDateObj <= startDateObj) {
      errors.push('End date must be after start date');
    }
  }

  // Validate times
  if (schedule.dailyTimes.some(time => !time)) {
    errors.push('All time slots must be filled');
  }

  // Check for duplicate times
  const uniqueTimes = new Set(schedule.dailyTimes);
  if (uniqueTimes.size !== schedule.dailyTimes.length) {
    errors.push('Duplicate times are not allowed');
  }

  return errors;
};
// Part 3: Nutrition and Insulin Calculations

export const calculateNutrients = (food) => {
  if (!food.details) return { carbs: 0, protein: 0, fat: 0, absorptionType: 'medium' };

  let conversionRatio = 1;

  // Calculate conversion ratio based on measurement type
  if (food.portion.activeMeasurement === MEASUREMENT_SYSTEMS.WEIGHT) {
    const portionInGrams = convertToGrams(food.portion.w_amount, food.portion.w_unit);
    const servingSizeInGrams = convertToGrams(
      food.details.serving_size?.w_amount || 100,
      food.details.serving_size?.w_unit || 'g'
    );
    conversionRatio = portionInGrams / servingSizeInGrams;
  } else {
    const portionInMl = convertToMl(food.portion.amount, food.portion.unit);
    const servingSizeInMl = convertToMl(
      food.details.serving_size?.amount || 1,
      food.details.serving_size?.unit || 'serving'
    );
    conversionRatio = portionInMl / servingSizeInMl;
  }

  return {
    carbs: (food.details.carbs || 0) * conversionRatio,
    protein: (food.details.protein || 0) * conversionRatio,
    fat: (food.details.fat || 0) * conversionRatio,
    absorptionType: food.details.absorption_type || 'medium'
  };
};

export const calculateTotalNutrients = (selectedFoods) => {
  return selectedFoods.reduce((acc, food) => {
    const nutrients = calculateNutrients(food);
    return {
      carbs: acc.carbs + nutrients.carbs,
      protein: acc.protein + nutrients.protein,
      fat: acc.fat + nutrients.fat,
      absorptionType: nutrients.absorptionType
    };
  }, { carbs: 0, protein: 0, fat: 0, absorptionType: 'medium' });
};

export const get_time_of_day_factor = (patientConstants) => {
  if (!patientConstants?.time_of_day_factors) {
    return 1.0;
  }

  const hour = new Date().getHours();

  // Check each time period
for (const [, periodData] of Object.entries(patientConstants.time_of_day_factors)) {
    const [startHour, endHour] = periodData.hours;
    if (hour >= startHour && hour < endHour) {
      return periodData.factor;
    }
  }

  // Default to daytime factor if no period matches
  return patientConstants.time_of_day_factors.daytime?.factor || 1.0;
};

export const calculateInsulinDose = ({
  carbs,
  protein,
  fat,
  bloodSugar,
  activities,
  patientConstants,
  mealType,
  absorptionType = 'medium'
}) => {
  if (!patientConstants) {
    throw new Error('Patient constants are required');
  }

  // Base insulin calculation
  const carbInsulin = carbs / patientConstants.insulin_to_carb_ratio;
  const proteinContribution = (protein * patientConstants.protein_factor) / patientConstants.insulin_to_carb_ratio;
  const fatContribution = (fat * patientConstants.fat_factor) / patientConstants.insulin_to_carb_ratio;
  const baseInsulin = carbInsulin + proteinContribution + fatContribution;

  // Calculate adjustment factors
  const absorptionFactor = patientConstants.absorption_modifiers[absorptionType] || 1.0;
  const mealTimingFactor = (mealType && patientConstants.meal_timing_factors?.[mealType]) || 1.0;
  const timeOfDayFactor = get_time_of_day_factor(patientConstants);
  const activityImpact = calculateActivityImpact(activities, patientConstants);

  // Calculate timing adjusted insulin
  const adjustedInsulin = baseInsulin * absorptionFactor * mealTimingFactor * timeOfDayFactor * activityImpact;

  // Calculate correction insulin if needed
  let correctionInsulin = 0;
  if (bloodSugar && patientConstants.target_glucose && patientConstants.correction_factor) {
    correctionInsulin = (bloodSugar - patientConstants.target_glucose) / patientConstants.correction_factor;
  }

  // Get health factors and calculate final insulin
  const healthMultiplier = calculateHealthFactors(patientConstants);
  const totalInsulin = Math.max(0, (adjustedInsulin + correctionInsulin) * healthMultiplier);

  return {
    total: Math.round(totalInsulin * 10) / 10,
    breakdown: {
      carbInsulin: Math.round(carbInsulin * 100) / 100,
      proteinContribution: Math.round(proteinContribution * 100) / 100,
      fatContribution: Math.round(fatContribution * 100) / 100,
      baseInsulin: Math.round(baseInsulin * 100) / 100,
      adjustedInsulin: Math.round(adjustedInsulin * 100) / 100,
      correctionInsulin: Math.round(correctionInsulin * 100) / 100,
      healthMultiplier: Math.round(healthMultiplier * 100) / 100,
      absorptionFactor,
      mealTimingFactor,
      timeOfDayFactor,
      activityImpact: Math.round(activityImpact * 100) / 100
    }
  };
};

export const calculateInsulinNeeds = (selectedFoods, bloodSugar, activities, patientConstants, mealType) => {
  if (selectedFoods.length === 0 || !patientConstants) {
    return {
      suggestedInsulin: '',
      insulinBreakdown: null
    };
  }

  try {
    const totalNutrition = calculateTotalNutrients(selectedFoods);
    const insulinCalculation = calculateInsulinDose({
      ...totalNutrition,
      bloodSugar: parseFloat(bloodSugar) || 0,
      activities,
      patientConstants,
      mealType
    });

    return {
      suggestedInsulin: insulinCalculation.total,
      insulinBreakdown: insulinCalculation.breakdown
    };
  } catch (error) {
    throw new Error('Error calculating insulin needs: ' + error.message);
  }
};

export const compareCalculations = (frontend, backend) => {
  const differences = {};
  const tolerance = 0.01; // 1% difference tolerance

  const compareValues = (key, frontVal, backVal) => {
    const diff = Math.abs((frontVal - backVal) / backVal);
    if (diff > tolerance) {
      differences[key] = {
        frontend: frontVal,
        backend: backVal,
        percentDiff: (diff * 100).toFixed(2) + '%'
      };
    }
  };

  // Compare all numeric values
  for (const key in frontend) {
    if (typeof frontend[key] === 'number' && backend[key] !== undefined) {
      compareValues(key, frontend[key], backend[key]);
    }
  }

  return differences;
};