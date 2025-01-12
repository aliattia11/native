// EnhancedPatientConstantsCalc.js
import {
  DEFAULT_PATIENT_CONSTANTS,
  MEASUREMENT_SYSTEMS,
  VOLUME_MEASUREMENTS,
  WEIGHT_MEASUREMENTS,
  convertToGrams as baseConvertToGrams,
  convertToMl as baseConvertToMl
} from '../constants';

// Use the imported conversion functions
export const convertToGrams = (amount, unit) => {
  // First try using the base conversion function
  if (baseConvertToGrams) {
    return baseConvertToGrams(amount, unit);
  }

  // Fallback to direct calculation
  if (WEIGHT_MEASUREMENTS[unit]) {
    return amount * WEIGHT_MEASUREMENTS[unit].grams;
  }
  return amount;
};

export const convertToMl = (amount, unit) => {
  // First try using the base conversion function
  if (baseConvertToMl) {
    return baseConvertToMl(amount, unit);
  }

  // Fallback to direct calculation
  if (VOLUME_MEASUREMENTS[unit]) {
    return amount * VOLUME_MEASUREMENTS[unit].ml;
  }
  return amount;
};

// Rest of the file remains the same...
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
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // Check if current date is within schedule period
        if (currentDate < startDate || currentDate > endDate) {
          return; // Skip this medication if outside schedule period
        }

        // Calculate time since last dose
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

        // Calculate timing-based factor
        let timingFactor = 1.0;
        if (hoursSinceLastDose < medData.onset_hours) {
          // Ramping up phase
          timingFactor = 1.0 + ((medData.factor - 1.0) * (hoursSinceLastDose / medData.onset_hours));
        } else if (hoursSinceLastDose < medData.peak_hours) {
          // Peak phase
          timingFactor = medData.factor;
        } else if (hoursSinceLastDose < medData.duration_hours) {
          // Tapering phase
          const remainingEffect = (medData.duration_hours - hoursSinceLastDose) /
                                (medData.duration_hours - medData.peak_hours);
          timingFactor = 1.0 + ((medData.factor - 1.0) * remainingEffect);
        }

        healthMultiplier *= timingFactor;
      } else {
        // If no schedule exists, use base factor
        healthMultiplier *= medData.factor;
      }
    } else {
      // For non-duration based medications, apply factor directly
      healthMultiplier *= medData.factor;
    }
  });

  return healthMultiplier;
};

