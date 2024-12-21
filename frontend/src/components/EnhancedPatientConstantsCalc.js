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
    throw new Error('Patient constants are required for insulin calculation');
  }

  // Calculate base insulin from carbs
  const carbInsulin = carbs / patientConstants.insulin_to_carb_ratio;

  // Calculate protein and fat contributions
  const proteinContribution = (protein * patientConstants.protein_factor) / patientConstants.insulin_to_carb_ratio;
  const fatContribution = (fat * patientConstants.fat_factor) / patientConstants.insulin_to_carb_ratio;

  // Get absorption factor based on food type
  const absorptionFactor = patientConstants.absorption_modifiers[absorptionType] || 1.0;

  // Apply meal timing factor if available
  const mealTimingFactor = mealType && patientConstants.meal_timing_factors?.[mealType] || 1.0;

  // Get time-based factor
  const hour = new Date().getHours();
  const timeOfDayFactor = Object.values(patientConstants.time_of_day_factors || {})
    .find(factor => hour >= factor.hours[0] && hour < factor.hours[1])?.factor || 1.0;

  // Calculate health factors impact
  const healthMultiplier = calculateHealthFactors(patientConstants);

  // Calculate base insulin with all factors
  const baseInsulin = (carbInsulin + proteinContribution + fatContribution) *
    absorptionFactor * mealTimingFactor * timeOfDayFactor * healthMultiplier;

  // Calculate activity impact and apply to base insulin
  const activityImpact = calculateActivityImpact(activities, patientConstants);
  const activityAdjustedInsulin = baseInsulin * (1 + activityImpact);

  // Calculate correction insulin if needed
  let correctionInsulin = 0;
  if (bloodSugar && patientConstants.target_glucose && patientConstants.correction_factor) {
    const glucoseDifference = bloodSugar - patientConstants.target_glucose;
    // Apply health multiplier to correction insulin as well
    correctionInsulin = (glucoseDifference / patientConstants.correction_factor) * healthMultiplier;
  }

  // Calculate total insulin (ensuring it never goes below 0)
  const totalInsulin = Math.max(0, activityAdjustedInsulin + correctionInsulin);

  return {
    total: Math.round(totalInsulin * 10) / 10,
    breakdown: {
      carbInsulin: Math.round(carbInsulin * 100) / 100,
      proteinContribution: Math.round(proteinContribution * 100) / 100,
      fatContribution: Math.round(fatContribution * 100) / 100,
      correctionInsulin: Math.round(correctionInsulin * 100) / 100,
      activityImpact: Math.round(activityImpact * 100) / 100,
      healthMultiplier: Math.round(healthMultiplier * 100) / 100,
      absorptionFactor,
      mealTimingFactor,
      timeOfDayFactor
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