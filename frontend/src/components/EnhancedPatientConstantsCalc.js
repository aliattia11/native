// EnhancedPatientConstantsCalc.js
import {
  SHARED_CONSTANTS,
  MEASUREMENT_SYSTEMS,
  VOLUME_MEASUREMENTS,
  WEIGHT_MEASUREMENTS
} from '../constants';

// Use shared utility functions if available, otherwise fall back to local implementation
export const convertToGrams = (amount, unit) => {
  if (SHARED_CONSTANTS.convertToGrams) {
    return SHARED_CONSTANTS.convertToGrams(amount, unit);
  }

  if (WEIGHT_MEASUREMENTS[unit]) {
    return amount * WEIGHT_MEASUREMENTS[unit].grams;
  }
  return amount;
};

export const convertToMl = (amount, unit) => {
  if (SHARED_CONSTANTS.convertToMl) {
    return SHARED_CONSTANTS.convertToMl(amount, unit);
  }

  if (VOLUME_MEASUREMENTS[unit]) {
    return amount * VOLUME_MEASUREMENTS[unit].ml;
  }
  return amount;
};
export const calculateNutrients = (food) => {
  if (!food.details) return {
    carbs: 0,
    protein: 0,
    fat: 0,
    absorptionType: 'medium'
  };

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

// Enhanced activity impact calculation
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

// Calculate medical factors impact
export const calculateMedicalFactors = (medicalFactors) => {
  if (!medicalFactors) return { conditionFactor: 1.0, medicationFactor: 1.0 };

  const conditionFactor = Object.values(medicalFactors.conditions || {})
    .reduce((factor, condition) =>
      condition.active ? factor * (condition.factor || 1.0) : factor, 1.0);

  const medicationFactor = Object.values(medicalFactors.medications || {})
    .reduce((factor, medication) =>
      medication.active ? factor * (medication.factor || 1.0) : factor, 1.0);

  return {
    conditionFactor,
    medicationFactor,
    totalFactor: conditionFactor * medicationFactor
  };
};

// Enhanced insulin dose calculation
export const calculateInsulinDose = ({
  carbs,
  protein,
  fat,
  bloodSugar,
  activities,
  patientConstants,
  mealType,
  absorptionType = 'medium',
  medicalFactors
}) => {
  if (!patientConstants) {
    throw new Error('Patient constants are required for insulin calculation');
  }

  // Calculate medical factors
  const { conditionFactor, medicationFactor, totalFactor } = calculateMedicalFactors(medicalFactors);

  // Base insulin calculations
  const carbInsulin = carbs / patientConstants.insulin_to_carb_ratio;
  const proteinContribution = (protein * patientConstants.protein_factor) / patientConstants.insulin_to_carb_ratio;
  const fatContribution = (fat * patientConstants.fat_factor) / patientConstants.insulin_to_carb_ratio;

  // Adjustment factors
  const absorptionFactor = patientConstants.absorption_modifiers[absorptionType] || 1.0;
  const mealTimingFactor = mealType && patientConstants.meal_timing_factors?.[mealType] || 1.0;

  // Time-based factor
  const hour = new Date().getHours();
  const timeOfDayFactor = Object.values(patientConstants.time_of_day_factors || {})
    .find(factor => hour >= factor.hours[0] && hour < factor.hours[1])?.factor || 1.0;

  // Calculate base insulin with all factors
  const baseInsulin = (carbInsulin + proteinContribution + fatContribution) *
    absorptionFactor * mealTimingFactor * timeOfDayFactor * totalFactor;

  // Activity impact
  const activityImpact = calculateActivityImpact(activities, patientConstants);
  const activityAdjustedInsulin = baseInsulin * (1 + activityImpact);

  // Correction insulin
  let correctionInsulin = 0;
  if (bloodSugar && patientConstants.target_glucose && patientConstants.correction_factor) {
    const glucoseDifference = bloodSugar - patientConstants.target_glucose;
    correctionInsulin = (glucoseDifference / patientConstants.correction_factor) * totalFactor;
  }

  // Total insulin
  const totalInsulin = Math.max(0, activityAdjustedInsulin + correctionInsulin);

  return {
    total: Math.round(totalInsulin * 10) / 10,
    breakdown: {
      carbInsulin: Math.round(carbInsulin * 100) / 100,
      proteinContribution: Math.round(proteinContribution * 100) / 100,
      fatContribution: Math.round(fatContribution * 100) / 100,
      correctionInsulin: Math.round(correctionInsulin * 100) / 100,
      activityImpact: Math.round(activityImpact * 100) / 100,
      absorptionFactor,
      mealTimingFactor,
      timeOfDayFactor,
      medicalFactors: {
        total: Math.round(totalFactor * 100) / 100,
        conditions: {
          factor: Math.round(conditionFactor * 100) / 100,
          active: Object.entries(medicalFactors?.conditions || {})
            .filter(([_, condition]) => condition.active)
            .map(([id, condition]) => ({
              id,
              name: condition.name,
              factor: condition.factor
            }))
        },
        medications: {
          factor: Math.round(medicationFactor * 100) / 100,
          active: Object.entries(medicalFactors?.medications || {})
            .filter(([_, medication]) => medication.active)
            .map(([id, medication]) => ({
              id,
              name: medication.name,
              factor: medication.factor
            }))
        }
      }
    }
  };
};

// Add utility to format medical factors for display
export const formatMedicalFactorsForDisplay = (medicalFactors) => {
  if (!medicalFactors) return [];

  const formattedFactors = [];

  // Format conditions
  Object.entries(medicalFactors.conditions || {})
    .filter(([_, condition]) => condition.active)
    .forEach(([id, condition]) => {
      formattedFactors.push({
        id,
        type: 'condition',
        name: condition.name,
        factor: condition.factor,
        description: condition.description
      });
    });

  // Format medications
  Object.entries(medicalFactors.medications || {})
    .filter(([_, medication]) => medication.active)
    .forEach(([id, medication]) => {
      formattedFactors.push({
        id,
        type: 'medication',
        name: medication.name,
        factor: medication.factor,
        description: medication.description
      });
    });

  return formattedFactors;
};