// Existing nutrient calculation functions remain the same
export const calculateNutrients = (food) => {
  if (!food.details) return { carbs: 0, protein: 0, fat: 0, absorptionType: 'medium' };

  let conversionRatio = 1;

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

// Updated insulin calculation function with health factors
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
  const mealTimingFactor = mealType && patientConstants.meal_timing_factors?.[mealType] || 1.0;

  // Get time-based factor
  const hour = new Date().getHours();
  const timeOfDayFactor = Object.values(patientConstants.time_of_day_factors || {})
    .find(factor => hour >= factor.hours[0] && hour < factor.hours[1])?.factor || 1.0;

  // Calculate activity impact
  const activityImpact = calculateActivityImpact(activities, patientConstants);

  // Calculate timing adjusted insulin
  const adjustedInsulin = baseInsulin * absorptionFactor * mealTimingFactor * timeOfDayFactor * (1 + activityImpact);

  // Calculate correction insulin if needed
  let correctionInsulin = 0;
  if (bloodSugar && patientConstants.target_glucose && patientConstants.correction_factor) {
    correctionInsulin = (bloodSugar - patientConstants.target_glucose) / patientConstants.correction_factor;
  }

  // Get combined health factor (diseases and medications)
  const healthMultiplier = calculateHealthFactors(patientConstants);

  // Calculate final insulin dose
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

export const calculateActivityImpact = (activities, patientConstants) => {
  if (!activities || !patientConstants?.activity_coefficients) return 0;

  return activities.reduce((total, activity) => {
    const coefficient = patientConstants.activity_coefficients[activity.level.toString()] || 0;
    const duration = typeof activity.duration === 'string'
      ? parseFloat(activity.duration.split(':')[0]) + (parseFloat(activity.duration.split(':')[1]) || 0) / 60
      : activity.duration;
    const durationFactor = Math.min(duration / 2, 1);
    return total + (coefficient * durationFactor);
  }, 0);
};

export const calculateHealthFactorsDetails = (patientConstants) => {
  if (!patientConstants) return null;

  const currentDate = new Date();
  const result = {
    healthMultiplier: 1.0,
    conditions: [],
    medications: [],
    summary: ''
  };

  // Calculate conditions impact
  if (patientConstants.active_conditions?.length > 0) {
    patientConstants.active_conditions.forEach(condition => {
      const conditionData = patientConstants.disease_factors[condition];
      if (conditionData && conditionData.factor) {
        result.conditions.push({
          name: condition,
          factor: conditionData.factor,
          percentage: ((conditionData.factor - 1) * 100).toFixed(1)
        });
      }
    });
  }

  // Calculate medications impact
  if (patientConstants.active_medications?.length > 0) {
    patientConstants.active_medications.forEach(medication => {
      const medData = patientConstants.medication_factors[medication];
      const schedule = patientConstants.medication_schedules?.[medication];

      if (medData) {
        let medicationEffect = null;

        if (medData.duration_based && schedule) {
          medicationEffect = calculateDurationBasedMedication(medData, schedule, currentDate);
        } else {
          medicationEffect = {
            status: 'Constant effect',
            factor: medData.factor
          };
        }

        if (medicationEffect) {
          result.medications.push({
            name: medication,
            ...medicationEffect
          });
        }
      }
    });
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

  return result;
};

// Helper function for duration-based medications
function calculateDurationBasedMedication(medData, schedule, currentDate) {
  const startDate = new Date(schedule.startDate);
  const endDate = new Date(schedule.endDate);

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

  if (hoursSinceLastDose < medData.onset_hours) {
    return {
      status: 'Ramping up',
      factor: 1.0 + ((medData.factor - 1.0) * (hoursSinceLastDose / medData.onset_hours)),
      lastDose: lastDoseTime.toLocaleString(),
      hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
    };
  }

  if (hoursSinceLastDose < medData.peak_hours) {
    return {
      status: 'Peak effect',
      factor: medData.factor,
      lastDose: lastDoseTime.toLocaleString(),
      hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
    };
  }

  if (hoursSinceLastDose < medData.duration_hours) {
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
export const getHealthFactorsDisplayData = (patientConstants) => {
  if (!patientConstants) return null;

  const currentDate = new Date();

  // Format active conditions data
  const activeConditions = patientConstants.active_conditions?.map(condition => {
    const conditionData = patientConstants.disease_factors[condition];
    if (!conditionData) return null;

    const percentChange = ((conditionData.factor - 1) * 100).toFixed(1);
    return {
      name: condition.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      factor: conditionData.factor,
      percentChange,
      isIncrease: conditionData.factor > 1
    };
  }).filter(Boolean);

  // Format medications data
  const medications = patientConstants.active_medications?.map(medication => {
    const medData = patientConstants.medication_factors[medication];
    const schedule = patientConstants.medication_schedules?.[medication];

    if (!medData) return null;

    let medicationEffect = null;

    if (medData.duration_based && schedule) {
      medicationEffect = calculateDurationBasedMedication(medData, schedule, currentDate);
    } else {
      medicationEffect = {
        status: 'Constant effect',
        factor: medData.factor
      };
    }

    return {
      name: medication.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      ...medicationEffect,
      percentChange: ((medicationEffect.factor - 1) * 100).toFixed(1),
      isIncrease: medicationEffect.factor > 1
    };
  }).filter(Boolean);

  return {
    activeConditions,
    medications,
    hasHealthFactors: (activeConditions?.length > 0 || medications?.length > 0)
  };
};

// Add this to EnhancedPatientConstantsCalc.js

export const calculateMedicationEffect = (medication, medData, schedule, currentDate) => {
  if (!medData) return null;

  if (medData.duration_based && schedule) {
    const startDate = new Date(schedule.startDate);
    const endDate = new Date(schedule.endDate);

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

    // Calculate time since last dose
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

    let phase, factor;
    if (hoursSinceLastDose < medData.onset_hours) {
      phase = 'Ramping up';
      factor = 1.0 + ((medData.factor - 1.0) * (hoursSinceLastDose / medData.onset_hours));
    } else if (hoursSinceLastDose < medData.peak_hours) {
      phase = 'Peak effect';
      factor = medData.factor;
    } else if (hoursSinceLastDose < medData.duration_hours) {
      phase = 'Tapering';
      const remainingEffect = (medData.duration_hours - hoursSinceLastDose) /
                           (medData.duration_hours - medData.peak_hours);
      factor = 1.0 + ((medData.factor - 1.0) * remainingEffect);
    } else {
      phase = 'No current effect';
      factor = 1.0;
    }

    return {
      status: phase,
      lastDose: lastDoseTime.toLocaleString(),
      factor: factor,
      hoursSinceLastDose: Math.round(hoursSinceLastDose * 10) / 10
    };
  }

  // Non-duration based medications
  return {
    status: 'Constant effect',
    factor: medData.factor
  };
};

export const getHealthFactorsBreakdown = (patientConstants, currentDate = new Date()) => {
  if (!patientConstants) return null;

  const result = {
    conditions: [],
    medications: [],
    healthMultiplier: 1.0
  };

  // Calculate conditions impact
  if (patientConstants.active_conditions?.length > 0) {
    patientConstants.active_conditions.forEach(condition => {
      const conditionData = patientConstants.disease_factors[condition];
      if (conditionData && conditionData.factor) {
        result.conditions.push({
          name: condition,
          factor: conditionData.factor,
          percentage: ((conditionData.factor - 1) * 100).toFixed(1)
        });
      }
    });
  }

  // Calculate medications impact
  if (patientConstants.active_medications?.length > 0) {
    patientConstants.active_medications.forEach(medication => {
      const medData = patientConstants.medication_factors[medication];
      const schedule = patientConstants.medication_schedules?.[medication];

      const medicationEffect = calculateMedicationEffect(medication, medData, schedule, currentDate);

      if (medicationEffect) {
        result.medications.push({
          name: medication,
          ...medicationEffect
        });
      }
    });
  }

  // Calculate combined health multiplier using existing calculateHealthFactors function
  result.healthMultiplier = calculateHealthFactors(patientConstants);

  return result;
};