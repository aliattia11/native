import React, { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import axios from 'axios';
import moment from 'moment';
import { debounce } from 'lodash';

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Area,
  ReferenceLine,
  BarChart,     // Added missing import
  LineChart     // Added missing import
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import TimeManager from '../utils/TimeManager';
import TimeEffect from '../utils/TimeEffect';
import TimeContext from '../contexts/TimeContext';

import TimeInput from '../components/TimeInput';
import { FaSync, FaChartBar, FaTable, FaList, FaFilter, FaCalendarAlt, FaInfoCircle } from 'react-icons/fa';

import './MealVisualization.css';

// Define constants for physiological modeling
const MIN_SAFE_BLOOD_GLUCOSE = 70; // Minimum safe blood glucose level (mg/dL)
const MEAL_IMPACT_FACTOR = 0.5; // Impact factor for converting carb equivalents to blood glucose change

const MealVisualization = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  height = '500px',
  embedded = false,
  onDataLoaded = null,
  defaultView = 'chart'
}) => {
  // Use TimeContext for date range and future projection management
  const timeContext = useContext(TimeContext);
  const lastFetchedDateRange = useRef({ start: null, end: null });

  // Use contexts for constants and blood sugar data
  const { patientConstants } = useConstants();
  const {
    combinedData: bloodSugarData,
    getFilteredData,
    targetGlucose,
    timeScale,
    includeFutureEffect,
    futureHours,
    toggleFutureEffect,
    setFutureHours
  } = useBloodSugarData();

  // State for meal data
  const [meals, setMeals] = useState([]);
  const [filteredMeals, setFilteredMeals] = useState([]);
  const [combinedData, setCombinedData] = useState([]); // Combined data for visualization
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI State
  const [activeView, setActiveView] = useState(defaultView);
  const [chartType, setChartType] = useState('nutrition');
  const [mealTypeFilter, setMealTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [userTimeZone, setUserTimeZone] = useState('');
  const [detailView, setDetailView] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showFactorInfo, setShowFactorInfo] = useState(false);

  // Visibility toggles for chart elements
  const [showMeals, setShowMeals] = useState(true);
  const [showMealEffect, setShowMealEffect] = useState(true);
  const [showBloodSugar, setShowBloodSugar] = useState(true);
  const [viewMode, setViewMode] = useState('combined');

  // Effect duration setting for meal impact
  const [effectDurationHours, setEffectDurationHours] = useState(6);

  // For custom date range when not using TimeContext
  const [localDateRange, setLocalDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });

  // References for tracking fetches and charts
  const didFetchRef = useRef(false);
  const chartRef = useRef(null);

  // Use TimeContext date range if available, otherwise use local state
  const dateRange = timeContext ? timeContext.dateRange : localDateRange;

  // Set user timezone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Process raw meal data into the format needed for visualization
  const processMealData = useCallback((rawMeals) => {
    if (!Array.isArray(rawMeals)) {
      console.error('processMealData received non-array data:', rawMeals);
      return [];
    }

    return rawMeals.map(meal => {
      // Parse timestamps and convert to local time
      const mealTime = moment.utc(meal.timestamp).local();
      const formattedTime = TimeManager.formatDate(
        mealTime.toDate(),
        TimeManager.formats.DATETIME_DISPLAY
      );

      // Extract or calculate nutritional totals
      const nutrition = meal.nutrition || {};
      const totalCarbs = nutrition.carbs || 0;
      const totalProtein = nutrition.protein || 0;
      const totalFat = nutrition.fat || 0;
      const totalCalories = nutrition.calories ||
        (totalCarbs * 4 + totalProtein * 4 + totalFat * 9);

      // Get protein factor and fat factor from patient constants for carb equivalents
      const proteinFactor = patientConstants?.protein_factor || 0.5;
      const fatFactor = patientConstants?.fat_factor || 0.2;

      // Calculate carb equivalents
      const proteinCarbEquiv = totalProtein * proteinFactor;
      const fatCarbEquiv = totalFat * fatFactor;
      const totalCarbEquiv = totalCarbs + proteinCarbEquiv + fatCarbEquiv;

      // Calculate nutritional distribution percentages
      const totalNutrients = totalCarbs + totalProtein + totalFat;
      const carbPercentage = totalNutrients > 0 ? Math.round((totalCarbs / totalNutrients) * 100) : 0;
      const proteinPercentage = totalNutrients > 0 ? Math.round((totalProtein / totalNutrients) * 100) : 0;
      const fatPercentage = totalNutrients > 0 ? Math.round((totalFat / totalNutrients) * 100) : 0;

      // Get absorption type
      const absorptionType = nutrition.absorption_type || 'medium';

      // Get calculation summary if available
      const calculationSummary = meal.calculation_summary || null;

      return {
        id: meal._id || meal.id,
        timestamp: mealTime.valueOf(),
        formattedTime,
        date: mealTime.format('YYYY-MM-DD'),
        time: mealTime.format('HH:mm'),
        mealType: meal.mealType || 'normal',
        foodItems: meal.foodItems || [],
        nutrition: {
          ...nutrition,
          totalCarbs,
          totalProtein,
          totalFat,
          totalCalories,
          carbPercentage,
          proteinPercentage,
          fatPercentage,
          absorptionType,
          totalCarbEquiv,
          proteinCarbEquiv,
          fatCarbEquiv
        },
        insulin: {
          dose: meal.insulin?.dose || 0,
          type: meal.insulin?.type || '',
          calculationFactors: meal.calculationFactors || {}
        },
        notes: meal.notes || '',
        calculation_summary: calculationSummary,
        bloodGlucose: meal.bloodGlucose || null,
        activities: meal.activities || []
      };
    }).sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending
  }, [patientConstants]);

  // Calculate meal effect for a specific meal
 const calculateMealEffect = useCallback((meal) => {
  if (!meal || !patientConstants) {
    console.log("Missing meal or patientConstants data");
    return [];
  }

  try {
    // Get absorption modifiers from constants
    const absorptionModifiers = patientConstants.absorption_modifiers || {
      very_fast: 1.4,
      fast: 1.2,
      medium: 1.0,
      slow: 0.8,
      very_slow: 0.6
    };

    // If TimeEffect utility isn't working properly, let's implement a simple version directly
    // This will generate a basic meal impact curve without relying on the TimeEffect utility
    const startTime = meal.timestamp;
    const results = [];

    // Get meal nutrition data
    const nutrition = meal.nutrition || {};
    const totalCarbEquiv = nutrition.totalCarbEquiv || nutrition.totalCarbs || 0;
    const absorptionType = nutrition.absorptionType || 'medium';
    const absorptionFactor = absorptionModifiers[absorptionType] || 1.0;

    // Define peak and duration based on meal composition and absorption type
    // Higher carb meals with faster absorption peak earlier
    const peakHour = absorptionType === 'fast' ? 1.0 :
                    absorptionType === 'slow' ? 2.0 : 1.5;
    const durationHours = Math.min(effectDurationHours, 6); // Cap at 6 hours

    // Generate points at 15-minute intervals
    for (let minute = 0; minute <= durationHours * 60; minute += 15) {
      const hoursSinceMeal = minute / 60;
      let impactValue = 0;

      // Calculate impact using a physiological model:
      // - Rise phase from start to peak (bell curve)
      // - Fall phase from peak to end (exponential decay)
      if (hoursSinceMeal <= peakHour) {
        // Rising phase (bell curve shape)
        impactValue = totalCarbEquiv * (hoursSinceMeal / peakHour) * Math.exp(1 - (hoursSinceMeal / peakHour));
      } else if (hoursSinceMeal <= durationHours) {
        // Falling phase (exponential decay)
        const decayRate = 1.0 / (durationHours - peakHour);
        impactValue = totalCarbEquiv * Math.exp(-(hoursSinceMeal - peakHour) * decayRate);
      }

      // Apply absorption factor
      impactValue *= absorptionFactor;

      // Timestamp for this point
      const timestamp = startTime + (minute * 60 * 1000);

      results.push({
        timestamp,
        hoursSinceMeal,
        impactValue: Math.max(0, impactValue / 30) // Scale down the impact values to a reasonable range
      });
    }

    console.log(`Generated ${results.length} effect points for meal:`,
      `${meal.mealType} with ${totalCarbEquiv}g carb equiv, absorption: ${absorptionType}`);

    return results;

  } catch (error) {
    console.error("Error calculating meal effect:", error);
    return [];
  }
}, [patientConstants, effectDurationHours]);

  const estimateBaseline = useCallback((timestamp, timelineData, target = 100) => {
  // If no timeline data, return target
  if (!timelineData || timelineData.length === 0) {
    return target;
  }

  const targetTime = new Date(timestamp).getTime();

  // Find closest actual readings before and after
  const actualReadings = timelineData.filter(point => point.isActualReading);

  if (actualReadings.length === 0) {
    return target;
  }

  // Sort readings by time distance from target
  const sortedByDistance = [...actualReadings].sort((a, b) => {
    const distA = Math.abs(a.timestamp - targetTime);
    const distB = Math.abs(b.timestamp - targetTime);
    return distA - distB;
  });

  // If there's a very close reading (within 15 minutes), use it
  if (Math.abs(sortedByDistance[0].timestamp - targetTime) < 15 * 60 * 1000) {
    return sortedByDistance[0].bloodSugar;
  }

  // Otherwise find before and after readings for interpolation
  const before = actualReadings
    .filter(reading => reading.timestamp <= targetTime)
    .sort((a, b) => b.timestamp - a.timestamp)[0];

  const after = actualReadings
    .filter(reading => reading.timestamp > targetTime)
    .sort((a, b) => a.timestamp - b.timestamp)[0];

  // If we have both before and after, interpolate
  if (before && after) {
    const totalTimeSpan = after.timestamp - before.timestamp;
    if (totalTimeSpan === 0) return before.bloodSugar;

    const ratio = (targetTime - before.timestamp) / totalTimeSpan;
    return before.bloodSugar + ratio * (after.bloodSugar - before.bloodSugar);
  }

  // If we only have one, use it
  if (before) return before.bloodSugar;
  if (after) return after.bloodSugar;

  // Fallback to target
  return target;
}, []);


 // Helper function to process blood glucose predictions
