import TimeManager from './TimeManager';
import TimeEffect from './TimeEffect';

/**
 * TimeVisualizer - Bridge between TimeManager and TimeEffect for visualizations
 * Provides unified interface for generating time-based visualization data
 */
class TimeVisualizer {
  /**
   * Generate complete blood glucose prediction visualization
   * @param {object} patientData - Patient data including meals, insulin, activities
   * @param {object} patientConstants - Patient constants
   * @param {Date} startTime - Start time for visualization
   * @param {Date} endTime - End time for visualization
   * @param {number} startingBloodSugar - Starting blood sugar level
   * @returns {object} Complete visualization data
   */
  static generateBloodGlucoseVisualization(patientData, patientConstants, startTime, endTime, startingBloodSugar) {
    // Generate individual effect visualizations
    const insulinVisualization = TimeEffect.generateInsulinVisualization(
      patientData.insulinDoses || [],
      patientConstants.medication_factors || {},
      startTime,
      endTime
    );
    
    const mealVisualization = TimeEffect.generateMealVisualization(
      patientData.meals || [],
      patientConstants.absorption_modifiers || {},
      startTime,
      endTime
    );
    
    const activityVisualization = TimeEffect.generateActivityVisualization(
      patientData.activities || [],
      patientConstants.activity_coefficients || {},
      startTime,
      endTime
    );
    
    // Generate blood glucose prediction
    const bloodGlucosePrediction = TimeEffect.predictBloodGlucose(
      startingBloodSugar,
      insulinVisualization,
      mealVisualization,
      activityVisualization,
      patientConstants.target_glucose || 120
    );
    
    // Generate time scale for the chart
    const timeScale = TimeManager.getVisualizationTimeScale(startTime, endTime);
    
    return {
      insulinVisualization,
      mealVisualization,
      activityVisualization,
      bloodGlucosePrediction,
      timeScale,
      timePoints: insulinVisualization.timePoints,
      timeRange: {
        start: startTime,
        end: endTime,
        formattedRange: TimeManager.formatDateRange(startTime, endTime)
      }
    };
  }

  /**
   * Calculate combined health factors effect over time
   * @param {object} patientConstants - Patient constants
   * @param {Date} startTime - Start time for visualization
   * @param {Date} endTime - End time for visualization
   * @returns {object} Health factors effect over time
   */
  static generateHealthFactorsVisualization(patientConstants, startTime, endTime) {
    if (!patientConstants || !patientConstants.medication_schedules) {
      return {
        timePoints: [],
        healthFactors: []
      };
    }
    
    // Generate time points
    const timePoints = TimeManager.generateTimePoints(startTime, endTime, 50);
    
    // Calculate health factors at each time point
    const healthFactors = timePoints.map(time => {
      let factorMultiplier = 1.0;
      
      // Calculate disease impacts
      if (patientConstants.active_conditions?.length) {
        patientConstants.active_conditions.forEach(condition => {
          const diseaseData = patientConstants.disease_factors[condition];
          if (diseaseData && diseaseData.factor) {
            factorMultiplier *= diseaseData.factor;
          }
        });
      }
      
      // Calculate medication impacts using TimeEffect
      if (patientConstants.active_medications?.length) {
        patientConstants.active_medications.forEach(medication => {
          const medData = patientConstants.medication_factors[medication];
          if (!medData || !medData.factor) return;
          
          if (medData.duration_based) {
            const schedule = patientConstants.medication_schedules?.[medication];
            if (schedule) {
              const medicationEffect = TimeEffect.calculateMedicationEffect(
                medication,
                medData,
                schedule,
                time
              );
              
              if (medicationEffect) {
                factorMultiplier *= medicationEffect.factor;
              }
            } else {
              factorMultiplier *= medData.factor;
            }
          } else {
            factorMultiplier *= medData.factor;
          }
        });
      }
      
      return {
        time: time,
        factor: factorMultiplier,
        percentChange: ((factorMultiplier - 1) * 100).toFixed(1),
        isIncrease: factorMultiplier > 1,
        label: TimeManager.formatForVisualization(time, 'short')
      };
    });
    
    return {
      timePoints,
      healthFactors
    };
  }

