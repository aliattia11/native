// Import the new time utilities
import TimeManager from '../utils/TimeManager';
import axios from 'axios';
// Replace TimeEffect import with insulinUtils for medication effect calculation
import { calculateMedicationEffect } from '../utils/insulinUtils';

import {
  MEASUREMENT_SYSTEMS,
  VOLUME_MEASUREMENTS,
  WEIGHT_MEASUREMENTS,
  convertToGrams as baseConvertToGrams,
  convertToMl as baseConvertToMl
} from '../constants';

// Conversion utilities remain the same
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

  const currentDate = options.currentDate || new Date();
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

  // Calculate medications impact - Using imported calculateMedicationEffect from insulinUtils
  if (patientConstants.active_medications?.length > 0) {
    result.medications = patientConstants.active_medications
      .map(medication => {
        const medData = patientConstants.medication_factors[medication];
        const schedule = patientConstants.medication_schedules?.[medication];
        if (!medData) return null;

        // Use imported calculateMedicationEffect instead of TimeEffect
        const medicationEffect = calculateMedicationEffect(
          medication,
          medData,
          schedule,
          currentDate
        );

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
  result.healthMultiplier = calculateHealthFactors(patientConstants, currentDate);

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

// Interface functions remain the same
export const calculateHealthFactorsDetails = (patientConstants, currentDate) => {
  return calculateHealthFactorsData(patientConstants, { currentDate });
};

export const getHealthFactorsDisplayData = (patientConstants, currentDate) => {
  const data = calculateHealthFactorsData(patientConstants, { formatNames: true, currentDate });
  return {
    activeConditions: data.conditions,
    medications: data.medications,
    hasHealthFactors: data.hasHealthFactors
  };
};

export const getHealthFactorsBreakdown = (patientConstants, currentDate = new Date()) => {
  const data = calculateHealthFactorsData(patientConstants, { currentDate });
  return {
    conditions: data.conditions,
    medications: data.medications,
    healthMultiplier: data.healthMultiplier
  };
};

// Replace TimeEffect reference with imported function
export { calculateMedicationEffect };

export const calculateHealthFactors = (patientConstants, currentDate = new Date()) => {
  if (!patientConstants) return 1.0;

  let healthMultiplier = 1.0;

  // Calculate disease impacts
  const activeConditions = patientConstants.active_conditions || [];
  activeConditions.forEach(condition => {
    const diseaseData = patientConstants.disease_factors[condition];
    if (diseaseData && diseaseData.factor) {
      healthMultiplier *= diseaseData.factor;
    }
  });

  // Calculate medication impacts using imported calculateMedicationEffect
  const activeMedications = patientConstants.active_medications || [];
  activeMedications.forEach(medication => {
    const medData = patientConstants.medication_factors[medication];
    if (!medData || !medData.factor) return;

    if (medData.duration_based) {
      const schedule = patientConstants.medication_schedules?.[medication];
      if (schedule) {
        const medicationEffect = calculateMedicationEffect(
          medication,
          medData,
          schedule,
          currentDate
        );

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

    // Calculate duration in hours using TimeManager
    let duration;

    // Handle different activity duration formats
    if (activity.startTime && activity.endTime) {
      // If we have start and end times, use TimeManager
      duration = TimeManager.calculateDuration(activity.startTime, activity.endTime).totalHours;
    } else if (typeof activity.duration === 'string' && activity.duration.includes(':')) {
      // If duration is in "HH:MM" format
      duration = TimeManager.durationToHours(activity.duration);
    } else {
      // Otherwise use as-is or default to 0
      duration = parseFloat(activity.duration) || 0;
    }

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

export const calculateCarbEquivalents = (nutrition, patientConstants) => {
  if (!nutrition || !patientConstants) {
    return 0;
  }

  const totalCarbs = nutrition.carbs || 0;
  const totalProtein = nutrition.protein || 0;
  const totalFat = nutrition.fat || 0;

  const proteinFactor = patientConstants.protein_factor || 0.5;
  const fatFactor = patientConstants.fat_factor || 0.2;

  const proteinCarbEquiv = totalProtein * proteinFactor;
  const fatCarbEquiv = totalFat * fatFactor;

  return {
    proteinCarbEquiv,
    fatCarbEquiv,
    totalCarbEquiv: totalCarbs + proteinCarbEquiv + fatCarbEquiv
  };
};

// Add this new function to fetch active insulin data
export const fetchActiveInsulin = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) return 0;

    const response = await axios.get(
      'http://localhost:5000/api/active-insulin',
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    if (response.data && response.data.total_active_insulin !== undefined) {
      return parseFloat(response.data.total_active_insulin);
    }
    return 0;
  } catch (error) {
    console.error('Error fetching active insulin:', error);
    return 0;
  }
};

export const calculateInsulinDose = async ({
  carbs,
  protein,
  fat,
  bloodSugar,
  activities,
  patientConstants,
  mealType,
  absorptionType = 'medium',
  currentTime = new Date(),
  activeInsulinValue = null // Allow passing active insulin directly
}) => {
  if (!patientConstants) {
    throw new Error('Patient constants are required');
  }

  // If active insulin wasn't passed, fetch it
  let activeInsulin = activeInsulinValue;
  if (activeInsulin === null) {
    try {
      activeInsulin = await fetchActiveInsulin();
    } catch (error) {
      console.warn('Error fetching active insulin, defaulting to 0:', error);
      activeInsulin = 0;
    }
  }

  // Calculate carb equivalents
  const carbEquivalents = calculateCarbEquivalents({
    carbs,
    protein,
    fat
  }, patientConstants);

  // Use total carb equivalents to calculate base insulin
  const baseInsulin = carbEquivalents.totalCarbEquiv / patientConstants.insulin_to_carb_ratio;

  // Calculate adjustment factors
  const absorptionFactor = patientConstants.absorption_modifiers[absorptionType] || 1.0;
  const mealTimingFactor = (mealType && patientConstants.meal_timing_factors?.[mealType]) || 1.0;
  const activityImpact = calculateActivityImpact(activities, patientConstants);

  // Calculate timing adjusted insulin
  const adjustedInsulin = baseInsulin * absorptionFactor * mealTimingFactor * activityImpact;

  // Calculate correction insulin if needed
  let correctionInsulin = 0;
  if (bloodSugar && patientConstants.target_glucose && patientConstants.correction_factor) {
    correctionInsulin = (bloodSugar - patientConstants.target_glucose) / patientConstants.correction_factor;
    // Don't allow negative correction insulin
    correctionInsulin = Math.max(0, correctionInsulin);
  }

  // Calculate total before subtracting active insulin
  const preActiveTotal = adjustedInsulin + correctionInsulin;

  // Subtract active insulin (don't go below 0)
  const postActiveTotal = Math.max(0, preActiveTotal - activeInsulin);

  // Get health factors and calculate final insulin
  const healthMultiplier = calculateHealthFactors(patientConstants, currentTime);
  let totalInsulin = Math.max(0, postActiveTotal * healthMultiplier);

  // Round to nearest 0.1 units
  totalInsulin = Math.round(totalInsulin * 10) / 10;

  // Apply safety threshold - minimum 0.5 units if insulin is needed
  if (preActiveTotal > 0 && totalInsulin < 0.5) {
    totalInsulin = 0.5;
  }

  return {
    total: totalInsulin,
    breakdown: {
      carbsActual: Math.round(carbs * 100) / 100,
      proteinCarbEquiv: Math.round(carbEquivalents.proteinCarbEquiv * 100) / 100,
      fatCarbEquiv: Math.round(carbEquivalents.fatCarbEquiv * 100) / 100,
      totalCarbEquiv: Math.round(carbEquivalents.totalCarbEquiv * 100) / 100,
      baseInsulin: Math.round(baseInsulin * 100) / 100,
      adjustedInsulin: Math.round(adjustedInsulin * 100) / 100,
      correctionInsulin: Math.round(correctionInsulin * 100) / 100,
      preActiveTotal: Math.round(preActiveTotal * 100) / 100,
      activeInsulin: Math.round(activeInsulin * 100) / 100,
      postActiveTotal: Math.round(postActiveTotal * 100) / 100,
      healthMultiplier: Math.round(healthMultiplier * 100) / 100,
      absorptionFactor,
      mealTimingFactor,
      activityImpact: Math.round(activityImpact * 100) / 100
    }
  };
};

export const calculateInsulinNeeds = async (selectedFoods, bloodSugar, activities, patientConstants, mealType, currentTime = new Date(), activeInsulinValue = null) => {
  if (selectedFoods.length === 0 || !patientConstants) {
    return {
      suggestedInsulin: '',
      insulinBreakdown: null
    };
  }

  try {
    const totalNutrition = calculateTotalNutrients(selectedFoods);
    const insulinCalculation = await calculateInsulinDose({
      ...totalNutrition,
      bloodSugar: parseFloat(bloodSugar) || 0,
      activities,
      patientConstants,
      mealType,
      currentTime,
      activeInsulinValue
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