const processBloodGlucosePredictions = useCallback((timelineData, target) => {
  // Find points with actual readings
  const actualReadingPoints = timelineData.filter(point => point.isActualReading);

  if (actualReadingPoints.length === 0 && target) {
    // If no actual readings but we have a target, use target as baseline for all
    timelineData.forEach(point => {
      point.estimatedBloodSugar = target;

      // Apply meal effect to estimated blood sugar
      if (showMealEffect && point.totalMealEffect > 0) {
        const mealImpact = point.totalMealEffect * MEAL_IMPACT_FACTOR;
        point.bloodSugar = Math.max(MIN_SAFE_BLOOD_GLUCOSE, target + mealImpact);
      } else {
        point.bloodSugar = target;
      }
    });
    return;
  }

  // For each time point
  for (let i = 0; i < timelineData.length; i++) {
    const point = timelineData[i];

    // Skip if it's an actual reading
    if (point.isActualReading) continue;

    // Estimate baseline blood sugar for this point
    point.estimatedBloodSugar = estimateBaseline(point.timestamp, timelineData, target);

    // Apply meal effect to estimated blood sugar
    if (showMealEffect && point.totalMealEffect > 0) {
      const mealImpact = point.totalMealEffect * MEAL_IMPACT_FACTOR;
      point.bloodSugar = Math.max(MIN_SAFE_BLOOD_GLUCOSE, point.estimatedBloodSugar + mealImpact);
    } else {
      point.bloodSugar = point.estimatedBloodSugar;
    }
  }
}, [showMealEffect, estimateBaseline]);

  // Generate combined data for timeline visualization
  const generateCombinedData = useCallback((mealData, bloodGlucoseData) => {
  try {
    if (!mealData || !Array.isArray(mealData) || mealData.length === 0) {
      console.log("No meal data available");
      return [];
    }

    // Find the earliest and latest timestamps
    const allMealTimes = mealData.map(m => m.timestamp).filter(t => !isNaN(t) && t > 0);
    const allBGTimes = bloodGlucoseData
      .map(d => d.readingTime)
      .filter(t => !isNaN(t) && t > 0);

    const allTimestamps = [...allMealTimes, ...allBGTimes];
    if (allTimestamps.length === 0) {
      console.log("No valid timestamps found");
      return [];
    }

    let minTime = Math.min(...allTimestamps);
    let maxTime = Math.max(...allTimestamps);

    // If including future effects, extend the timeline
    if (includeFutureEffect) {
      const futureTime = TimeManager.getFutureProjectionTime(futureHours);
      maxTime = Math.max(maxTime, futureTime);
    }

    console.log(`Timeline range: ${new Date(minTime)} to ${new Date(maxTime)}`);

    // Create maps for quick lookups
    const actualReadingsMap = new Map();

    // Populate blood glucose readings map
    bloodGlucoseData.forEach(reading => {
      if (reading && reading.isActualReading && !isNaN(reading.readingTime)) {
        actualReadingsMap.set(reading.readingTime, reading);
      }
    });

    // Process meal effects for all meals
    console.log("Processing meal effects for", mealData.length, "meals");
    const mealEffects = mealData
      .filter(meal => meal && !isNaN(meal.timestamp) && meal.timestamp > 0)
      .map(meal => {
        const effects = calculateMealEffect(meal);
        return {
          meal,
          effects
        };
      });

    // Create a timeline using 15-minute intervals
    const timelineData = [];
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds
    let currentTime = minTime;

    // Generate the timeline
    while (currentTime <= maxTime) {
      // Get blood sugar data for this time point
      const bsReading = actualReadingsMap.get(currentTime);

      // Create the time point data structure
      const timePoint = {
        timestamp: currentTime,
        formattedTime: TimeManager.formatDate(currentTime, TimeManager.formats.DATETIME_DISPLAY),
        meals: [],
        mealEffects: {},
        totalMealEffect: 0,
        bloodSugar: bsReading?.bloodSugar,
        isActualReading: bsReading?.isActualReading || false
      };

      // Add meals that occurred at this time point
      mealData.forEach(meal => {
        // Check if meal occurred within 15 minutes of this time point
        if (meal && !isNaN(meal.timestamp) && Math.abs(meal.timestamp - currentTime) < interval / 2) {
          // Add meal to the meals array for tooltip display
          timePoint.meals.push({
            id: meal.id,
            mealType: meal.mealType,
            carbs: meal.nutrition?.totalCarbs || 0,
            protein: meal.nutrition?.totalProtein || 0,
            fat: meal.nutrition?.totalFat || 0,
            totalCarbEquiv: meal.nutrition?.totalCarbEquiv || 0
          });

          // Create a property like "mealCarbs.123" where 123 is the meal ID
          if (meal.id) {
            timePoint[`mealCarbs.${meal.id}`] = meal.nutrition?.totalCarbs || 0;
          }
        }
      });

      // Calculate combined meal effects at this time point
      mealEffects.forEach(({ meal, effects }) => {
        if (!Array.isArray(effects)) {
          console.warn(`Invalid effects array for meal:`, meal);
          return;
        }

        // Find effect at this time point
        const effect = effects.find(e => Math.abs(e.timestamp - currentTime) < interval / 2);
        if (effect && !isNaN(effect.impactValue) && effect.impactValue > 0) {
          const mealId = meal.id;
          if (mealId) {
            timePoint.mealEffects[mealId] = effect.impactValue;
            timePoint[`mealEffect.${mealId}`] = effect.impactValue;

            // Track total effect
            timePoint.totalMealEffect += effect.impactValue;
          }
        }
      });

      // Validate totalMealEffect
      if (isNaN(timePoint.totalMealEffect)) {
        console.warn("NaN totalMealEffect detected at", timePoint.formattedTime);
        timePoint.totalMealEffect = 0;
      }

      // Add the time point to timeline data
      timelineData.push(timePoint);
      currentTime += interval;
    }

    // Process time points to calculate blood glucose predictions where missing
    processBloodGlucosePredictions(timelineData, targetGlucose);

    console.log("Generated", timelineData.length, "timeline data points");
    return timelineData;
  } catch (error) {
    console.error('Error generating combined data:', error);
    return [];
  }
}, [calculateMealEffect, targetGlucose, includeFutureEffect, futureHours, estimateBaseline]);

  // Helper function to process blood glucose predictions


  // Fetch meal and blood sugar data
  const fetchData = useCallback(async () => {
  try {
    setLoading(true);
    setIsFetching(true);
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Get time settings from TimeContext
    const timeSettings = timeContext && timeContext.getAPITimeSettings
      ? timeContext.getAPITimeSettings()
      : {
          startDate: timeContext ? timeContext.dateRange.start : localDateRange.start,
          endDate: moment(timeContext ? timeContext.dateRange.end : localDateRange.end)
            .add(includeFutureEffect ? futureHours : 0, 'hours')
            .format('YYYY-MM-DD')
        };

    console.log("Fetching meal data for date range:", timeSettings);

    // Use the meals-only API endpoint
    const endpoint = patientId
      ? `http://localhost:5000/api/patient/${patientId}/meals-only`
      : 'http://localhost:5000/api/meals-only';

    const mealsResponse = await axios.get(
      `${endpoint}?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Log API response to debug
    console.log("Meals API response:", mealsResponse.data);

    // Process meal data
    if (mealsResponse.data && Array.isArray(mealsResponse.data.meals)) {
      const processedMeals = processMealData(mealsResponse.data.meals);
      console.log("Processed meals:", processedMeals.length);
      setMeals(processedMeals);
      setFilteredMeals(processedMeals);

      // Filter blood sugar data to match our date range
      let filteredBloodSugar = [];
      if (bloodSugarData && bloodSugarData.length > 0) {
        filteredBloodSugar = getFilteredData(bloodSugarData);
        console.log("Filtered blood sugar readings:", filteredBloodSugar.length);
      }

      // Generate combined data
      const combinedResult = generateCombinedData(processedMeals, filteredBloodSugar);
      console.log("Combined data points:", combinedResult.length);

      // Debug check for meal effects
      const pointsWithMealEffects = combinedResult.filter(p => p.totalMealEffect > 0);
      console.log("Points with meal effects:", pointsWithMealEffects.length);
      if (pointsWithMealEffects.length > 0) {
        console.log("Sample effect point:", pointsWithMealEffects[0]);
      } else {
        console.warn("No meal effect points found!");
      }

      setCombinedData(combinedResult);
      setError('');

      // Call the onDataLoaded callback if provided
      if (onDataLoaded && typeof onDataLoaded === 'function') {
        onDataLoaded(processedMeals);
      }
    } else {
      console.error('Invalid response structure:', mealsResponse.data);
      setError('Invalid data format received from server');
      setMeals([]);
      setFilteredMeals([]);
    }

  } catch (error) {
    console.error('Error fetching meal data:', error);
    setError('Failed to load meal data. Please try again.');
  } finally {
    setLoading(false);
    setIsFetching(false);

    // Update the last fetched date range
    if (timeContext) {
      lastFetchedDateRange.current = {
        start: timeContext.dateRange.start,
        end: timeContext.dateRange.end
      };
    }
  }
}, [timeContext, includeFutureEffect, futureHours, patientId, processMealData,
    getFilteredData, generateCombinedData, bloodSugarData, onDataLoaded]);

  const debouncedFetchData = useCallback(
    debounce(() => {
      fetchData();
    }, 500),
    [fetchData]
  );

  // Effect to fetch data once when component mounts and when necessary params change
  useEffect(() => {
    // Only fetch if we haven't fetched yet or if the date range changes
    if (!didFetchRef.current ||
        (timeContext?.dateRange?.start && timeContext?.dateRange?.end)) {
      debouncedFetchData();
      didFetchRef.current = true;
    }
  }, [debouncedFetchData, timeContext?.dateRange]);

  // Regenerate combined data when blood sugar data changes
  useEffect(() => {
    if (didFetchRef.current && bloodSugarData && bloodSugarData.length > 0 && filteredMeals.length > 0) {
      const filteredData = getFilteredData(bloodSugarData);
      if (filteredData.length > 0) {
        console.log("Regenerating combined data with updated blood sugar data");
        const combinedResult = generateCombinedData(filteredMeals, filteredData);
        setCombinedData(combinedResult);
      }
    }
  }, [bloodSugarData, getFilteredData, filteredMeals, generateCombinedData]);

  // Apply filters to the meal data
  const applyFilters = useCallback((mealsToFilter, mealTypeValue) => {
    if (!Array.isArray(mealsToFilter)) {
      console.error('applyFilters received non-array data:', mealsToFilter);
      setFilteredMeals([]);
      return;
    }

    let result = [...mealsToFilter];

    // Filter by meal type if not set to 'all'
    if (mealTypeValue !== 'all') {
      result = result.filter(meal => meal.mealType === mealTypeValue);
    }

    // Apply any sorting
    result = sortMeals(result, sortConfig);

    setFilteredMeals(result);
  }, [sortConfig]);

  // Sort meals based on current sort configuration
  const sortMeals = useCallback((mealsToSort, config) => {
    return [...mealsToSort].sort((a, b) => {
      if (a[config.key] < b[config.key]) {
        return config.direction === 'asc' ? -1 : 1;
      }
      if (a[config.key] > b[config.key]) {
        return config.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, []);

  // Handler functions
  const handleDateRangeChange = useCallback((newRange) => {
    if (timeContext) {
      timeContext.setDateRange(newRange);
    } else {
      setLocalDateRange(newRange);
    }
  }, [timeContext]);

  const handleMealTypeChange = useCallback((e) => {
    const newMealType = e.target.value;
    setMealTypeFilter(newMealType);
    applyFilters(meals, newMealType);
  }, [meals, applyFilters]);

  const handleChartTypeChange = useCallback((type) => {
    setChartType(type);
  }, []);

  const handleViewChange = useCallback((view) => {
    setActiveView(view);
  }, []);
    // Format X-axis labels for charts
  const formatXAxis = useCallback((timestamp) => {
    return moment(timestamp).format('MM/DD HH:mm');
  }, []);

  // Get color for meal types
  const getMealTypeColor = useCallback((mealType) => {
    const colorMap = {
      'breakfast': '#8884d8',
      'lunch': '#82ca9d',
      'dinner': '#ff7300',
      'snack': '#ffc658',
      'normal': '#8884d8'
    };
    return colorMap[mealType] || '#8884d8';
  }, []);

  // Custom meal effect tooltip
  const CustomMealTooltip = useCallback(({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    // Validate all critical data values
    const bloodSugar = !isNaN(data.bloodSugar) ? Math.round(data.bloodSugar) : 'N/A';
    const estimatedBS = !isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A';
    const mealImpact = data.totalMealEffect && !isNaN(data.totalMealEffect)
      ? Math.round(data.totalMealEffect * MEAL_IMPACT_FACTOR)
      : 0;

    return (
      <div className="meal-effect-tooltip">
        <p className="tooltip-time">{data.formattedTime}</p>

        {/* Meals at this time point */}
        {data.meals && data.meals.length > 0 && (
          <div className="tooltip-section">
            <h4>Meals:</h4>
            {data.meals.map((meal, idx) => (
              <div key={idx} className="tooltip-meal">
                <p><strong>{meal.mealType?.charAt(0).toUpperCase() + meal.mealType?.slice(1) || 'Unknown'}</strong></p>
                <p>Carbs: {!isNaN(meal.carbs) ? meal.carbs.toFixed(1) : '0'}g</p>
                <p>Protein: {!isNaN(meal.protein) ? meal.protein.toFixed(1) : '0'}g</p>
                <p>Fat: {!isNaN(meal.fat) ? meal.fat.toFixed(1) : '0'}g</p>
                <p className="tooltip-total-carbs">
                  Total Carb Equiv.: {!isNaN(meal.totalCarbEquiv) ? meal.totalCarbEquiv.toFixed(1) : '0'}g
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Blood glucose information */}
        <div className="tooltip-section">
          <h4>Blood Glucose:</h4>
          {data.isActualReading ? (
            <p>Measured: <strong>{bloodSugar} mg/dL</strong></p>
          ) : (
            <>
              <p>Estimated baseline: {estimatedBS} mg/dL</p>
              {data.totalMealEffect > 0 && (
                <p>Meal impact: +{mealImpact} mg/dL</p>
              )}
              <p>Projected: <strong>{bloodSugar} mg/dL</strong></p>
            </>
          )}
        </div>

        {/* Meal effects details */}
        {data.mealEffects && Object.keys(data.mealEffects).length > 0 && (
          <div className="tooltip-section">
            <h4>Active Meal Effects:</h4>
            {Object.entries(data.mealEffects).map(([mealId, effect], idx) => (
              <p key={idx} className="tooltip-meal-effect">
                Meal {idx+1}: Impact {!isNaN(effect) ? effect.toFixed(1) : '0'} units
              </p>
            ))}
            <p className="tooltip-total-effect">
              Total effect: {!isNaN(data.totalMealEffect) ? data.totalMealEffect.toFixed(1) : '0'} units
            </p>
          </div>
        )}
      </div>
    );
  }
  return null;
}, []);

  // Custom dot for blood sugar readings on chart
  const CustomBloodSugarDot = useCallback((props) => {
    const { cx, cy, stroke, payload } = props;

    // Only render visible dots for actual readings
    if (!payload.isActualReading) return null;

    // Determine color based on blood sugar level
    let dotColor = '#00C851'; // Default green for normal

    if (payload.bloodSugar < targetGlucose * 0.7) {
      dotColor = '#ff4444'; // Red for low
    } else if (payload.bloodSugar > targetGlucose * 1.3) {
      dotColor = '#ff8800'; // Orange for high
    }

    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        stroke={dotColor}
        strokeWidth={2}
        fill="#ffffff"
      />
    );
  }, [targetGlucose]);

  // Check if current time is within chart range
  const currentTimeInRange = TimeManager.isTimeInRange(
    new Date().getTime(),
    timeScale.start,
    timeScale.end
  );

  // Helper function to get consistent colors for meal types
  const getMealColor = useCallback((mealType, isEffect = false) => {
    // Color scheme based on meal type
    const colorMap = {
      'breakfast': '#8884d8', // Purple
      'lunch': '#82ca9d',     // Green
      'dinner': '#ff7300',    // Orange
      'snack': '#ffc658',     // Yellow
      'normal': '#8884d8'     // Purple
    };

    const baseColor = colorMap[mealType] || '#8884d8'; // Default to purple

    if (isEffect) {
      // For effect lines, use a slightly different shade
      return adjustColorBrightness(baseColor, -15);
    }

    return baseColor;
  }, []);

  // Helper function to adjust color brightness
  const adjustColorBrightness = (hex, percent) => {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };
const formatLegendText = useCallback((value) => {
  // Filter out activity_only entries
  if (value && value.includes('activity_only')) {
    return null; // Return null to exclude this item from legend
  }

  // Format meal entries properly
  if (value.includes('meal-') || value === 'Blood Sugar' || value === 'Total Meal Effect') {
    return value; // Keep standard entries
  }

  // For meal entries with timestamps, make them cleaner
  if (value.includes('breakfast') || value.includes('lunch') ||
      value.includes('dinner') || value.includes('snack')) {
    // Get just the meal type without timestamp
    const mealType = value.split(' (')[0];
    return mealType.charAt(0).toUpperCase() + mealType.slice(1);
  }

  return value;
}, []);

  // Render chart based on current chart type
const renderMealEffectChart = () => (
  <ResponsiveContainer width="100%" height={500}>
    <ComposedChart
      data={combinedData}
      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="timestamp"
        type="number"
        scale="time"
        domain={[timeScale.start, timeScale.end]}
        ticks={timeContext ? timeContext.generateTimeTicks() : []}
        tickFormatter={formatXAxis}
        angle={-45}
        textAnchor="end"
        height={70}
      />

      {/* Y-axis for blood sugar */}
      {showBloodSugar && (
        <YAxis
          yAxisId="bloodSugar"
          orientation="left"
          domain={['dataMin - 20', 'dataMax + 20']}
          tickFormatter={(value) => Math.round(value)}
          label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
        />
      )}

      {/* Y-axis for meal carbs */}
      {(viewMode === 'combined' || viewMode === 'meals') && (
        <YAxis
          yAxisId="mealCarbs"
          orientation={showBloodSugar ? "right" : "left"}
          domain={[0, 'dataMax + 10']}
          label={{
            value: 'Carbohydrates (g)',
            angle: -90,
            position: showBloodSugar ? 'insideRight' : 'insideLeft'
          }}
        />
      )}

      {/* Y-axis for meal effect - ADJUST DOMAIN to make effects more visible */}
      {(viewMode === 'combined' || viewMode === 'effect') && showMealEffect && (
        <YAxis
          yAxisId="mealEffect"
          orientation="right"
          domain={[0, 2]} // Fixed domain to make small effects more visible
          label={{ value: 'Meal Effect (units)', angle: -90, position: 'insideRight' }}
        />
      )}

      <Tooltip content={<CustomMealTooltip />} />
<Legend
  formatter={formatLegendText}
  payload={
    // Filter out activity_only items from legend
    combinedData.length > 0 ?
      Object.keys(combinedData[0])
        .filter(key => !key.includes('activity_only'))
        .map(key => ({
          value: key,
          type: key.includes('meal') ? 'square' : 'line',
          color: key === 'bloodSugar' ? '#8031A7' :
                 key === 'totalMealEffect' ? '#82ca9d' :
                 getMealColor(key.split('.')[1])
        }))
      : []
  }
/>
      {/* Target glucose reference line */}
      {showBloodSugar && (
        <ReferenceLine
          y={targetGlucose}
          yAxisId="bloodSugar"
          label="Target"
          stroke="#FF7300"
          strokeDasharray="3 3"
        />
      )}

      {/* Blood Sugar Line */}
      {showBloodSugar && (
        <Line
          yAxisId="bloodSugar"
          type="monotone"
          dataKey="bloodSugar"
          name="Blood Sugar"
          stroke="#8031A7"
          dot={CustomBloodSugarDot}
          activeDot={{ r: 8 }}
          connectNulls
        />
      )}

      {/* Meal Bars */}
      {(viewMode === 'combined' || viewMode === 'meals') && showMeals && filteredMeals.map(meal => (
        <Bar
          key={`meal-${meal.id}`}
          yAxisId="mealCarbs"
          dataKey={`mealCarbs.${meal.id}`}
          name={`${meal.mealType} (${meal.formattedTime})`}
          fill={getMealColor(meal.mealType)}
          barSize={20}
        />
      ))}

      {/* Meal Effect Area - EXPLICITLY LOG VALUES FOR DEBUGGING */}
      {(viewMode === 'combined' || viewMode === 'effect') && showMealEffect && (
        <>
          {console.log("Meal effect data check:", combinedData.filter(d => d.totalMealEffect > 0).map(d =>
            ({time: d.formattedTime, effect: d.totalMealEffect})))}
          <Area
            yAxisId="mealEffect"
            type="monotone"
            dataKey="totalMealEffect"
            name="Total Meal Effect"
            fill="#82ca9d"
            stroke="#82ca9d"
            fillOpacity={0.3}
            isAnimationActive={false}
          />
        </>
      )}

      {/* Current time reference line */}
      {currentTimeInRange && (
        <ReferenceLine
          x={new Date().getTime()}
          yAxisId={showBloodSugar ? "bloodSugar" : "mealCarbs"}
          stroke="#ff0000"
          strokeWidth={2}
          label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
        />
      )}
    </ComposedChart>
  </ResponsiveContainer>
);

  // Render nutrition distribution chart
  const renderNutritionChart = () => (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        data={filteredMeals}
        margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
        dataKey="timestamp"
        type="number"
        scale="time"
        domain={[timeScale.start, timeScale.end]}
        ticks={timeContext ? timeContext.generateTimeTicks() : []}
        tickFormatter={formatXAxis}
        angle={-45}
        textAnchor="end"
        height={70}
      />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="nutrition.totalCarbs" name="Carbs (g)" fill="#8884d8" stackId="nutrition" />
        <Bar dataKey="nutrition.proteinCarbEquiv" name={`Protein as Carbs (${patientConstants?.protein_factor || 0.5}x)`} fill="#82ca9d" stackId="nutrition" />
        <Bar dataKey="nutrition.fatCarbEquiv" name={`Fat as Carbs (${patientConstants?.fat_factor || 0.2}x)`} fill="#ffc658" stackId="nutrition" />
      </BarChart>
    </ResponsiveContainer>
  );

  // Create table columns definition
  const columns = useMemo(
    () => [
      {
        Header: 'Date & Time',
        accessor: 'formattedTime',
        Cell: ({ value }) => <span className="meal-date">{value}</span>,
      },
      {
        Header: 'Meal Type',
        accessor: 'mealType',
        Cell: ({ value }) => (
          <span className={`meal-type ${value}`}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </span>
        ),
      },
      {
        Header: 'Carbs (g)',
        accessor: row => row.nutrition.totalCarbs,
        id: 'carbs',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Protein (g)',
        accessor: row => row.nutrition.totalProtein,
        id: 'protein',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Fat (g)',
        accessor: row => row.nutrition.totalFat,
        id: 'fat',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Carb Equivalent',
        accessor: row => row.nutrition.totalCarbEquiv,
        id: 'carbEquivalent',
        Cell: ({ value }) => <span>{value.toFixed(1)}g</span>,
      },
      {
        Header: 'Absorption',
        accessor: row => row.nutrition.absorptionType,
        id: 'absorption',
        Cell: ({ value }) => <span>{value}</span>,
      },
      {
        Header: 'Actions',
        Cell: ({ row }) => (
          <button
            className="view-details-btn"
            onClick={() => setDetailView(row.original)}
          >
            View Details
          </button>
        ),
      },
    ],
    [setDetailView]
  );

  // Set up React Table
  const tableInstance = useTable(
    {
      columns,
      data: filteredMeals,
      initialState: { pageIndex: 0, pageSize: 10 },
    },
    useSortBy,
    usePagination
  );

  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    page,
    prepareRow,
    canPreviousPage,
    canNextPage,
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = tableInstance;

  // Render meal detail view
  const renderMealDetail = () => {
    if (!detailView) return <div className="no-detail-message">Select a meal to view details</div>;

    // Calculate carb equivalents for the detail view
    const carbs = detailView.nutrition.totalCarbs;
    const protein = detailView.nutrition.totalProtein;
    const fat = detailView.nutrition.totalFat;
    const proteinFactor = patientConstants?.protein_factor || 0.5;
    const fatFactor = patientConstants?.fat_factor || 0.2;
    const proteinCarbEquiv = protein * proteinFactor;
    const fatCarbEquiv = fat * fatFactor;
    const totalCarbEquiv = carbs + proteinCarbEquiv + fatCarbEquiv;

    // Get meal effect projection
    const mealEffects = calculateMealEffect(detailView);

    return (
      <div className="meal-detail-view">
        <h3>Meal Details</h3>
        <div className="meal-detail-header">
          <div className="meal-time">
            <span className="label">Time:</span>
            <span className="value">{detailView.formattedTime}</span>
          </div>
          <div className="meal-type">
            <span className="label">Type:</span>
            <span className={`value ${detailView.mealType}`}>
              {detailView.mealType.charAt(0).toUpperCase() + detailView.mealType.slice(1)}
            </span>
          </div>
        </div>

        <div className="meal-nutrition-summary">
          <h4>Nutrition Summary</h4>
          <div className="nutrition-grid">
            <div className="nutrition-item">
              <span className="label">Carbs:</span>
              <span className="value">{detailView.nutrition.totalCarbs.toFixed(1)}g</span>
              <div className="percentage-bar">
                <div
                  className="percentage-fill carbs"
                  style={{ width: `${detailView.nutrition.carbPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.carbPercentage}%</span>
            </div>

            <div className="nutrition-item">
              <span className="label">Protein:</span>
              <span className="value">
                {detailView.nutrition.totalProtein.toFixed(1)}g
                <span className="carb-equivalent">
                  (={proteinCarbEquiv.toFixed(1)}g carb equiv.)
                </span>
              </span>
              <div className="percentage-bar">
                <div
                  className="percentage-fill protein"
                  style={{ width: `${detailView.nutrition.proteinPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.proteinPercentage}%</span>
            </div>

            <div className="nutrition-item">
              <span className="label">Fat:</span>
              <span className="value">
                {detailView.nutrition.totalFat.toFixed(1)}g
                <span className="carb-equivalent">
                  (={fatCarbEquiv.toFixed(1)}g carb equiv.)
                </span>
              </span>
              <div className="percentage-bar">
                <div
                  className="percentage-fill fat"
                  style={{ width: `${detailView.nutrition.fatPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.fatPercentage}%</span>
            </div>

            <div className="nutrition-item">
              <span className="label">Total Carb Equivalent:</span>
              <span className="value total-carb-equivalent">{totalCarbEquiv.toFixed(1)}g</span>
            </div>

            <div className="nutrition-item">
              <span className="label">Absorption Type:</span>
              <span className="value">{detailView.nutrition.absorptionType || 'medium'}</span>
            </div>
          </div>
        </div>

        {/* NEW: Meal Effect Visualization */}
        {mealEffects && mealEffects.length > 0 && (
          <div className="meal-effect-visualization">
            <h4>Blood Glucose Impact Projection</h4>
            <div className="effect-chart-container" style={{ height: "200px", width: "100%" }}>
              <ResponsiveContainer>
                <LineChart
                  data={mealEffects}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hoursSinceMeal"
                    label={{ value: 'Hours After Meal', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis
                    label={{ value: 'Impact Value', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value.toFixed(1)} units`, 'Impact']}
                    labelFormatter={(value) => `${value.toFixed(1)} hours after meal`}
                  />
                  <Line
                    type="monotone"
                    dataKey="impactValue"
                    name="Blood Glucose Impact"
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                  />
                  <ReferenceLine
                    x={detailView.nutrition.peak || 1}
                    stroke="red"
                    label={{ value: 'Peak', position: 'top' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="effect-info">
              <p>
                <strong>Peak Effect:</strong> At {(detailView.nutrition.peak || 1).toFixed(1)} hours
                after meal
              </p>
              <p>
                <strong>Duration:</strong> Effects last approximately {(detailView.nutrition.duration || 3).toFixed(1)} hours
              </p>
              <p>
                <strong>Absorption Type:</strong> {detailView.nutrition.absorptionType || 'Medium'} ({
                  detailView.nutrition.absorptionType === 'fast' ? 'Effects appear quickly but don\'t last as long' :
                  detailView.nutrition.absorptionType === 'slow' ? 'Effects appear gradually but last longer' :
                  'Balanced absorption rate'
                })
              </p>
            </div>
          </div>
        )}

        {detailView.foodItems.length > 0 && (
          <div className="meal-food-items">
            <h4>Food Items</h4>
            <table className="food-items-table">
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Amount</th>
                  <th>Unit</th>
                  <th>Carbs (g)</th>
                  <th>Protein (g)</th>
                  <th>Fat (g)</th>
                  <th>Calories</th>
                </tr>
              </thead>
              <tbody>
                {detailView.foodItems.map((item, index) => (
                  <tr key={index}>
                    <td>{item.name}</td>
                    <td>{item.portion?.amount || 1}</td>
                    <td>{item.portion?.unit || 'serving'}</td>
                    <td>{item.details?.carbs?.toFixed(1) || '0'}</td>
                    <td>{item.details?.protein?.toFixed(1) || '0'}</td>
                    <td>{item.details?.fat?.toFixed(1) || '0'}</td>
                    <td>{Math.round(item.details?.calories) || '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="detail-actions">
          <button className="back-button" onClick={() => setActiveView('table')}>
            Back to List
          </button>
        </div>
      </div>
    );
  };

  // Main render function
  if (loading && !filteredMeals.length) {
    return <div className="loading">Loading meal data...</div>;
  }

  return (
    <div className={`meal-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Meal Impact Visualization</h2>}

      {/* Timezone info display */}
      {!embedded && (
        <div className="timezone-info">
          Your timezone: {userTimeZone}
          <span className="timezone-note"> (all times displayed in your local timezone)</span>
        </div>
      )}

      {/* View mode toggle */}
      <div className="view-toggle">
        <button
          className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
          onClick={() => handleViewChange('chart')}
        >
          <FaChartBar /> Chart
        </button>
        <button
          className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
          onClick={() => handleViewChange('table')}
        >
          <FaTable /> Table
        </button>
        <button
          className={`toggle-btn ${activeView === 'details' ? 'active' : ''}`}
          onClick={() => handleViewChange('details')}
        >
          <FaList /> Details
        </button>
      </div>

      {activeView === 'chart' && (
  <div className="view-mode-toggle">
    <button
      className={`toggle-btn ${viewMode === 'combined' ? 'active' : ''}`}
      onClick={() => setViewMode('combined')}
    >
      Combined View
    </button>
    <button
      className={`toggle-btn ${viewMode === 'meals' ? 'active' : ''}`}
      onClick={() => setViewMode('meals')}
    >
      Meals Only
    </button>
    <button
      className={`toggle-btn ${viewMode === 'effect' ? 'active' : ''}`}
      onClick={() => setViewMode('effect')}
    >
      Meal Effect
    </button>
  </div>
)}

      {showControls && (
        <div className="controls">
          {/* Date range controls */}
          <div className="date-controls">
            <div className="date-range-inputs">
              <TimeInput
                mode="daterange"
                value={dateRange}
                onChange={handleDateRangeChange}
                useTimeContext={!!timeContext}
                showPresets={false}
              />
            </div>

            <div className="quick-ranges">
              <button onClick={() => timeContext.applyDatePreset(1)}>
                <FaCalendarAlt /> Today
              </button>
              <button onClick={() => timeContext.applyDatePreset(7)}>
                <FaCalendarAlt /> Week
              </button>
              <button onClick={() => timeContext.applyDatePreset(30)}>
                <FaCalendarAlt /> Month
              </button>
            </div>
          </div>

          {/* Filter controls */}
          <div className="filter-controls">
            <div className="meal-type-filter">
              <label htmlFor="meal-type-select">
                <FaFilter /> Meal Type:
              </label>
              <select
                id="meal-type-select"
                value={mealTypeFilter}
                onChange={handleMealTypeChange}
              >
                <option value="all">All Types</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="normal">Normal</option>
              </select>
            </div>

            <button
              className={`update-btn ${isFetching ? 'loading' : ''}`}
              onClick={fetchData}
              disabled={loading || isFetching}
            >
              <FaSync className={isFetching ? "spin" : ""} />
              {isFetching ? 'Updating...' : 'Update Data'}
            </button>
          </div>

          {/* Chart type toggle (only shown in chart view) */}
          {activeView === 'chart' && (
            <>
              <div className="chart-type-controls">
                <button
                  className={`chart-type-btn ${chartType === 'mealEffect' ? 'active' : ''}`}
                  onClick={() => handleChartTypeChange('mealEffect')}
                >
                  Meal Effect
                </button>
                <button
                  className={`chart-type-btn ${chartType === 'nutrition' ? 'active' : ''}`}
                  onClick={() => handleChartTypeChange('nutrition')}
                >
                  Nutrition Distribution
                </button>
              </div>

              {/* Display options */}
              <div className="display-options">
                <label className="display-option">
                  <input
                    type="checkbox"
                    checked={showMeals}
                    onChange={() => setShowMeals(!showMeals)}
                  />
                  Show Meals
                </label>
                <label className="display-option">
                  <input
                    type="checkbox"
                    checked={showMealEffect}
                    onChange={() => setShowMealEffect(!showMealEffect)}
                  />
                  Show Meal Effect
                </label>
                <label className="display-option">
                  <input
                    type="checkbox"
                    checked={showBloodSugar}
                    onChange={() => setShowBloodSugar(!showBloodSugar)}
                  />
                  Show Blood Sugar
                </label>
                <label className="display-option">
                  <input
                    type="checkbox"
                    checked={includeFutureEffect}
                    onChange={toggleFutureEffect}
                  />
                  Project Future Effect
                </label>
                {includeFutureEffect && (
                  <div className="future-hours">
                    <label>Future Hours:</label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={futureHours}
                      onChange={(e) => setFutureHours(parseInt(e.target.value) || 7)}
                    />
                  </div>
                )}
                <div className="effect-duration">
                  <label>Effect Duration (hours):</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={effectDurationHours}
                    onChange={(e) => setEffectDurationHours(parseInt(e.target.value) || 6)}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {!loading && filteredMeals.length === 0 ? (
        <div className="no-data-message">
          No meals found for the selected date range and filters.
        </div>
      ) : (
        <div className="content-container">
          {activeView === 'chart' && (
            <div className="chart-container" ref={chartRef}>
              {/* Carb equivalent explanation */}
              <div className="carb-equivalent-info">
                <button
                  className="info-button"
                  onClick={() => setShowFactorInfo(!showFactorInfo)}
                >
                  <FaInfoCircle /> About Meal Effects
                </button>

                {showFactorInfo && (
                  <div className="info-panel">
                    <h4>Meal Effect Visualization Explained</h4>
                    <p>
                      This chart shows how your meals impact blood glucose over time:
                    </p>
                    <ul>
                      <li><strong>Bars:</strong> Represent meal carbohydrate content</li>
                      <li><strong>Blue area:</strong> Shows the meal's projected effect on blood glucose</li>
                      <li><strong>Purple line:</strong> Blood glucose values (actual readings shown as dots)</li>
                    </ul>
                    <p>
                      Meal effects are calculated based on carbohydrates, protein, fat, and absorption type.
                      Protein and fat are converted to "carbohydrate equivalents" using your personalized factors:
                    </p>
                    <ul>
                      <li><strong>Protein:</strong> 1g protein = {patientConstants?.protein_factor || 0.5}g carbohydrate equivalent</li>
                      <li><strong>Fat:</strong> 1g fat = {patientConstants?.fat_factor || 0.2}g carbohydrate equivalent</li>
                    </ul>
                    <button
                      className="close-button"
                      onClick={() => setShowFactorInfo(false)}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>

              {chartType === 'mealEffect' && renderMealEffectChart()}
              {chartType === 'nutrition' && renderNutritionChart()}
            </div>
          )}

          {activeView === 'table' && (
            <div className="table-container">
              <table {...getTableProps()} className="meal-table">
                <thead>
                  {headerGroups.map((headerGroup, i) => {
                    const { key, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
                    return (
                      <tr key={`header-group-${i}`} {...headerGroupProps}>
                        {headerGroup.headers.map((column, j) => {
                          const { key, ...columnProps } = column.getHeaderProps(column.getSortByToggleProps());
                          return (
                            <th key={`header-${i}-${j}`} {...columnProps}>
                              {column.render('Header')}
                              <span>
                                {column.isSorted
                                  ? column.isSortedDesc
                                    ? ' 🔽'
                                    : ' 🔼'
                                  : ''}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    );
                  })}
                </thead>
                <tbody {...getTableBodyProps()}>
                  {page.map((row, i) => {
                    prepareRow(row);
                    const { key, ...rowProps } = row.getRowProps();
                    return (
                      <tr
                        key={`row-${i}`}
                        {...rowProps}
                        className={`meal-row meal-type-${row.original.mealType}`}
                      >
                        {row.cells.map((cell, j) => {
                          const { key, ...cellProps } = cell.getCellProps();
                          return (
                            <td key={`cell-${i}-${j}`} {...cellProps}>
                              {cell.render('Cell')}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination">
                <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
                <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
                <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
                <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
                <span>
                  Page{' '}
                  <strong>
                    {pageIndex + 1} of {Math.max(1, pageCount)}
                  </strong>
                </span>
                <span>
                  | Go to page:{' '}
                  <input
                    type="number"
                    defaultValue={pageIndex + 1}
                    onChange={e => {
                      const page = e.target.value ? Number(e.target.value) - 1 : 0;
                      gotoPage(page);
                    }}
                  />
                </span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                  }}
                >
                  {[10, 20, 30, 40, 50].map(size => (
                    <option key={size} value={size}>
                      Show {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeView === 'details' && (
            <div className="detail-container">
              {renderMealDetail()}
            </div>
          )}
        </div>
      )}

      {/* Statistics summary - shown at bottom of all views when data is available */}
      {!loading && filteredMeals.length > 0 && (
        <div className="meal-statistics">
          <h3>Meal Impact Summary</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Meals:</span>
              <span className="stat-value">{filteredMeals.length}</span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Avg. Carbs:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + meal.nutrition.totalCarbs, 0) / filteredMeals.length).toFixed(1)}g
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Avg. Carb Equivalent:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + (meal.nutrition.totalCarbEquiv || 0), 0) / filteredMeals.length).toFixed(1)}g
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Average Peak Time:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => {
                  // Calculate estimated peak time based on meal composition
                  const carbs = meal.nutrition.totalCarbs;
                  const protein = meal.nutrition.totalProtein;
                  const fat = meal.nutrition.totalFat;
                  const total = carbs + protein + fat;

                  // Higher carb meals peak faster
                  const carbRatio = total > 0 ? carbs / total : 0.5;
                  const basePeak = 0.5 + ((1 - carbRatio) * 0.5);

                  // Adjust for absorption type
                  const absorptionType = meal.nutrition.absorptionType || 'medium';
                  const absorptionFactor = absorptionType === 'fast' ? 1.2 :
                                          absorptionType === 'slow' ? 0.8 : 1.0;

                  return sum + (basePeak / absorptionFactor);
                }, 0) / filteredMeals.length).toFixed(1)} hours
              </span>
            </div>

            <div className="stat-item">
              <span className="stat-label">Average Effect Duration:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => {
                  const fat = meal.nutrition.totalFat;
                  const protein = meal.nutrition.totalProtein;

                  // Higher fat/protein extends duration
                  const baseDuration = 2 + (fat * 0.02) + (protein * 0.01);

                  // Adjust for absorption type
                  const absorptionType = meal.nutrition.absorptionType || 'medium';
                  const absorptionFactor = absorptionType === 'fast' ? 1.2 :
                                          absorptionType === 'slow' ? 0.8 : 1.0;

                  return sum + (baseDuration / absorptionFactor);
                }, 0) / filteredMeals.length).toFixed(1)} hours
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealVisualization;