import TimeEffect from './TimeEffect';

/**
 * InsulinCalculator - Blood Glucose Impact-based insulin calculation
 * Uses the BGImpact approach to determine insulin needs
 */
class InsulinCalculator {
  /**
   * Calculate insulin requirements based on Blood Glucose Impact
   * @param {object} meal - Meal data with nutrition information
   * @param {object} patientSettings - Patient-specific settings
   * @param {number} currentBloodSugar - Current blood sugar level
   * @returns {object} Insulin calculation result with components
   */
  static calculateFromBGImpact(meal, patientSettings, currentBloodSugar) {
    if (!meal || !patientSettings) {
      return { totalInsulin: 0 };
    }

    // Step 1: Calculate the meal's BG impact
    const bgImpact = TimeEffect.calculateBGImpact(meal, {
      proteinFactor: patientSettings.insulin_calculation?.protein_factor || 0.5,
      fatFactor: patientSettings.insulin_calculation?.fat_factor || 0.2,
      fiberFactor: patientSettings.insulin_calculation?.fiber_factor || 0.1,
      absorptionFactors: patientSettings.absorption_factors || { slow: 0.7, medium: 1.0, fast: 1.3 },
      dawnPhenomenonFactor: patientSettings.dawn_phenomenon_factor || 1.2
    });

    // Step 2: Calculate base insulin from BGImpact
    const insulinToCarbRatio = patientSettings.insulin_to_carb_ratio || 10;
    const baseInsulin = bgImpact.bgImpactValue / insulinToCarbRatio;
    
    // Step 3: Calculate correction insulin if current BG is provided
    let correctionInsulin = 0;
    if (currentBloodSugar && patientSettings.target_glucose && patientSettings.correction_factor) {
      const targetGlucose = patientSettings.target_glucose;
      const correctionFactor = patientSettings.correction_factor;
      
      if (currentBloodSugar > targetGlucose) {
        correctionInsulin = (currentBloodSugar - targetGlucose) / correctionFactor;
      }
    }
    
    // Step 4: Apply any additional adjustment factors
    let adjustmentFactor = 1.0;
    
    // Apply activity adjustment if provided
    if (patientSettings.activity_adjustment_factor) {
      adjustmentFactor *= patientSettings.activity_adjustment_factor;
    }
    
    // Apply health adjustment if provided (e.g., illness increases insulin needs)
    if (patientSettings.health_adjustment_factor) {
      adjustmentFactor *= patientSettings.health_adjustment_factor;
    }
    
    // Apply time of day adjustment if applicable
    if (meal.timestamp && patientSettings.time_of_day_factors) {
      const mealTime = new Date(meal.timestamp);
      const timeOfDayFactor = TimeEffect.getTimeOfDayFactor(
        patientSettings.time_of_day_factors, 
        mealTime
      );
      adjustmentFactor *= timeOfDayFactor;
    }
    
    // Step 5: Calculate final insulin dose
    const adjustedBaseInsulin = baseInsulin * adjustmentFactor;
    const totalInsulin = adjustedBaseInsulin + correctionInsulin;
    
    // Round to nearest 0.05 units (standard insulin syringe precision)
    const roundedInsulin = Math.round(totalInsulin * 20) / 20;
    
    return {
      totalInsulin: roundedInsulin,
      baseInsulin: baseInsulin,
      adjustedBaseInsulin: adjustedBaseInsulin,
      correctionInsulin: correctionInsulin,
      bgImpact: bgImpact,
      components: {
        carbs: bgImpact.components.carbs / insulinToCarbRatio,
        protein: bgImpact.components.protein / insulinToCarbRatio,
        fat: bgImpact.components.fat / insulinToCarbRatio,
        fiber: bgImpact.components.fiber / insulinToCarbRatio
      },
      factors: {
        activityAdjustment: patientSettings.activity_adjustment_factor || 1.0,
        healthAdjustment: patientSettings.health_adjustment_factor || 1.0,
        timeOfDayAdjustment: meal.timestamp ? TimeEffect.getTimeOfDayFactor(
          patientSettings.time_of_day_factors || {}, new Date(meal.timestamp)
        ) : 1.0,
        totalAdjustment: adjustmentFactor
      },
      settings: {
        insulinToCarbRatio,
        targetGlucose: patientSettings.target_glucose,
        correctionFactor: patientSettings.correction_factor
      }
    };
  }
}

export default InsulinCalculator;