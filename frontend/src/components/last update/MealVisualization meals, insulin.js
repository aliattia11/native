import React, { useState, useEffect, useCallback, useMemo, useContext, useRef } from 'react';
import axios from 'axios';
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
  ReferenceLine
} from 'recharts';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import TimeManager from '../utils/TimeManager';
import TimeEffect from '../utils/TimeEffect';
import TimeContext from '../contexts/TimeContext';
import {
  calculateMealEffect,
  generateMealTimelineData,
  prepareChartData,
  calculateCarbEquivalents,
  applyDatePreset
} from '../utils/BG_Effect';
// Import insulin utilities
import {
  calculateInsulinEffect,
  calculateBgImpactFromInsulin,
  generateInsulinTimelineData
} from '../utils/InsulinEffect';
import { formatInsulinName } from '../utils/insulinUtils';
import TimeInput from '../components/TimeInput';
import { FaSync, FaFilter, FaCalendarAlt, FaInfoCircle, FaSyringe } from 'react-icons/fa';

import './MealVisualization.css';

const SimpleMealEffectChart = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  height = '600px',
  embedded = false,
  onDataLoaded = null,
  onChartReady = null
}) => {
  // Enhanced context usage
  const timeContext = useContext(TimeContext);
  const {
    dateRange,
    generateTimeTicks,
    getAPITimeSettings,
    isTimeInRange,
    formatDateTime
  } = timeContext || {};

  const lastFetchedDateRange = useRef({ start: null, end: null });
  const [showTargetMealEffect, setShowTargetMealEffect] = useState(true);

  // Enhanced BloodSugarData context usage
  const {
    combinedData: bloodSugarData,
    filteredData,
    estimatedBloodSugarData,
    getFilteredData,
    targetGlucose,
    timeScale,
    includeFutureEffect,
    futureHours,
    toggleFutureEffect,
    setFutureHours: setFutureHoursInContext,
    getBloodSugarStatus,
    getBloodSugarAtTime,
    calculateMealBGImpact,
    TimeManager
  } = useBloodSugarData();

  // Use contexts for constants and blood sugar data
  const { patientConstants } = useConstants();

  // State for meal data
  const [meals, setMeals] = useState([]);
  const [filteredMeals, setFilteredMeals] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New state for insulin data
  const [insulinDoses, setInsulinDoses] = useState([]);
  const [filteredInsulinDoses, setFilteredInsulinDoses] = useState([]);
  const [loadingInsulin, setLoadingInsulin] = useState(false);
  const [activeInsulin, setActiveInsulin] = useState(null);
const [stickyTooltip, setStickyTooltip] = useState(null);
const [tooltipPosition, setTooltipPosition] = useState({ left: 0, top: 0 });
  // UI State
  const [mealTypeFilter, setMealTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [userTimeZone, setUserTimeZone] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [showFactorInfo, setShowFactorInfo] = useState(false);

  // Visibility toggles for chart elements
  const [showMeals, setShowMeals] = useState(true);
  const [showMealEffect, setShowMealEffect] = useState(true);
  const [showBloodSugar, setShowBloodSugar] = useState(true);
  const [showInsulin, setShowInsulin] = useState(true);
  const [showInsulinEffect, setShowInsulinEffect] = useState(true);
  const [showNetEffect, setShowNetEffect] = useState(true);
  const [viewMode, setViewMode] = useState('combined');

  // Effect duration settings
  const [effectDurationHours, setEffectDurationHours] = useState(6);
  const [insulinEffectDurationHours, setInsulinEffectDurationHours] = useState(6);

  // For custom date range when not using TimeContext
  const [localDateRange, setLocalDateRange] = useState({
    start: TimeManager.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'YYYY-MM-DD'),
    end: TimeManager.formatDate(new Date(), 'YYYY-MM-DD')
  });

  // References for tracking fetches and charts
  const didFetchRef = useRef(false);
  const chartRef = useRef(null);

  // Process raw meal data into the format needed for visualization
  const processMealData = useCallback((rawMeals) => {
    if (!Array.isArray(rawMeals)) {
      console.error('processMealData received non-array data:', rawMeals);
      return [];
    }

    return rawMeals.map(meal => {
      // Parse timestamps using TimeManager
      const mealTime = TimeManager.parseTimestamp(meal.timestamp);
      const formattedTime = TimeManager.formatDate(
        mealTime,
        TimeManager.formats.DATETIME_DISPLAY
      );

      // Extract or calculate nutritional totals
      const nutrition = meal.nutrition || {};
      const totalCarbs = nutrition.carbs || 0;
      const totalProtein = nutrition.protein || 0;
      const totalFat = nutrition.fat || 0;
      const totalCalories = nutrition.calories ||
        (totalCarbs * 4 + totalProtein * 4 + totalFat * 9);

      // Calculate carb equivalents using our utility function
      const totalCarbEquiv = calculateCarbEquivalents({
        totalCarbs,
        totalProtein,
        totalFat
      }, patientConstants);

      // Get protein factor and fat factor from patient constants
      const proteinFactor = patientConstants?.protein_factor || 0.5;
      const fatFactor = patientConstants?.fat_factor || 0.2;

      // Calculate individual equivalents for display
      const proteinCarbEquiv = totalProtein * proteinFactor;
      const fatCarbEquiv = totalFat * fatFactor;

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
        date: TimeManager.formatDate(mealTime, 'YYYY-MM-DD'),
        time: TimeManager.formatDate(mealTime, 'HH:mm'),
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
  }, [patientConstants, calculateCarbEquivalents]);

  // Process raw insulin data
const processInsulinData = useCallback((rawInsulinData) => {
  if (!Array.isArray(rawInsulinData)) {
    console.error('processInsulinData received non-array data:', rawInsulinData);
    return [];
  }

  return rawInsulinData.map(dose => {
    try {
      // Safely parse the administration time with fallbacks
      let administrationTime;
      try {
        // Try to parse the time, with fallbacks
        administrationTime = dose.taken_at || dose.scheduled_time;
        if (!administrationTime) {
          console.warn('Insulin dose missing timestamp:', dose);
          administrationTime = new Date().toISOString(); // Default to now as fallback
        }

        // Convert to timestamp
        administrationTime = TimeManager.parseTimestamp(administrationTime).valueOf();
      } catch (err) {
        console.error('Error parsing insulin timestamp:', err);
        administrationTime = new Date().getTime(); // Fallback to current time
      }

      // Safely format times
      let formattedTime;
      try {
        formattedTime = TimeManager.formatDate(
          new Date(administrationTime),
          TimeManager.formats.DATETIME_DISPLAY
        );
      } catch (err) {
        console.error('Error formatting time:', err);
        formattedTime = 'Unknown time';
      }

      return {
        id: dose.id || dose._id,
        medication: dose.medication || dose.insulinType || 'unknown_insulin',
        dose: parseFloat(dose.dose) || 0,
        administrationTime: administrationTime,
        formattedTime,
        date: TimeManager.formatDate(new Date(administrationTime), TimeManager.formats.DATE),
        time: TimeManager.formatDate(new Date(administrationTime), TimeManager.formats.TIME),
        suggestedDose: parseFloat(dose.suggested_dose) || 0,
        notes: dose.notes || '',
        mealId: dose.meal_id,
        bloodSugar: dose.blood_sugar,
        // Insulin pharmacokinetics (if available)
        pharmacokinetics: dose.pharmacokinetics || {
          onset_hours: patientConstants?.medication_factors?.[dose.medication]?.onset_hours || 0.5,
          peak_hours: patientConstants?.medication_factors?.[dose.medication]?.peak_hours || 2.0,
          duration_hours: patientConstants?.medication_factors?.[dose.medication]?.duration_hours || 4.0
        }
      };
    } catch (error) {
      console.error('Error processing insulin dose:', error, dose);
      // Return a minimal valid object so the app doesn't crash
      return {
        id: dose.id || dose._id || 'unknown',
        medication: 'unknown_insulin',
        dose: 0,
        administrationTime: Date.now(),
        formattedTime: 'Unknown time',
        date: TimeManager.formatDate(new Date(), TimeManager.formats.DATE),
        time: TimeManager.formatDate(new Date(), TimeManager.formats.TIME)
      };
    }
  }).filter(dose => dose !== null).sort((a, b) => b.administrationTime - a.administrationTime);
}, [patientConstants]);

  // Helper function to merge meal and insulin timeline data
  const mergeTimelineData = useCallback((mealData, insulinData) => {
    // Create a map of all timestamps to easily identify duplicates
    const timestampMap = new Map();

    // Add all meal data points to the map
    mealData.forEach(point => {
      timestampMap.set(point.timestamp, point);
    });

    // Merge insulin data into the map
    insulinData.forEach(point => {
      if (timestampMap.has(point.timestamp)) {
        // Merge with existing point
        const existingPoint = timestampMap.get(point.timestamp);
        timestampMap.set(point.timestamp, {
          ...existingPoint,
          ...point,
          // Keep special properties from both datasets
          insulinDoses: point.insulinDoses || {},
          insulinBars: point.insulinBars || {},
          activeInsulin: point.activeInsulin || 0,
          bgImpact: point.bgImpact || 0,
          insulinContributions: point.insulinContributions || []
        });
      } else {
        // Add new point with default meal values
        timestampMap.set(point.timestamp, {
          ...point,
          meals: [],
          mealEffects: {},
          totalMealEffect: 0
        });
      }
    });

    // Convert map back to array and sort by timestamp
    const merged = Array.from(timestampMap.values());
    merged.sort((a, b) => a.timestamp - b.timestamp);

    return merged;
  }, []);

  // Calculate net effects of meals and insulin
  const calculateNetEffects = useCallback((timelineData, options) => {
    return timelineData.map(point => {
      // Calculate meal impact on blood glucose (in mg/dL)
      const mealImpactMgdL = point.mealImpactMgdL || (point.totalMealEffect * (options.patientConstants?.carb_to_bg_factor || 4.0));

      // Get insulin impact (negative value as it lowers blood glucose)
      const insulinImpactMgdL = point.bgImpact || 0;

      // Calculate net effect
      const netEffectMgdL = mealImpactMgdL + insulinImpactMgdL;

      // Calculate expected blood glucose with net effect
      const estimatedBaseline = point.estimatedBloodSugar || options.targetGlucose;
      const expectedBloodSugarWithNetEffect = Math.max(70, estimatedBaseline + netEffectMgdL);

      return {
        ...point,
        mealImpactMgdL,
        insulinImpactMgdL,
        netEffectMgdL,
        expectedBloodSugarWithNetEffect
      };
    });
  }, []);

  const generateCombinedData = useCallback((mealData, insulinData, bloodGlucoseData) => {
    // Create options object from component state and context values
    const options = {
      timeScale: timeScale || { start: Date.now() - 7 * 24 * 60 * 60 * 1000, end: Date.now(), tickInterval: 3600000 },
      targetGlucose: targetGlucose || 100,
      includeFutureEffect: includeFutureEffect || false,
      futureHours: futureHours || 6,
      effectDurationHours: effectDurationHours || 6,
      insulinEffectDurationHours: insulinEffectDurationHours || 6,
      patientConstants: patientConstants || {}
    };

    // Create context functions object
    const contextFunctions = {
      getBloodSugarAtTime: getBloodSugarAtTime || (() => null),
      getBloodSugarStatus: getBloodSugarStatus || (() => ({ status: 'normal', color: '#000000' })),
      getFilteredData: getFilteredData || (data => data || [])
    };

    // Get meal timeline data
    const mealTimelineData = generateMealTimelineData(
      mealData,
      bloodGlucoseData || [],
      options,
      contextFunctions,
      TimeManager
    );

    // Get insulin timeline data
    const insulinTimelineData = generateInsulinTimelineData(
      insulinData,
      options,
      TimeManager
    );

    // Merge the two datasets based on timestamp
    const mergedTimeline = mergeTimelineData(mealTimelineData, insulinTimelineData);

    // Calculate net effects of meals and insulin
    const timelineWithNetEffects = calculateNetEffects(mergedTimeline, options);

    return timelineWithNetEffects;
  }, [targetGlucose, includeFutureEffect, futureHours,
      getBloodSugarAtTime, getBloodSugarStatus, getFilteredData, TimeManager,
      patientConstants, timeScale, effectDurationHours, insulinEffectDurationHours,
      mergeTimelineData, calculateNetEffects]);

  // Fetch active insulin data
  const fetchActiveInsulin = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const endpoint = patientId
        ? `http://localhost:5000/api/active-insulin?patient_id=${patientId}`
        : 'http://localhost:5000/api/active-insulin';

      const response = await axios.get(
        endpoint,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data) {
        setActiveInsulin(response.data);
      }
    } catch (error) {
      console.error('Error fetching active insulin:', error);
    }
  }, [patientId]);

  // New function to fetch insulin data - moved before fetchData
  // Fix the fetchInsulinData function - replace it with this implementation:
const fetchInsulinData = useCallback(async (timeSettings) => {
  try {
    setLoadingInsulin(true);
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    console.log("Fetching insulin data for date range:", timeSettings);

    // Validate timeSettings before using
    if (!timeSettings || !timeSettings.startDate || !timeSettings.endDate) {
      throw new Error('Invalid time settings for API call');
    }

    // Construct URL with proper parameter syntax
    let url = `http://localhost:5000/api/insulin-data?start_date=${encodeURIComponent(timeSettings.startDate)}&end_date=${encodeURIComponent(timeSettings.endDate)}`;

    // Add patient ID if provided
    if (patientId) {
      url += `&patient_id=${encodeURIComponent(patientId)}`;
    }

    console.log("Insulin data URL:", url);

    const insulinResponse = await axios.get(
      url,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let processedInsulin = [];

    if (insulinResponse.data && insulinResponse.data.insulin_logs) {
      processedInsulin = processInsulinData(insulinResponse.data.insulin_logs);
      console.log("Processed insulin doses:", processedInsulin.length);

      // Set the state
      setInsulinDoses(processedInsulin);
      setFilteredInsulinDoses(processedInsulin);
    } else {
      console.error('Invalid insulin response structure:', insulinResponse.data);
    }

    return processedInsulin;
  } catch (error) {
    console.error('Error fetching insulin data:', error);
    return [];
  } finally {
    setLoadingInsulin(false);
  }
}, [patientId, processInsulinData]);

  const fetchData = useCallback(async () => {
  try {
    setLoading(true);
    setIsFetching(true);
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Get time settings from TimeContext with safer null checks
    let timeSettings;

    if (timeContext && timeContext.getAPITimeSettings) {
      timeSettings = getAPITimeSettings();
    } else {
      // Fallback to local date range if timeContext is not available
      const safeStartDate = (timeContext?.dateRange?.start) || localDateRange.start;
      const safeEndDate = (timeContext?.dateRange?.end) || localDateRange.end;

      timeSettings = {
        startDate: safeStartDate,
        endDate: TimeManager.formatDate(
          TimeManager.addHours(
            new Date(safeEndDate),
            includeFutureEffect ? futureHours : 0
          ),
          'YYYY-MM-DD'
        )
      };
    }

    console.log("Fetching meal data for date range:", timeSettings);

    // Use the meals-only API endpoint
    const endpoint = patientId
      ? `http://localhost:5000/api/patient/${patientId}/meals-only`
      : 'http://localhost:5000/api/meals-only';

    const mealsResponse = await axios.get(
      `${endpoint}?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Process meal data
    if (mealsResponse.data && Array.isArray(mealsResponse.data.meals)) {
      const processedMeals = processMealData(mealsResponse.data.meals);
      console.log("Processed meals:", processedMeals.length);
      setMeals(processedMeals);
      setFilteredMeals(processedMeals);

      // Get insulin data without setting state directly in the function
      const processedInsulin = await fetchInsulinData(timeSettings);
      setInsulinDoses(processedInsulin);
      setFilteredInsulinDoses(processedInsulin);

      // After getting insulin data, fetch active insulin
      fetchActiveInsulin();

      // Filter blood sugar data to match our date range - USE CONTEXT FUNCTION
      let filteredBloodSugar = [];
      if (bloodSugarData && bloodSugarData.length > 0) {
        filteredBloodSugar = getFilteredData ? getFilteredData(bloodSugarData) : [];
        console.log("Filtered blood sugar readings from context:", filteredBloodSugar.length);
      }

      // Generate combined data once we have both meal and insulin data
      const combinedResult = generateCombinedData(
        processedMeals,
        processedInsulin, // Use local variable instead of filteredInsulinDoses state
        filteredBloodSugar
      );

      console.log("Combined data points:", combinedResult.length);

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
    if (timeContext && timeContext.dateRange) {
      lastFetchedDateRange.current = {
        start: timeContext.dateRange.start,
        end: timeContext.dateRange.end
      };
    }
  }
}, [timeContext, getAPITimeSettings, dateRange, localDateRange, includeFutureEffect,
    futureHours, patientId, processMealData, getFilteredData,
    generateCombinedData, bloodSugarData, onDataLoaded, fetchInsulinData, fetchActiveInsulin]); // Add fetchActiveInsulin here


  const debouncedFetchData = useCallback(
    debounce(() => {
      fetchData();
    }, 500),
    [fetchData]
  );

  // Set user timezone on component mount
  useEffect(() => {
    setUserTimeZone(TimeManager.getUserTimeZone());

    // Notify parent when chart is ready
    if (onChartReady && typeof onChartReady === 'function') {
      onChartReady(chartRef.current);
    }
  }, [onChartReady]);

  // Effect to fetch data once when component mounts and when necessary params change
  useEffect(() => {
    // Only fetch if we haven't fetched yet or if the date range changes
    // Added null checks for timeContext and dateRange
    if (!didFetchRef.current ||
        (timeContext && timeContext.dateRange &&
         typeof timeContext.dateRange.start === 'string' &&
         typeof timeContext.dateRange.end === 'string')) {
      debouncedFetchData();
      didFetchRef.current = true;
    }
  }, [debouncedFetchData, timeContext]);

  // Regenerate combined data when blood sugar data changes
  useEffect(() => {
  if (didFetchRef.current && bloodSugarData && bloodSugarData.length > 0 &&
      filteredMeals.length > 0 && filteredInsulinDoses.length > 0) {
    const filteredData = getFilteredData ? getFilteredData(bloodSugarData) : [];
    if (filteredData.length > 0) {
      console.log("Regenerating combined data with updated blood sugar data");
      // Use a reference comparison to prevent unnecessary updates
      const prevCombined = combinedData;
      const combinedResult = generateCombinedData(
        filteredMeals,
        filteredInsulinDoses,
        filteredData
      );
      // Only update state if data actually changed
      if (combinedResult.length !== prevCombined.length) {
        setCombinedData(combinedResult);
      }
    }
  }
}, [bloodSugarData, getFilteredData]); // Remove filteredMeals, filteredInsulinDoses, and generateCombinedData from deps

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
    if (timeContext && timeContext.setDateRange) {
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

  // Format X-axis labels for charts
  const formatXAxis = useCallback((timestamp) => {
    return TimeManager.formatDate(new Date(timestamp), TimeManager.formats.CHART_TICKS_MEDIUM);
  }, []);

  // Return a single color for all meals
  const getMealColor = useCallback(() => {
    // Single consistent color for all meal types
    return '#4287f5'; // A nice blue color that works well with the chart
  }, []);

  // Get color for insulin
  const getInsulinColor = useCallback(() => {
    return '#4a90e2'; // A nice blue color that's distinct from meal color
  }, []);

  // Format legend text to clean up labels
  const formatLegendText = useCallback((value) => {
    // Format specific data series properly
    if (value === 'bloodSugar') {
      return 'Blood Sugar (with effects, future)';
    } else if (value === 'estimatedBloodSugar') {
      return 'Baseline Blood Sugar (historical)';
    } else if (value === 'targetWithMealEffect') {
      return 'Default + Meal Effect';
    } else if (value === 'totalMealEffect') {
      return 'Meal Effect';
    } else if (value === 'activeInsulin') {
      return 'Active Insulin';
    } else if (value === 'insulinDose') {
      return 'Insulin Doses';
    } else if (value === 'insulinImpact') {
      return 'Insulin Impact';
    } else if (value === 'expectedBloodSugarWithNetEffect') {
      return 'Net Effect (Meals + Insulin)';
    }

    // Handle meal-related entries
    if (value.includes('mealCarbs.')) {
      return 'Meal Carbs';  // All meal carbs now have the same legend label
    } else if (value.includes('mealEffect.')) {
      return 'Meal Effect';
    } else if (value.includes('insulinDoses.')) {
      return 'Insulin Dose';
    }

    return value;
  }, []);

  // Custom meal effect tooltip with insulin information
const EnhancedTooltip = ({
  active,
  payload,
  label,
  stickyData,
  position,
  isSticky,
  onClose
}) => {
  // Use either sticky data or regular tooltip data
  const data = isSticky ? stickyData : (active && payload && payload.length ? payload[0].payload : null);

  if (!data) return null;

  const now = new Date().getTime();
  const isHistorical = data.timestamp < now;

  // Calculate all the values for display - using your existing tooltip logic
  const bloodSugar = isHistorical
    ? (!isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A')
    : (!isNaN(data.bloodSugar) ? Math.round(data.bloodSugar) : 'N/A');

  const estimatedBS = !isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A';
  const bloodSugarWithEffect = !isNaN(data.bloodSugarWithMealEffect) ?
    Math.round(data.bloodSugarWithMealEffect) : bloodSugar;
  const targetWithEffect = !isNaN(data.targetWithMealEffect) ?
    Math.round(data.targetWithMealEffect) : 'N/A';
  const expectedWithNetEffect = !isNaN(data.expectedBloodSugarWithNetEffect) ?
    Math.round(data.expectedBloodSugarWithNetEffect) : bloodSugar;

  const mealImpact = data.mealImpactMgdL ||
    (data.totalMealEffect && !isNaN(data.totalMealEffect) ?
      parseFloat((data.totalMealEffect * (patientConstants?.carb_to_bg_factor || 4.0)).toFixed(1)) : 0);

  const insulinDose = data.insulinDose ||
    (data.insulinDoses && Object.values(data.insulinDoses).reduce((sum, dose) => sum + dose, 0)) || 0;
  const activeInsulin = Math.abs(data.activeInsulin) || 0;
  const insulinImpact = Math.abs(data.insulinImpactMgdL) || 0;
  const netEffect = data.netEffectMgdL || 0;

  // Calculate position styles for sticky tooltip
  const style = isSticky ? {
    position: 'absolute',
    left: position.left + 'px',
    top: position.top + 'px',
    transform: 'translate(-50%, -100%)', // Position above the point
    opacity: 1
  } : {};

  return (
    <div
      className={`meal-effect-tooltip ${isSticky ? 'sticky' : ''}`}
      style={style}
    >
      {isSticky && (
        <button className="tooltip-close-btn" onClick={onClose}>
          ✕
        </button>
      )}

      <p className="tooltip-time">{data.formattedTime}</p>

      {/* Show insulin information if present */}
      {insulinDose > 0 && (
        <div className="tooltip-section tooltip-insulin-section">
          <h4>Insulin:</h4>
          <p className="tooltip-insulin-dose">
            Dose: <strong>{insulinDose.toFixed(1)} units</strong>
          </p>
          {activeInsulin > 0 && (
            <p className="tooltip-active-insulin">
              Active: <strong>{activeInsulin.toFixed(2)} units</strong>
            </p>
          )}
          {insulinImpact < 0 && (
            <p className="tooltip-insulin-impact">
              Impact: <strong>{insulinImpact.toFixed(1)} mg/dL</strong>
            </p>
          )}
        </div>
      )}

      {/* Show meal effect information if present */}
      {data.totalMealEffect > 0 && (
        <div className="tooltip-section tooltip-meal-section">
          <h4>Meal Impact:</h4>
          <p className="tooltip-meal-impact">
            Effect: <strong>+{mealImpact.toFixed(1)} mg/dL</strong>
          </p>
        </div>
      )}

      {/* Show net effect if both insulin and meal effects are present */}
      {(insulinImpact < 0 || mealImpact > 0) && (
        <div className="tooltip-section tooltip-net-section">
          <h4>Net Effect:</h4>
          <p className="tooltip-net-impact">
            Combined: <strong>{netEffect > 0 ? '+' : ''}{netEffect.toFixed(1)} mg/dL</strong>
          </p>
          {!isHistorical && (
            <p className="tooltip-projected">
              Projected BG: <strong>{expectedWithNetEffect} mg/dL</strong>
            </p>
          )}
        </div>
      )}

      {/* Meal nutritional details section */}
      {data.meals && data.meals.length > 0 && (
        <div className="tooltip-section tooltip-meal-details">
          <h4>Meal Details:</h4>
          {data.meals.map((meal, idx) => (
            <div key={idx} className="tooltip-meal">
              <p className="tooltip-meal-type">{meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}</p>
              <table className="tooltip-meal-table">
                <tbody>
                  <tr>
                    <td>Carbs:</td>
                    <td><strong>{meal.carbs.toFixed(1)}g</strong></td>
                  </tr>
                  <tr>
                    <td>Protein equiv:</td>
                    <td><strong>{(meal.protein * (patientConstants?.protein_factor || 0.5)).toFixed(1)}g</strong></td>
                  </tr>
                  <tr>
                    <td>Fat equiv:</td>
                    <td><strong>{(meal.fat * (patientConstants?.fat_factor || 0.2)).toFixed(1)}g</strong></td>
                  </tr>
                  <tr className="total-row">
                    <td>Total equiv:</td>
                    <td><strong>{meal.totalCarbEquiv.toFixed(1)}g</strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Indicate if showing historical or future data */}
      <p className="tooltip-data-type">
        {isHistorical ?
          <em>Showing historical data {!data.isActualReading && "(baseline estimate)"}</em> :
          <em>Showing future projection with combined effects</em>}
      </p>

      {/* Blood glucose information */}
      <div className="tooltip-section">
        <h4>Blood Glucose:</h4>
        {data.isActualReading ? (
          <p>Measured: <strong>{bloodSugar} mg/dL</strong></p>
        ) : (
          <>
            <p>Baseline estimate: {estimatedBS} mg/dL</p>
            {/* Only show meal effect for future data, not historical */}
            {(data.totalMealEffect > 0 || insulinImpact < 0) && !isHistorical && (
              <p className="tooltip-projected">
                With all effects: <strong>{bloodSugar} mg/dL</strong>
              </p>
            )}
          </>
        )}
        {data.status && (
          <p className="status" style={{ color: data.status.color }}>
            Status: {data.status.label}
          </p>
        )}
      </div>

      {/* Target glucose information (second visualization) */}
      {data.totalMealEffect > 0 && (
        <div className="tooltip-section tooltip-target-section">
          <h4>Default Impact:</h4>
          <p>Target glucose: {targetGlucose} mg/dL</p>
          <p className="tooltip-target-impact">
            With meal effect: <strong>{targetWithEffect} mg/dL</strong>
            <span className="tooltip-percent">
              ({Math.round((targetWithEffect/targetGlucose)*100)}% of target)
            </span>
          </p>

          {/* Target status classification */}
          {targetWithEffect > targetGlucose * 1.3 ? (
            <p className="tooltip-status high">HIGH</p>
          ) : targetWithEffect < targetGlucose * 0.7 ? (
            <p className="tooltip-status low">LOW</p>
          ) : (
            <p className="tooltip-status normal">IN RANGE</p>
          )}
        </div>
      )}

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

      {/* Insulin contributions details */}
      {data.insulinContributions && data.insulinContributions.length > 0 && (
        <div className="tooltip-section">
          <h4>Active Insulin Doses:</h4>
          {data.insulinContributions.map((contrib, idx) => (
            <p key={idx} className="tooltip-insulin-contribution">
              {formatInsulinName(contrib.insulinType)}: {contrib.activeUnits.toFixed(2)} units
              ({Math.round(contrib.activityPercent)}% active)
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
const handleChartClick = (data) => {
  if (data && data.activePayload && data.activePayload.length) {
    // Calculate position for the tooltip
    const position = {
      left: data.chartX,
      top: data.chartY - 10 // Position slightly above click point
    };

    // Set the sticky tooltip data
    setStickyTooltip(data.activePayload[0].payload);
    setTooltipPosition(position);
  }
};

// Add this to close the sticky tooltip
const handleCloseTooltip = () => {
  setStickyTooltip(null);
};


  // Custom dot for blood sugar readings on chart
  // Update the CustomBloodSugarDot component to include keys
const CustomBloodSugarDot = useCallback((props) => {
  const { cx, cy, payload, index } = props;

  // Only render dots for actual readings
  if (!payload || !payload.isActualReading || !cx || !cy) return null;

  // Determine dot properties based on reading type and relation to target
  const targetDiff = payload.bloodSugar - (targetGlucose || 100);
  const radius = 4;
  const strokeWidth = 2;

  // Base color on relationship to target
  let strokeColor;
  if (targetDiff > (targetGlucose || 100) * 0.3) {
    strokeColor = '#ff4444'; // High
  } else if (targetDiff < -(targetGlucose || 100) * 0.3) {
    strokeColor = '#ff8800'; // Low
  } else {
    strokeColor = '#8031A7'; // Normal
  }

  let fillColor = "#ffffff"; // White fill for all actual readings

  // Add key prop to solve React warning
  return (
    <circle
      key={`dot-${index}-${payload.timestamp || Date.now()}`}
      cx={cx}
      cy={cy}
      r={radius}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      fill={fillColor}
    />
  );
}, [targetGlucose]);

// Similarly update the CustomInsulinDot
const CustomInsulinDot = useCallback((props) => {
  const { cx, cy, payload, index } = props;

  // Only render for points with insulin doses
  if (!payload || !payload.insulinDose || payload.insulinDose <= 0 || !cx || !cy) return null;

  const radius = 5;
  const strokeColor = '#4a90e2'; // Blue for insulin
  const fillColor = '#ffffff'; // White fill

  // Add key prop to solve React warning
  return (
    <svg
      key={`insulin-dot-${index}-${payload.timestamp || Date.now()}`}
      x={cx - radius}
      y={cy - radius}
      width={radius * 2}
      height={radius * 2}
    >
      {/* Diamond shape for insulin */}
      <polygon
        points={`${radius},0 ${radius*2},${radius} ${radius},${radius*2} 0,${radius}`}
        stroke={strokeColor}
        strokeWidth={1.5}
        fill={fillColor}
      />
    </svg>
  );
}, []);

  // Check if current time is within chart range with safer null checks
  const currentTimeInRange = useMemo(() => {
    const now = new Date().getTime();

    if (timeContext && typeof timeContext.isTimeInRange === 'function') {
      return timeContext.isTimeInRange(now);
    } else if (timeScale && timeScale.start && timeScale.end) {
      return TimeManager.isTimeInRange(now, timeScale.start, timeScale.end);
    }

    return false;
  }, [timeContext, timeScale, TimeManager]);

  // Render meal effect chart with safer null checks
  const renderMealEffectChart = () => {
    // Safely access timeScale to prevent "Cannot read property 'start' of undefined"
    const safeTimeScale = timeScale || {
      start: Date.now() - 7 * 24 * 60 * 60 * 1000,
      end: Date.now(),
      tickInterval: 3600000
    };

    return (
      <ResponsiveContainer width="100%" height={600}>
<ComposedChart
  data={prepareChartData(combinedData, { targetGlucose: targetGlucose || 100 })}
  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
  ref={chartRef}
  onClick={handleChartClick} // Add this line
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="timestamp"
            type="number"
            scale="time"
            domain={[safeTimeScale.start, safeTimeScale.end]}
            ticks={timeContext && typeof timeContext.generateTimeTicks === 'function'
                  ? timeContext.generateTimeTicks()
                  : TimeManager.generateTimeTicks(safeTimeScale.start, safeTimeScale.end, safeTimeScale.tickInterval)}
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
              domain={[0, 'dataMax + 50']}
              tickFormatter={(value) => Math.round(value)}
              label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
            />
          )}

          {/* Y-axis for meal carbs - excluded from insulin view */}
          {(viewMode === 'combined' || viewMode === 'effect') && (
            <YAxis
              yAxisId="mealCarbs"
              orientation={showBloodSugar ? "right" : "left"}
              domain={[0, 'dataMax + 150']}
              label={{
                value: 'Carbohydrates (g)',
                angle: -90,
                position: showBloodSugar ? 'insideRight' : 'insideLeft'
              }}
            />
          )}

         {/* Y-axis for insulin units - UPDATED to invert direction */}
{(viewMode === 'combined' || viewMode === 'insulin') && showInsulin && (
  <YAxis
    yAxisId="insulinAxis"
    orientation="right"
    // CHANGE: Set domain to negative values for insulin (top-down visualization)
    domain={['dataMin - 30', 0]} // Changed from [0, 'dataMax + 2'] to invert direction
    tickFormatter={(value) => Math.abs(value)} // Show positive tick values
    label={{
      value: 'Insulin (units)',
      angle: -90,
      position: 'insideRight'
    }}
  />
)}

          {/* Y-axis for meal effect */}
          {(viewMode === 'combined' || viewMode === 'effect') && showMealEffect && (
            <YAxis
              yAxisId="mealEffect"
              orientation="right"
              domain={[0, 350]} // Fixed domain to make small effects more visible
              label={{ value: 'Meal Effect (units)', angle: -90, position: 'insideRight' }}
            />
          )}

<Tooltip
  content={props => (
    <EnhancedTooltip
      {...props}
      stickyData={stickyTooltip}
      position={tooltipPosition}
      isSticky={!!stickyTooltip}
      onClose={handleCloseTooltip}
    />
  )}
/>
  <Legend formatter={formatLegendText} />

          {/* Target glucose reference lines */}
          {showBloodSugar && (
            <>
              {/* High threshold */}
              <ReferenceLine
                y={(targetGlucose || 100) * 1.3}
                yAxisId="bloodSugar"
                label={{
                  value: 'High',
                  position: 'right',
                  fill: '#ff8800'
                }}
                stroke="#ff8800"
                strokeDasharray="3 3"
              />

              {/* Target reference line */}
              <ReferenceLine
                y={targetGlucose || 100}
                yAxisId="bloodSugar"
                label={{
                  value: 'Target',
                  position: 'right',
                  fill: '#FF7300'
                }}
                stroke="#FF7300"
                strokeDasharray="3 3"
              />

              {/* Low threshold */}
              <ReferenceLine
                y={(targetGlucose || 100) * 0.7}
                yAxisId="bloodSugar"
                label={{
                  value: 'Low',
                  position: 'right',
                  fill: '#ff4444'
                }}
                stroke="#ff4444"
                strokeDasharray="3 3"
              />
            </>
          )}

          {/* Blood sugar visualization */}
          {showBloodSugar && (
            <>
              {/* Baseline blood sugar line (light purple) - VISIBLE THROUGHOUT TIMELINE */}
              <Line
                yAxisId="bloodSugar"
                type="basis"
                dataKey="estimatedBloodSugar"
                name="Baseline Blood Sugar"
                stroke="#D19EFF"  // Light purple
                strokeWidth={2.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />

              {/* Blood sugar with meal effect line (dark purple) - VISIBLE ONLY FOR FUTURE DATA */}
              <Line
                yAxisId="bloodSugar"
                type="basis"
                dataKey="bloodSugar"
                name="Blood Sugar with Meal Effect"
                stroke="#8031A7" // Dark purple
                strokeWidth={2.5}
                connectNulls={false}  // Don't connect across null values
                isAnimationActive={false}
                dot={CustomBloodSugarDot} // Keep custom dot renderer
              />

              {/* Net effect line - includes both meal and insulin effects */}
              {showNetEffect && (
                <Line
                  yAxisId="bloodSugar"
                  type="monotone"
                  dataKey="expectedBloodSugarWithNetEffect"
                  name="Net Effect (Meals + Insulin)"
                  stroke="#37474F" // Dark slate color
                  strokeWidth={2}
                  strokeDasharray="5 5" // Dashed line
                  dot={false}
                  activeDot={{ r: 5, strokeWidth: 1, fill: '#37474F' }}
                />
              )}
            </>
          )}

          {/* Second visualization: Target with meal effect line */}
          {showBloodSugar && showMealEffect && showTargetMealEffect && (
            <Line
              yAxisId="bloodSugar"
              type="monotone"
              dataKey="targetWithMealEffect"
              name="Target + Meal Effect"
              stroke="#FF7300"  // Same color as target for association
              strokeWidth={2}
              strokeDasharray="2 2"
              dot={(props) => {
                const { cx, cy, payload } = props;
                // Only show dots where meal effect exists
                if (!payload || !payload.totalMealEffect || payload.totalMealEffect <= 0) return null;

                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill="#FFCC80"
                    stroke="#FF7300"
                    strokeWidth={1}
                  />
                );
              }}
              activeDot={{ r: 6, strokeWidth: 1, fill: '#FFCC80' }}
            />
          )}

          {/* Use a single Bar for all meals with the same color - now included in effect view too */}
          {(viewMode === 'combined' || viewMode === 'effect') && showMeals && (
            <Bar
              yAxisId="mealCarbs"
              dataKey={(dataPoint) => {
                // Sum up all mealCarbs.X properties
                let total = 0;
                if (dataPoint) {
                  Object.keys(dataPoint).forEach(key => {
                    if (key.startsWith('mealCarbs.')) {
                      total += dataPoint[key] || 0;
                    }
                  });
                }
                return total;
              }}
              name="Meal Carbs"
              fill={getMealColor()}
              barSize={50}
              fillOpacity={viewMode === 'effect' ? 0.6 : 0.85} // Slightly more transparent in effect view
              stroke={getMealColor()}
              strokeWidth={viewMode === 'effect' ? 1 : 2} // Thinner stroke in effect view
            />
          )}

         {/* Meal Effect Area */}
{(viewMode === 'combined' || viewMode === 'effect') && showMealEffect && (
  <Area
    yAxisId="mealEffect"
    type="monotone"
    dataKey="totalMealEffect"
    name="Total Meal Effect"
    fill="#82ca9d"  // Green fill
    stroke="#4CAF50" // Green stroke
    fillOpacity={0.4}
    strokeWidth={1.5}

    isAnimationActive={false}
    activeDot={{ r: 6, strokeWidth: 1, fill: '#82ca9d' }}
  />
)}

     {/* Insulin doses as bars - UPDATED to use negative values */}
{(viewMode === 'combined' || viewMode === 'insulin') && showInsulin && (
  <Bar
    yAxisId="insulinAxis"
    dataKey={(dataPoint) => {
      // Sum up all insulin doses
      let total = 0;
      if (dataPoint && dataPoint.insulinDoses) {
        total = Object.values(dataPoint.insulinDoses).reduce((sum, dose) => sum + dose, 0);
      }
      // CHANGE: Return negative value for top-down bars
      return total > 0 ? -total : null;
    }}
    name="Insulin Doses"
    fill={getInsulinColor()}
    barSize={40}
    fillOpacity={0.7}
    stroke={getInsulinColor()}
    strokeWidth={1}
  />
)}

       {/* Active insulin area - UPDATED to use negative values for top-down visualization */}
{(viewMode === 'combined' || viewMode === 'insulin') && showInsulin && showInsulinEffect && (
  <Area
    yAxisId="insulinAxis"
    type="monotone"
    // CHANGE: Use modified insulin data (negated)
    dataKey={(dataPoint) => dataPoint.activeInsulin > 0 ? -dataPoint.activeInsulin : null}
    name="Active Insulin"
    fill="#4a90e2"
    fillOpacity={0.3}
    stroke="#4a90e2"
    strokeWidth={1.5}
    // CHANGE: Custom dot positioning for inverted insulin display
    dot={(props) => {
      const { cx, cy, payload } = props;
      // Only show dots for insulin doses
      if (!payload || !payload.insulinDose || payload.insulinDose <= 0 || !cx || !cy) return null;

      const radius = 5;
      const strokeColor = '#4a90e2'; // Blue for insulin
      const fillColor = '#ffffff'; // White fill

      return (
        <svg
          key={`insulin-dot-${payload.timestamp || Date.now()}`}
          x={cx - radius}
          y={cy - radius}
          width={radius * 2}
          height={radius * 2}
        >
          {/* Diamond shape for insulin */}
          <polygon
            points={`${radius},0 ${radius*2},${radius} ${radius},${radius*2} 0,${radius}`}
            stroke={strokeColor}
            strokeWidth={1.5}
            fill={fillColor}
          />
        </svg>
      );
    }}
    activeDot={{ r: 6, strokeWidth: 1, fill: '#4a90e2' }}
  />
)}
          {/* Current time reference line */}
          {currentTimeInRange && (
            <ReferenceLine
              x={new Date().getTime()}
              yAxisId={
                // Choose available yAxis based on what's visible
                showBloodSugar ? "bloodSugar" :
                (viewMode === 'combined' || viewMode === 'insulin') ? "mealCarbs" :
                "mealEffect"
              }
              stroke="#ff0000"
              strokeWidth={2}
              label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  };

  // Main render function
  if (loading && !filteredMeals.length) {
    return <div className="loading">Loading meal data...</div>;
  }

  return (
    <div className={`meal-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Meal & Insulin Impact Chart</h2>}

      {/* Timezone info display */}
      {!embedded && (
        <div className="timezone-info">
          Your timezone: {userTimeZone}
          <span className="timezone-note"> (all times displayed in your local timezone)</span>
        </div>
      )}

      {/* View mode toggle */}
      <div className="view-mode-toggle">
        <button
          className={`toggle-btn ${viewMode === 'combined' ? 'active' : ''}`}
          onClick={() => setViewMode('combined')}
        >
          Combined View
        </button>
        <button
          className={`toggle-btn ${viewMode === 'insulin' ? 'active' : ''}`}
          onClick={() => setViewMode('insulin')}
        >
          Insulin View
        </button>
        <button
          className={`toggle-btn ${viewMode === 'effect' ? 'active' : ''}`}
          onClick={() => setViewMode('effect')}
        >
          Meal Effect
        </button>
      </div>

      {/* Active Insulin Indicator */}
      {activeInsulin && activeInsulin.total_active_insulin > 0 && (
        <div className="active-insulin-indicator">
          <FaSyringe className="active-insulin-icon" />
          <span className="active-insulin-text">
            <strong>Active Insulin: {activeInsulin.total_active_insulin} units</strong>
            <span className="active-insulin-time">
              (calculated at {TimeManager.formatDate(new Date(activeInsulin.calculation_time), TimeManager.formats.TIME_ONLY)})
            </span>
          </span>
        </div>
      )}

      {showControls && (
        <div className="controls">
          {/* Date range controls */}
          <div className="date-controls">
            <div className="date-range-inputs">
              <TimeInput
                mode="daterange"
                value={timeContext && timeContext.dateRange ? dateRange : localDateRange}
                onChange={handleDateRangeChange}
                useTimeContext={!!(timeContext && typeof timeContext.setDateRange === 'function')}
                showPresets={false}
              />
            </div>
            <div className="quick-ranges">
              <button onClick={() => {
                // Safer approach with proper null checks
                let newRange;
                if (timeContext && typeof timeContext.applyDatePreset === 'function') {
                  newRange = timeContext.applyDatePreset(1);
                  if (typeof timeContext.setDateRange === 'function') {
                    timeContext.setDateRange(newRange);
                  }
                } else {
                  newRange = applyDatePreset(1);
                  setLocalDateRange(newRange);
                }
              }}>
                <FaCalendarAlt/> Today
              </button>
              <button onClick={() => {
                let newRange;
                if (timeContext && typeof timeContext.applyDatePreset === 'function') {
                  newRange = timeContext.applyDatePreset(7);
                  if (typeof timeContext.setDateRange === 'function') {
                    timeContext.setDateRange(newRange);
                  }
                } else {
                  newRange = applyDatePreset(7);
                  setLocalDateRange(newRange);
                }
              }}>
                <FaCalendarAlt/> Week
              </button>
              <button onClick={() => {
                let newRange;
                if (timeContext && typeof timeContext.applyDatePreset === 'function') {
                  newRange = timeContext.applyDatePreset(30);
                  if (typeof timeContext.setDateRange === 'function') {
                    timeContext.setDateRange(newRange);
                  }
                } else {
                  newRange = applyDatePreset(30);
                  setLocalDateRange(newRange);
                }
              }}>
                <FaCalendarAlt/> Month
              </button>
            </div>
          </div>

          {/* Filter controls */}
          <div className="filter-controls">
            <div className="meal-type-filter">
              <label htmlFor="meal-type-select">
                <FaFilter/> Meal Type:
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

          {/* Display options with enhanced insulin controls */}
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
                checked={showInsulin}
                onChange={() => setShowInsulin(!showInsulin)}
              />
              Show Insulin Doses
            </label>
            <label className="display-option">
              <input
                type="checkbox"
                checked={showInsulinEffect}
                onChange={() => setShowInsulinEffect(!showInsulinEffect)}
              />
              Show Insulin Effect
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
                checked={showNetEffect}
                onChange={() => setShowNetEffect(!showNetEffect)}
              />
              Show Net Effect
            </label>
            <label className="display-option">
              <input
                type="checkbox"
                checked={showTargetMealEffect}
                onChange={() => setShowTargetMealEffect(!showTargetMealEffect)}
              />
              Show Target With Effects
            </label>
            <label className="display-option">
              <input
                type="checkbox"
                checked={includeFutureEffect}
                onChange={toggleFutureEffect || (() => {})}
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
                  value={futureHours || 7}
                  onChange={(e) => {
                    if (typeof setFutureHoursInContext === 'function') {
                      setFutureHoursInContext(parseInt(e.target.value) || 7);
                    }
                  }}
                />
              </div>
            )}
            <div className="effect-duration">
              <label>Meal Effect Duration (hours):</label>
              <input
                type="number"
                min="1"
                max="24"
                value={effectDurationHours}
                onChange={(e) => setEffectDurationHours(parseInt(e.target.value) || 6)}
              />
            </div>
            <div className="effect-duration">
              <label>Insulin Effect Duration (hours):</label>
              <input
                type="number"
                min="1"
                max="24"
                value={insulinEffectDurationHours}
                onChange={(e) => setInsulinEffectDurationHours(parseInt(e.target.value) || 6)}
              />
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {!loading && filteredMeals.length === 0 ? (
        <div className="no-data-message">
          No meals found for the selected date range and filters.
        </div>
      ) : (
        <div className="content-container">
          <div className="chart-container" ref={chartRef}>
            {/* Carb equivalent explanation */}
            <div className="carb-equivalent-info">
              <button
                className="info-button"
                onClick={() => setShowFactorInfo(!showFactorInfo)}
              >
                <FaInfoCircle /> About Meal & Insulin Effects
              </button>

              {showFactorInfo && (
                <div className="info-panel">
                  <h4>Meal & Insulin Effect Visualization Explained</h4>
                  <p>
                    This chart shows how your meals and insulin doses impact blood glucose over time:
                  </p>
                  <ul>
                    <li><strong>Blue bars:</strong> Represent meal carbohydrate content</li>
                    <li><strong>Green area:</strong> Shows the meal's projected effect on blood glucose</li>
                    <li><strong>Purple line:</strong> Blood glucose values (actual readings shown as dots)</li>
                    <li><strong>Blue area:</strong> Active insulin amount over time</li>
                    <li><strong>Dashed line:</strong> Net effect combining meals and insulin</li>
                  </ul>
                  <p>
                    Meal effects are calculated based on carbohydrates, protein, fat, and absorption type.
                    Protein and fat are converted to "carbohydrate equivalents" using your personalized factors:
                  </p>
                  <ul>
                    <li><strong>Protein:</strong> 1g protein = {patientConstants?.protein_factor || 0.5}g carbohydrate equivalent</li>
                    <li><strong>Fat:</strong> 1g fat = {patientConstants?.fat_factor || 0.2}g carbohydrate equivalent</li>
                  </ul>
                  <p>
                    Insulin effects are calculated based on your insulin's pharmacokinetic profile:
                  </p>
                  <ul>
                    <li><strong>Onset:</strong> When insulin begins to work</li>
                    <li><strong>Peak:</strong> When insulin is most active</li>
                    <li><strong>Duration:</strong> How long insulin continues to have an effect</li>
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


    {renderMealEffectChart()}

    {/* ADD THE STICKY TOOLTIP CONTAINER RIGHT HERE */}
{stickyTooltip && (
  <div
    className={`tooltip-container ${stickyTooltip ? 'sticky' : ''}`}
    style={{
      position: 'absolute',
      left: tooltipPosition.left + 'px',
      top: tooltipPosition.top + 'px',
      transform: 'translate(-50%, 0)', // Changed from translate(-50%, -100%)
      maxHeight: '60%', // Limit height to stay within chart
      maxWidth: '320px',
      zIndex: 1000
    }}
  >
    <EnhancedTooltip
      stickyData={stickyTooltip}
      position={{left: 0, top: 0}} // Reset position since container handles it
      isSticky={true}
      onClose={handleCloseTooltip}
    />
  </div>
)}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleMealEffectChart;