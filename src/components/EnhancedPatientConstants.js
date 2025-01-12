export const MEASUREMENT_SYSTEMS = {
  VOLUME: 'volume',
  WEIGHT: 'weight'
};

export const VOLUME_MEASUREMENTS = {
  cup: { ml: 240, display_name: "Cup" },
  half_cup: { ml: 120, display_name: "½ Cup" },
  quarter_cup: { ml: 60, display_name: "¼ Cup" },
  tablespoon: { ml: 15, display_name: "Tablespoon" },
  teaspoon: { ml: 5, display_name: "Teaspoon" },
  bowl: { ml: 400, display_name: "Medium Bowl" },
  v_plate: { ml: 350, display_name: "Full Plate (Volume)" },
  v_small_plate: { ml: 175, display_name: "Small Plate (Volume)" },
  ml: { ml: 1, display_name: "Milliliter" }
};

export const WEIGHT_MEASUREMENTS = {
  palm: { grams: 85, display_name: "Palm-sized" },
  handful: { grams: 30, display_name: "Handful" },
  fist: { grams: 150, display_name: "Fist-sized" },
  w_plate: { grams: 300, display_name: "Full Plate (Weight)" },
  w_small_plate: { grams: 150, display_name: "Small Plate (Weight)" },
  g: { grams: 1, display_name: "Grams" },
  kg: { grams: 1000, display_name: "Kilograms" }
};

// Activity and meal type enums
export const ACTIVITY_LEVELS = [
  { value: -2, label: 'Sleep', impact: -0.2 },
  { value: -1, label: 'Very Low Activity', impact: -0.1 },
  { value: 0, label: 'Normal Activity', impact: 0 },
  { value: 1, label: 'High Activity', impact: 0.1 },
  { value: 2, label: 'Vigorous Activity', impact: 0.2 }
];

export const MEAL_TYPES = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' }
];

// Default patient constants
export const DEFAULT_PATIENT_CONSTANTS = {
  // Basic insulin calculations
  insulin_to_carb_ratio: 10,
  correction_factor: 50,
  target_glucose: 100,
  protein_factor: 0.5,
  fat_factor: 0.2,

  // Activity impact coefficients
  activity_coefficients: {
    "-2": 0.2,  // Sleep
    "-1": 0.1,  // Very Low Activity
    "0": 0,     // Normal Activity
    "1": -0.1,  // High Activity
    "2": -0.2   // Vigorous Activity
  },

  // Absorption modifiers
  absorption_modifiers: {
    very_slow: 0.6,
    slow: 0.8,
    medium: 1.0,
    fast: 1.2,
    very_fast: 1.4
  },

  // Insulin timing guidelines
  insulin_timing_guidelines: {
    very_slow: {
      timing_minutes: 0,
      description: "Take insulin at the start of meal"
    },
    slow: {
      timing_minutes: 5,
      description: "Take insulin 5 minutes before meal"
    },
    medium: {
      timing_minutes: 10,
      description: "Take insulin 10 minutes before meal"
    },
    fast: {
      timing_minutes: 15,
      description: "Take insulin 15 minutes before meal"
    },
    very_fast: {
      timing_minutes: 20,
      description: "Take insulin 20 minutes before meal"
    }
  }
};

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
  // Calculate base insulin from carbs
  const carbInsulin = carbs / patientConstants.insulin_to_carb_ratio;

  // Calculate protein and fat contributions
  const proteinContribution = (protein * patientConstants.protein_factor) / patientConstants.insulin_to_carb_ratio;
  const fatContribution = (fat * patientConstants.fat_factor) / patientConstants.insulin_to_carb_ratio;

  // Get absorption factor based on food type
  const absorptionFactor = patientConstants.absorption_modifiers[absorptionType] || 1.0;

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