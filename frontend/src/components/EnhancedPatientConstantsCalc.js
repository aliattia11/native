import {   MEASUREMENT_SYSTEMS,
  VOLUME_MEASUREMENTS,
  WEIGHT_MEASUREMENTS,
  ACTIVITY_LEVELS,
  MEAL_TYPES,
  DEFAULT_PATIENT_CONSTANTS } from '../constants';


// Calculation functions
export const convertToGrams = (amount, unit) => {
  if (WEIGHT_MEASUREMENTS[unit]) {
    return amount * WEIGHT_MEASUREMENTS[unit].grams;
  }
  return amount;
};

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
    const portionUnit = food.portion.unit;
    const servingUnit = food.details.serving_size?.unit || 'serving';

    if (portionUnit === 'serving' || servingUnit === 'serving') {
      conversionRatio = food.portion.amount / (food.details.serving_size?.amount || 1);
    } else if (VOLUME_MEASUREMENTS[portionUnit] && VOLUME_MEASUREMENTS[servingUnit]) {
      const portionInMl = food.portion.amount * VOLUME_MEASUREMENTS[portionUnit].ml;
      const servingInMl = (food.details.serving_size?.amount || 1) *
        VOLUME_MEASUREMENTS[servingUnit].ml;
      conversionRatio = portionInMl / servingInMl;
    }
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

export const calculateActivityImpact = (activities, patientConstants) => {
  return activities.reduce((total, activity) => {
    const coefficient = patientConstants.activity_coefficients[activity.level] || 0;
    const duration = typeof activity.duration === 'string'
      ? parseFloat(activity.duration.split(':')[0]) + (parseFloat(activity.duration.split(':')[1]) || 0) / 60
      : activity.duration;
    const durationFactor = Math.min(duration / 2, 1);
    return total + (coefficient * durationFactor);
  }, 0);
};

export const calculateInsulinDose = ({
  carbs,
  protein,
  fat,
  bloodSugar,
  activities,
  patientConstants,
  absorptionType = 'medium'
}) => {
  // Use patient constants with fallback to defaults
  const constants = patientConstants || DEFAULT_PATIENT_CONSTANTS;

  // Calculate base insulin from carbs
  const carbInsulin = carbs / constants.insulin_to_carb_ratio;

  // Calculate protein and fat contributions
  const proteinContribution = (protein * constants.protein_factor) / constants.insulin_to_carb_ratio;
  const fatContribution = (fat * constants.fat_factor) / constants.insulin_to_carb_ratio;

  // Get absorption factor based on food type
  const absorptionFactor = constants.absorption_modifiers[absorptionType] || 1.0;
  // Calculate base insulin with absorption factor
  const baseInsulin = (carbInsulin + proteinContribution + fatContribution) * absorptionFactor;

  // Calculate activity impact and apply to base insulin
  const activityImpact = calculateActivityImpact(activities, patientConstants);
  const activityAdjustedInsulin = baseInsulin * (1 + activityImpact);

  // Calculate correction insulin if needed
  let correctionInsulin = 0;
  if (bloodSugar) {
    const glucoseDifference = bloodSugar - patientConstants.target_glucose;
    correctionInsulin = glucoseDifference / patientConstants.correction_factor;
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
      absorptionFactor
    }
  };
};