  /**
   * Generate data for comparing frontend and backend calculations
   * @param {object} frontendCalculation - Calculation from frontend
   * @param {object} backendCalculation - Calculation from backend
   * @returns {object} Comparison data
   */
  static generateCalculationComparison(frontendCalculation, backendCalculation) {
    const comparisonData = {
      matches: true,
      differences: {},
      summary: 'Calculations match'
    };
    
    if (!frontendCalculation || !backendCalculation) {
      return {
        matches: false,
        differences: { error: 'Missing calculation data' },
        summary: 'Cannot compare calculations - missing data'
      };
    }
    
    // Check core numerical values with tolerance
    const tolerance = 0.05; // 5% tolerance
    
    // Compare frontend vs backend calculation fields
    const fieldsToCompare = [
      { frontKey: 'baseInsulin', backKey: 'base_insulin', label: 'Base insulin' },
      { frontKey: 'carbInsulin', backKey: 'carb_insulin', label: 'Carb insulin' },
      { frontKey: 'proteinContribution', backKey: 'protein_contribution', label: 'Protein contribution' },
      { frontKey: 'fatContribution', backKey: 'fat_contribution', label: 'Fat contribution' },
      { frontKey: 'correctionInsulin', backKey: 'correction_insulin', label: 'Correction insulin' },
      { frontKey: 'adjustedInsulin', backKey: 'adjusted_insulin', label: 'Adjusted insulin' },
      { frontKey: 'healthMultiplier', backKey: 'health_multiplier', label: 'Health multiplier' },
      { frontKey: 'mealTimingFactor', backKey: 'meal_timing_factor', label: 'Meal timing factor' },
      { frontKey: 'absorptionFactor', backKey: 'absorption_factor', label: 'Absorption factor' },
      { frontKey: 'activityImpact', backKey: 'activity_coefficient', label: 'Activity impact' }
    ];
    
    // Compare values
    fieldsToCompare.forEach(field => {
      const frontVal = frontendCalculation[field.frontKey];
      const backVal = backendCalculation.breakdown[field.backKey];
      
      if (frontVal !== undefined && backVal !== undefined) {
        const diff = Math.abs((frontVal - backVal) / backVal);
        
        if (diff > tolerance) {
          comparisonData.matches = false;
          comparisonData.differences[field.label] = {
            frontend: frontVal,
            backend: backVal,
            percentDiff: (diff * 100).toFixed(2) + '%'
          };
        }
      }
    });
    
    // Compare final total
    const frontTotal = frontendCalculation.total || 0;
    const backTotal = backendCalculation.total || 0;
    const totalDiff = Math.abs((frontTotal - backTotal) / backTotal);
    
    if (totalDiff > tolerance) {
      comparisonData.matches = false;
      comparisonData.differences['Total insulin'] = {
        frontend: frontTotal,
        backend: backTotal,
        percentDiff: (totalDiff * 100).toFixed(2) + '%'
      };
    }
    
    // Generate summary
    if (!comparisonData.matches) {
      const diffKeys = Object.keys(comparisonData.differences);
      comparisonData.summary = `Differences found in ${diffKeys.length} values: ${diffKeys.join(', ')}`;
    }
    
    return comparisonData;
  }

  /**
   * Generate timeline visualization data from patient events
   * @param {Array} events - Combined events (meals, insulin, blood sugar, etc.)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {object} Timeline visualization data
   */
  static generateTimelineVisualization(events, startDate, endDate) {
    if (!events || events.length === 0) {
      return { 
        timeRange: {
          start: startDate,
          end: endDate,
          formattedRange: TimeManager.formatDateRange(startDate, endDate)
        },
        events: [],
        lanes: []
      };
    }
    
    // Define event types and their display properties
    const eventTypes = {
      bloodSugar: { lane: 'measurements', color: '#4285F4', icon: 'chart' },
      meal: { lane: 'nutrition', color: '#34A853', icon: 'food' },
      insulin: { lane: 'medications', color: '#EA4335', icon: 'medication' },
      activity: { lane: 'activities', color: '#FBBC05', icon: 'activity' }
    };
    
    // Create lanes
    const lanes = [
      { id: 'measurements', label: 'Measurements', order: 1 },
      { id: 'medications', label: 'Medications', order: 2 },
      { id: 'nutrition', label: 'Nutrition', order: 3 },
      { id: 'activities', label: 'Activities', order: 4 }
    ];
    
    // Format events for timeline
    const formattedEvents = events.map(event => {
      // Determine event type and properties
      const type = event.recordingType || 
                   (event.bloodSugar ? 'bloodSugar' : 
                    event.dose ? 'insulin' : 
                    event.level !== undefined ? 'activity' : 'meal');
      
      const typeProps = eventTypes[type] || { lane: 'other', color: '#9E9E9E', icon: 'event' };
      
      // Get display time
      const displayTime = new Date(event.timestamp || event.readingTime || event.administrationTime || event.startTime);
      
      return {
        id: event.id || `event-${Math.random().toString(36).substr(2, 9)}`,
        type: type,
        time: displayTime,
        formattedTime: TimeManager.formatForVisualization(displayTime, 'time'),
        formattedDate: TimeManager.formatForVisualization(displayTime, 'date'),
        laneId: typeProps.lane,
        color: typeProps.color,
        icon: typeProps.icon,
        label: this.generateEventLabel(event, type),
        details: event
      };
    });
    
    // Filter events by time range
    const filteredEvents = formattedEvents.filter(event => {
      return event.time >= startDate && event.time <= endDate;
    });
    
    // Sort events by time
    filteredEvents.sort((a, b) => a.time - b.time);
    
    return {
      timeRange: {
        start: startDate,
        end: endDate,
        formattedRange: TimeManager.formatDateRange(startDate, endDate)
      },
      events: filteredEvents,
      lanes: lanes
    };
  }
  
  /**
   * Helper method to generate event labels
   * @param {object} event - Event data
   * @param {string} type - Event type
   * @returns {string} Formatted label
   */
  static generateEventLabel(event, type) {
    switch(type) {
      case 'bloodSugar':
        return `Blood Sugar: ${event.bloodSugar} mg/dL`;
        
      case 'meal':
        const carbsVal = event.nutrition?.carbs || 
                        (event.foodItems?.reduce((sum, item) => sum + (item.details?.carbs || 0), 0) || 'N/A');
        return `Meal: ${carbsVal}g carbs`;
        
      case 'insulin':
        return `Insulin: ${event.dose} units ${event.type || ''}`;
        
      case 'activity':
        const duration = event.duration || 
                        (event.startTime && event.endTime ? 
                         TimeManager.calculateDuration(event.startTime, event.endTime).formatted : 'N/A');
        return `Activity (Level ${event.level}): ${duration}`;
        
      default:
        return `Event: ${event.name || 'Unknown'}`;
    }
  }
}

export default TimeVisualizer;