import TimeEffect from './TimeEffect';

/**
 * GlucoseInsulinUtils - Utilities for analyzing the relationship between
 * insulin dosing and blood glucose effects
 */
class GlucoseInsulinUtils {
  /**
   * Calculate the predicted blood glucose change from insulin
   * @param {Array} insulinDoses - Array of insulin doses with timing and amounts
   * @param {Object} patientConstants - Patient-specific constants and settings
   * @param {Number} startingGlucose - Starting blood glucose level
   * @param {Number} targetGlucose - Target blood glucose level
   * @returns {Array} Timeline of predicted glucose values
   */
  static predictGlucoseTimeline(insulinDoses, patientConstants, startingGlucose, targetGlucose) {
    if (!insulinDoses || insulinDoses.length === 0) {
      return [];
    }
    
    // Default patient settings if not provided
    const constants = patientConstants || {
      insulin_sensitivity_factor: 50, // How much 1U lowers BG
      carb_ratio: 15,                 // Carbs covered by 1U
      target_glucose: 120,            // Target BG
      correction_factor: 1.0          // Adjustment to insulin calculations
    };
    
    // Default target if not provided
    const target = targetGlucose || constants.target_glucose || 120;
    
    // Sort doses by time
    const sortedDoses = [...insulinDoses].sort((a, b) => a.administrationTime - b.administrationTime);
    
    // Find earliest and latest dose times
    const firstDoseTime = sortedDoses[0].administrationTime;
    const lastDoseTime = sortedDoses[sortedDoses.length - 1].administrationTime;
    
    // Create timeline with 15-minute intervals
    const timeline = [];
    const interval = 15 * 60 * 1000; // 15 minutes
    
    // Extend timeline 8 hours past the last dose
    const endTime = lastDoseTime + (8 * 60 * 60 * 1000);
    
    // Start with provided or default starting glucose
    let currentGlucose = startingGlucose || target;
    
    // Generate the timeline
    for (let time = firstDoseTime; time <= endTime; time += interval) {
      // Calculate total insulin effect at this time
      let totalEffect = 0;
      
      sortedDoses.forEach(dose => {
        // Get insulin-specific parameters
        const params = dose.pharmacokinetics || {
          onset_hours: 0.5,
          peak_hours: 2,
          duration_hours: 5
        };
        
        // Calculate hours since this dose
        const hoursSinceDose = (time - dose.administrationTime) / (60 * 60 * 1000);
        
        // Calculate effect using insulin action model
        const effect = this.calculateInsulinEffect(
          hoursSinceDose,
          dose.dose,
          params.onset_hours,
          params.peak_hours,
          params.duration_hours
        );
        
        totalEffect += effect;
      });
      
      // Calculate glucose change based on insulin sensitivity factor
      const insulinSensitivity = constants.insulin_sensitivity_factor || 50;
      const glucoseChange = totalEffect * insulinSensitivity;
      
      // Apply the calculated effect
      currentGlucose -= glucoseChange;
      
      // Apply natural drift toward target (simplified model)
      const hoursFromStart = (time - firstDoseTime) / (60 * 60 * 1000);
      const naturalDrift = 0.05 * (target - currentGlucose) * (hoursFromStart / 4);
      currentGlucose += naturalDrift;
      
      // Ensure glucose doesn't go below a safe minimum
      currentGlucose = Math.max(70, currentGlucose);
      
      // Add to timeline
      timeline.push({
        timestamp: time,
        formattedTime: new Date(time).toLocaleString(),
        predictedGlucose: currentGlucose,
        insulinEffect: totalEffect,
        cumulativeInsulinEffect: glucoseChange
      });
    }
    
    return timeline;
  }
  
  /**
   * Calculate insulin effect at a given time point (copied from InsulinVisualization)
   */
  static calculateInsulinEffect(hoursSinceDose, dose, onsetHours, peakHours, durationHours) {
    // Return 0 if outside the duration window
    if (hoursSinceDose < 0 || hoursSinceDose > durationHours) {
      return 0;
    }

    // For "peakless" insulins like glargine or detemir
    if (peakHours === null) {
      // Simple flat effect after onset
      if (hoursSinceDose < onsetHours) {
        return dose * (hoursSinceDose / onsetHours) * 0.5;
      } else {
        return dose * 0.5 * (1 - ((hoursSinceDose - onsetHours) / (durationHours - onsetHours)));
      }
    }

    // For insulins with a peak (calculate using a triangular model)
    let effect = 0;

    // Rising phase (onset to peak)
    if (hoursSinceDose < peakHours) {
      if (hoursSinceDose < onsetHours) {
        effect = dose * (hoursSinceDose / onsetHours) * (peakHours / durationHours);
      } else {
        effect = dose * (hoursSinceDose / peakHours);
      }
    }
    // Falling phase (peak to end)
    else {
      effect = dose * (1 - ((hoursSinceDose - peakHours) / (durationHours - peakHours)));
    }

    return Math.max(0, effect);
  }
  
  /**
   * Calculate insulin on board at a specific time
   * @param {Array} insulinDoses - Array of insulin doses with timing data
   * @param {Number} atTime - Timestamp to calculate IOB for (default: now)
   * @returns {Object} Total IOB and breakdown by insulin type
   */
  static calculateInsulinOnBoard(insulinDoses, atTime = Date.now()) {
    if (!insulinDoses || insulinDoses.length === 0) {
      return { total: 0, byType: {} };
    }

    let totalIOB = 0;
    const iobByType = {};

    insulinDoses.forEach(dose => {
      const hoursSinceDose = (atTime - dose.administrationTime) / (60 * 60 * 1000);
      
      // Skip if the dose is in the future or completely absorbed
      if (hoursSinceDose < 0) return;
      
      // Get insulin parameters
      const params = dose.pharmacokinetics || {
        onset_hours: 0.5,
        peak_hours: 2,
        duration_hours: 5
      };
      
      // If completely absorbed, skip
      if (hoursSinceDose > params.duration_hours) return;
      
      // Calculate percentage of insulin still active
      let remainingPercentage;
      
      if (params.peak_hours === null) {
        // Linear decline for peakless insulins
        remainingPercentage = 1 - (hoursSinceDose / params.duration_hours);
      } else {
        // For typical insulin: faster decline after peak
        if (hoursSinceDose < params.peak_hours) {
          // Rising phase: slower absorption
          remainingPercentage = 1 - (hoursSinceDose / params.duration_hours) * 0.5;
        } else {
          // Falling phase: faster absorption
          const peakToEndHours = params.duration_hours - params.peak_hours;
          const hoursAfterPeak = hoursSinceDose - params.peak_hours;
          remainingPercentage = 0.5 * (1 - (hoursAfterPeak / peakToEndHours));
        }
      }
      
      // Calculate insulin still on board
      const iob = dose.dose * Math.max(0, remainingPercentage);
      
      // Add to totals
      totalIOB += iob;
      iobByType[dose.medication] = (iobByType[dose.medication] || 0) + iob;
    });
    
    return {
      total: totalIOB,
      byType: iobByType
    };
  }
  
  /**
   * Combine blood glucose and insulin data into a unified timeline
   * @param {Array} bloodGlucoseData - Array of blood glucose readings
   * @param {Array} insulinData - Array of insulin doses
   * @returns {Array} Combined timeline with both data types
   */
  static combineGlucoseAndInsulinData(bloodGlucoseData, insulinData) {
    if ((!bloodGlucoseData || bloodGlucoseData.length === 0) && 
        (!insulinData || insulinData.length === 0)) {
      return [];
    }

    // Prepare timestamps array
    const allTimestamps = [];
    
    // Add blood glucose timestamps
    if (bloodGlucoseData && bloodGlucoseData.length > 0) {
      bloodGlucoseData.forEach(reading => {
        if (reading.readingTime) {
          allTimestamps.push(reading.readingTime);
        }
      });
    }
    
    // Add insulin dose timestamps
    if (insulinData && insulinData.length > 0) {
      insulinData.forEach(dose => {
        if (dose.administrationTime) {
          allTimestamps.push(dose.administrationTime);
        }
      });
    }
    
    // If no valid timestamps, return empty array
    if (allTimestamps.length === 0) {
      return [];
    }
    
    // Find range
    const minTime = Math.min(...allTimestamps);
    const maxTime = Math.max(...allTimestamps);
    
    // Create timeline with 15-minute intervals
    const timeline = [];
    const interval = 15 * 60 * 1000; // 15 minutes in ms
    
    for (let time = minTime; time <= maxTime; time += interval) {
      const timePoint = {
        timestamp: time,
        formattedTime: new Date(time).toLocaleString(),
      };
      
      // Find closest blood glucose reading (within 15 minutes)
      const closestBG = bloodGlucoseData?.find(reading => 
        Math.abs(reading.readingTime - time) <= interval
      );
      
      if (closestBG) {
        timePoint.bloodGlucose = closestBG.bloodSugar;
        timePoint.bloodGlucoseStatus = closestBG.status;
        timePoint.isActualReading = closestBG.isActualReading || false;
      }
      
      // Find insulin doses at this time (within 5 minutes)
      const insulinDosesAtTime = insulinData?.filter(dose => 
        Math.abs(dose.administrationTime - time) <= 5 * 60 * 1000
      );
      
      if (insulinDosesAtTime && insulinDosesAtTime.length > 0) {
        timePoint.insulinDoses = {};
        insulinDosesAtTime.forEach(dose => {
          timePoint.insulinDoses[dose.medication] = 
            (timePoint.insulinDoses[dose.medication] || 0) + dose.dose;
        });
        
        timePoint.totalInsulinDose = insulinDosesAtTime.reduce(
          (total, dose) => total + dose.dose, 0
        );
      }
      
      // Calculate IOB at this time
      const iob = this.calculateInsulinOnBoard(insulinData, time);
      timePoint.insulinOnBoard = iob.total;
      timePoint.insulinOnBoardByType = iob.byType;
      
      timeline.push(timePoint);
    }
    
    return timeline;
  }
}

export default GlucoseInsulinUtils;