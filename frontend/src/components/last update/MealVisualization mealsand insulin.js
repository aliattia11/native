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
  ReferenceLine,
  BarChart,
  LineChart
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import TimeManager from '../utils/TimeManager';
import TimeEffect from '../utils/TimeEffect';
import TimeContext from '../contexts/TimeContext';
import {
  calculateMealEffect,
  generateMealTimelineData,
  generateCombinedEffectsTimeline
} from '../utils/BG_Effect';
import * as InsulinEffect from '../utils/InsulinEffect';

import TimeInput from '../components/TimeInput';
import { FaSync, FaChartBar, FaTable, FaList, FaFilter, FaCalendarAlt, FaInfoCircle } from 'react-icons/fa';

import './MealVisualization.css';

// Define constants for physiological modeling
const MIN_SAFE_BLOOD_GLUCOSE = 70; // Minimum safe blood glucose level (mg/dL)
const MEAL_IMPACT_FACTOR = 4; // Impact factor for converting carb equivalents to blood glucose change

const MealVisualization = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  height = '500px',
  embedded = false,
  onDataLoaded = null,
  defaultView = 'chart'
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
  const [insulinData, setInsulinData] = useState([]);
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [loadingInsulin, setLoadingInsulin] = useState(false);
  const [insulinError, setInsulinError] = useState('');

  // UI State
  const [activeView, setActiveView] = useState(defaultView);
  const [chartType, setChartType] = useState('combined'); // Changed default to 'combined'
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

  // New visibility toggles for insulin
  const [showInsulinDoses, setShowInsulinDoses] = useState(true);
  const [showInsulinEffect, setShowInsulinEffect] = useState(true);
  const [showCombinedEffects, setShowCombinedEffects] = useState(true);

  // Effect duration setting for meal impact
  const [effectDurationHours, setEffectDurationHours] = useState(6);

  // For custom date range when not using TimeContext
  const [localDateRange, setLocalDateRange] = useState({
    start: TimeManager.formatDate(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'YYYY-MM-DD'),
    end: TimeManager.formatDate(new Date(), 'YYYY-MM-DD')
  });

  // References for tracking fetches and charts
  const didFetchRef = useRef(false);
  const chartRef = useRef(null);

  // Set user timezone on component mount
  useEffect(() => {
    setUserTimeZone(TimeManager.getUserTimeZone());
  }, []);

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
  }, [patientConstants]);

  // New function to process insulin data
  const processInsulinData = useCallback((rawInsulin) => {
    if (!Array.isArray(rawInsulin)) {
      console.error('processInsulinData received non-array data:', rawInsulin);
      return [];
    }

    return rawInsulin.map(insulin => {
      // Parse timestamps
      const administrationTime = TimeManager.parseTimestamp(insulin.taken_at || insulin.scheduled_time);

      return {
        id: insulin.id,
        medication: insulin.medication,
        insulinType: insulin.medication, // Alias for consistency
        dose: insulin.dose,
        administrationTime: administrationTime.valueOf(),
        formattedTime: TimeManager.formatDate(
          administrationTime,
          TimeManager.formats.DATETIME_DISPLAY
        ),
        date: TimeManager.formatDate(administrationTime, 'YYYY-MM-DD'),
        time: TimeManager.formatDate(administrationTime, 'HH:mm'),
        mealId: insulin.meal_id,
        mealType: insulin.meal_type,
        bloodSugar: insulin.blood_sugar,
        suggestedDose: insulin.suggested_dose,
        notes: insulin.notes || '',
        // Add pharmacokinetic parameters if available
        pharmacokinetics: insulin.pharmacokinetics ||
          InsulinEffect.getInsulinParameters(insulin.medication, patientConstants)
      };
    }).sort((a, b) => a.administrationTime - b.administrationTime); // Sort chronologically
  }, [patientConstants]);

  const generateCombinedData = useCallback((mealData, insulinData, bloodGlucoseData) => {
    // Create options object from component state and context values
    const options = {
      timeScale,
      targetGlucose,
      includeFutureEffect,
      futureHours,
      effectDurationHours,
      patientConstants
    };

    // Create context functions object
    const contextFunctions = {
      getBloodSugarAtTime,
      getBloodSugarStatus,
      getFilteredData
    };

    // If we have insulin data, generate combined effects
    if (insulinData && insulinData.length > 0) {
      return generateCombinedEffectsTimeline(
        mealData,
        insulinData,
        bloodGlucoseData,
        options,
        contextFunctions,
        TimeManager,
        InsulinEffect
      );
    } else {
      // Otherwise just generate meal effects
      return generateMealTimelineData(
        mealData,
        bloodGlucoseData,
        options,
        contextFunctions,
        TimeManager
      );
    }
  }, [targetGlucose, includeFutureEffect, futureHours,
    getBloodSugarAtTime, getBloodSugarStatus, getFilteredData, TimeManager, patientConstants,
    timeScale, effectDurationHours]);

  // Fetch meal and insulin data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setIsFetching(true);
      setInsulinError('');
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Get time settings from TimeContext
      const timeSettings = timeContext && timeContext.getAPITimeSettings
        ? getAPITimeSettings()
        : {
            startDate: timeContext ? dateRange.start : localDateRange.start,
            endDate: TimeManager.formatDate(
              TimeManager.addHours(
                new Date(timeContext ? dateRange.end : localDateRange.end),
                includeFutureEffect ? futureHours : 0
              ),
              'YYYY-MM-DD'
            )
          };

      console.log("Fetching data for date range:", timeSettings);

      // Fetch meals and insulin data in parallel
      const [mealsResponse, insulinResponse] = await Promise.all([
        // Fetch meals from meals-only API endpoint
        axios.get(
          patientId
            ? `http://localhost:5000/api/patient/${patientId}/meals-only?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}`
            : `http://localhost:5000/api/meals-only?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),

        // Fetch insulin data
        axios.get(
          `http://localhost:5000/api/insulin-data?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}${patientId ? `&patient_id=${patientId}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      ]);

      // Process meal data
      if (mealsResponse.data && Array.isArray(mealsResponse.data.meals)) {
        const processedMeals = processMealData(mealsResponse.data.meals);
        console.log("Processed meals:", processedMeals.length);
        setMeals(processedMeals);
        setFilteredMeals(processedMeals);
      } else {
        console.error('Invalid meal response structure:', mealsResponse.data);
        setError('Invalid meal data format received from server');
        setMeals([]);
        setFilteredMeals([]);
      }

      // Process insulin data
      if (insulinResponse.data && Array.isArray(insulinResponse.data.insulin_logs)) {
        const processedInsulin = processInsulinData(insulinResponse.data.insulin_logs);
        console.log("Processed insulin doses:", processedInsulin.length);
        setInsulinData(processedInsulin);

        // Extract unique insulin types
        const types = [...new Set(processedInsulin.map(dose => dose.medication))];
        setInsulinTypes(types);
        console.log("Found insulin types:", types);

        // Initialize selected insulin types if not already set
        if (selectedInsulinTypes.length === 0 && types.length > 0) {
          setSelectedInsulinTypes(types);
        }
      } else {
        console.error('Invalid insulin response structure:', insulinResponse.data);
        setInsulinError('Invalid insulin data format received from server');
        setInsulinData([]);
      }

      // Filter blood sugar data to match our date range
      let filteredBloodSugar = [];
      if (bloodSugarData && bloodSugarData.length > 0) {
        filteredBloodSugar = getFilteredData(bloodSugarData);
        console.log("Filtered blood sugar readings from context:", filteredBloodSugar.length);
      }

      // Generate combined data using processed meals and insulin
      const processedMeals = processMealData(mealsResponse.data.meals);
      const processedInsulin = processInsulinData(insulinResponse.data.insulin_logs);

      const combinedResult = generateCombinedData(
        processedMeals,
        processedInsulin,
        filteredBloodSugar
      );

      console.log("Combined data points:", combinedResult.length);

      // Debug check for meal/insulin effects
      const pointsWithMealEffects = combinedResult.filter(p => p.totalMealEffect > 0);
      const pointsWithInsulinEffects = combinedResult.filter(p => p.activeInsulin > 0);

      console.log("Points with meal effects:", pointsWithMealEffects.length);
      console.log("Points with insulin effects:", pointsWithInsulinEffects.length);

      setCombinedData(combinedResult);

      // Call the onDataLoaded callback if provided
      if (onDataLoaded && typeof onDataLoaded === 'function') {
        onDataLoaded(processedMeals);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
      setIsFetching(false);

      // Update the last fetched date range
      if (timeContext) {
        lastFetchedDateRange.current = {
          start: dateRange.start,
          end: dateRange.end
        };
      }
    }
  }, [timeContext, getAPITimeSettings, dateRange, localDateRange, includeFutureEffect,
      futureHours, patientId, processMealData, processInsulinData, getFilteredData,
      generateCombinedData, bloodSugarData, onDataLoaded, selectedInsulinTypes.length]);

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
    if (didFetchRef.current && bloodSugarData && bloodSugarData.length > 0 &&
        filteredMeals.length > 0) {
      const filteredData = getFilteredData(bloodSugarData);
      if (filteredData.length > 0) {
        console.log("Regenerating combined data with updated blood sugar data");
        const combinedResult = generateCombinedData(filteredMeals, insulinData, filteredData);
        setCombinedData(combinedResult);
      }
    }
  }, [bloodSugarData, getFilteredData, filteredMeals, insulinData, generateCombinedData]);

  // Handler for insulin type filter toggling
  const handleInsulinTypeToggle = useCallback((insulinType) => {
    setSelectedInsulinTypes(prev => {
      if (prev.includes(insulinType)) {
        return prev.filter(type => type !== insulinType);
      } else {
        return [...prev, insulinType];
      }
    });
  }, []);

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
    return TimeManager.formatDate(new Date(timestamp), TimeManager.formats.CHART_TICKS_MEDIUM);
  }, []);

  // Helper function to get consistent colors for meal types
  const getMealColor = useCallback((mealType, isEffect = false) => {
    // Enhanced color scheme with more vibrant colors
    const colorMap = {
      'breakfast': '#9c6ade', // Brighter purple
      'lunch': '#50c878',     // Emerald green
      'dinner': '#ff5722',    // Deeper orange
      'snack': '#ffc107',     // Vibrant yellow
      'normal': '#8a2be2'     // More vibrant purple
    };

    const baseColor = colorMap[mealType] || '#9c6ade'; // Default to bright purple

    if (isEffect) {
      // For effect lines, use a slightly different shade
      return adjustColorBrightness(baseColor, -15);
    }

    return baseColor;
  }, []);

  // Helper function to get consistent colors for insulin types
  const getInsulinColor = useCallback((insulinType, index = 0) => {
    // Color scheme for insulin types
    const colorMap = {
      'insulin_lispro': '#2196F3',      // Blue
      'insulin_aspart': '#00BCD4',      // Cyan
      'insulin_glulisine': '#4CAF50',   // Green
      'regular_insulin': '#009688',     // Teal
      'nph_insulin': '#FF9800',         // Orange
      'insulin_glargine': '#795548',    // Brown
      'insulin_detemir': '#607D8B',     // Blue Grey
      'insulin_degludec': '#9C27B0'     // Purple
    };

    // Return mapped color or use index-based fallback
    return colorMap[insulinType] || [
      '#2196F3', '#00BCD4', '#4CAF50', '#009688',
      '#FF9800', '#795548', '#607D8B', '#9C27B0'
    ][index % 8];
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

  // Format legend text to clean up labels
  const formatLegendText = useCallback((value) => {
    // Format specific data series properly
    if (value === 'bloodSugar') {
      return 'Blood Sugar (with meal effects, future)';
    } else if (value === 'estimatedBloodSugar') {
      return 'Baseline Blood Sugar (historical)';
    } else if (value === 'targetWithMealEffect') {
      return 'Target + Meal Effect';
    } else if (value === 'totalMealEffect') {
      return 'Total Meal Effect';
    } else if (value === 'bloodSugarWithCombinedEffects') {
      return 'Blood Sugar (with meal & insulin)';
    } else if (value === 'activeInsulin') {
      return 'Active Insulin';
    }

    // Handle meal-related entries
    if (value.includes('mealCarbs.')) {
      return 'Meal Carbs';
    } else if (value.includes('mealEffect.')) {
      return 'Meal Effect';
    }

    // Handle insulin-related entries
    if (value.includes('insulinBars.')) {
      const insulinType = value.split('.')[1];
      return `${insulinType.replace(/_/g, ' ')} Dose`;
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

  const prepareChartData = useCallback((data) => {
    if (!data || !Array.isArray(data)) return [];

    const now = new Date().getTime();

    return data.map(point => {
      const isHistorical = point.timestamp < now;
      const newPoint = { ...point };

      // For historical data (before now)
      if (isHistorical) {
        if (!point.isActualReading) {
          // For estimated points, hide the bloodSugar (dark purple) line
          // but keep estimatedBloodSugar (light purple) line
          newPoint.bloodSugar = null;
        }
        // For actual readings, keep both values so dots appear correctly
      }
      // For future data (after now)
      else {
        // IMPORTANT: Don't null out estimatedBloodSugar for future points
        // Keep both lines for future projection

        // Ensure we have a valid estimatedBloodSugar for the baseline
        if (newPoint.estimatedBloodSugar === null || newPoint.estimatedBloodSugar === undefined ||
            newPoint.estimatedBloodSugar === 0) {
          // If missing, use the original baseline from the bloodSugar context
          // or fall back to target glucose as a reasonable baseline
          newPoint.estimatedBloodSugar = newPoint.baselineBloodSugar || targetGlucose;
        }

        // Make sure bloodSugar (with meal effect) is properly set for future points
        if (!point.isActualReading) {
          // Keep the bloodSugar value for the dark purple line (with meal effect)
        }
      }

      // Store the original bloodSugar value for tooltips
      newPoint.bloodSugarWithMealEffect = point.bloodSugar;

      return newPoint;
    });
  }, [targetGlucose]);

  // Enhanced custom tooltip to show meal and insulin data
  const CustomCombinedTooltip = useCallback(({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const now = new Date().getTime();
      const isHistorical = data.timestamp < now;

      // Validate all critical data values
      const bloodSugar = isHistorical
        ? (!isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A')
        : (!isNaN(data.bloodSugar) ? Math.round(data.bloodSugar) : 'N/A');

      const estimatedBS = !isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A';
      const bloodSugarWithEffect = !isNaN(data.bloodSugarWithMealEffect) ?
        Math.round(data.bloodSugarWithMealEffect) : bloodSugar;
      const targetWithEffect = !isNaN(data.targetWithMealEffect) ?
        Math.round(data.targetWithMealEffect) : 'N/A';
      const combinedBloodSugar = !isNaN(data.bloodSugarWithCombinedEffects) ?
        Math.round(data.bloodSugarWithCombinedEffects) : 'N/A';

      const mealImpact = data.mealImpactMgdL ||
        (data.totalMealEffect && !isNaN(data.totalMealEffect) ?
          parseFloat((data.totalMealEffect * 1.0).toFixed(1)) : 0);

      // Get insulin data
      const activeInsulin = !isNaN(data.activeInsulin) ?
        parseFloat(data.activeInsulin.toFixed(2)) : 0;
      const insulinBgImpact = !isNaN(data.insulinBgImpact) ?
        Math.abs(parseFloat(data.insulinBgImpact.toFixed(1))) : 0;

      return (
        <div className="combined-effect-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

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
                {data.totalMealEffect > 0 && (
                  <p className="tooltip-projected">
                    With meal effect: <strong>{isHistorical ? bloodSugarWithEffect : bloodSugar} mg/dL</strong>
                    <span className="tooltip-impact"> (+{mealImpact.toFixed(1)} mg/dL)</span>
                  </p>
                )}
                {data.activeInsulin > 0 && (
                  <p className="tooltip-insulin-effect">
                    With insulin effect: <strong>{Math.max(70, estimatedBS - insulinBgImpact)} mg/dL</strong>
                    <span className="tooltip-impact"> (-{insulinBgImpact} mg/dL)</span>
                  </p>
                )}
                {data.totalMealEffect > 0 && data.activeInsulin > 0 && (
                  <p className="tooltip-combined-effect">
                    With combined effects: <strong>{combinedBloodSugar} mg/dL</strong>
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

          {/* Show meal effect information if present */}
          {data.totalMealEffect > 0 && (
            <div className="tooltip-section tooltip-meal-section">
              <h4>Meal Impact:</h4>
              <p className="tooltip-meal-impact">
                Raw effect: <strong>+{mealImpact.toFixed(1)} mg/dL</strong>
              </p>
              {/* If there are specific meals at this time point */}
              {data.meals && data.meals.length > 0 && (
                <div className="tooltip-meals">
                  {data.meals.map((meal, idx) => (
                    <p key={idx} className="tooltip-meal">
                      {meal.mealType}: {meal.carbs}g carbs
                      {meal.protein > 0 && `, ${meal.protein}g protein`}
                      {meal.fat > 0 && `, ${meal.fat}g fat`}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Show insulin data if present */}
          {data.activeInsulin > 0 && (
            <div className="tooltip-section tooltip-insulin-section">
              <h4>Insulin Activity:</h4>
              <p className="tooltip-insulin-impact">
                Active insulin: <strong>{activeInsulin} units</strong>
                <span className="tooltip-impact"> (-{insulinBgImpact} mg/dL effect)</span>
              </p>

              {/* Show individual insulin contributions */}
              {data.insulinContributions && data.insulinContributions.length > 0 && (
                <div className="tooltip-insulin-breakdown">
                  {data.insulinContributions.map((contrib, idx) => (
                    <p key={idx} className="tooltip-insulin-dose">
                      {contrib.insulinType.replace(/_/g, ' ')}: {contrib.activeUnits.toFixed(2)} units
                      <span className="tooltip-percentage"> ({Math.round(contrib.activityPercent)}% active)</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Show insulin doses administered at this time point */}
              {data.doseDetails && data.doseDetails.length > 0 && (
                <div className="tooltip-insulin-doses">
                  <p className="tooltip-dose-title">Doses at this time:</p>
                  {data.doseDetails.map((dose, idx) => (
                    <p key={idx} className="tooltip-dose">
                      {dose.insulinType.replace(/_/g, ' ')}: {dose.doseAmount} units
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Target glucose information (second visualization) */}
          {data.totalMealEffect > 0 && (
            <div className="tooltip-section tooltip-target-section">
              <h4>Target Impact:</h4>
              <p>Target glucose: {targetGlucose} mg/dL</p>
              <p className="tooltip-target-impact">
                With same meal: <strong>{targetWithEffect} mg/dL</strong>
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
        </div>
      );
    }
    return null;
  }, [targetGlucose]);

  // Custom dot for blood sugar readings on chart
  const CustomBloodSugarDot = useCallback((props) => {
    const { cx, cy, payload, index } = props;

    // Only render dots for actual readings
    if (!payload || !payload.isActualReading || !cx || !cy) return null;

    // Determine dot properties based on reading type and relation to target
    const targetDiff = payload.bloodSugar - targetGlucose;
    const radius = 4;
    const strokeWidth = 2;

    // Base color on relationship to target
    let strokeColor;
    if (targetDiff > targetGlucose * 0.3) {
      strokeColor = '#ff4444'; // High
    } else if (targetDiff < -targetGlucose * 0.3) {
      strokeColor = '#ff8800'; // Low
    } else {
      strokeColor = '#8031A7'; // Normal
    }

    let fillColor = "#ffffff"; // White fill for all actual readings

    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        fill={fillColor}
      />
    );
  }, [targetGlucose]);

  // Check if current time is within chart range
  const currentTimeInRange = timeContext && timeContext.isTimeInRange ?
                            timeContext.isTimeInRange(new Date().getTime()) :
                            TimeManager.isTimeInRange(
                              new Date().getTime(),
                              timeScale.start,
                              timeScale.end
                            );

  // Render combined meal and insulin effect chart
  const renderCombinedEffectChart = () => (
    <ResponsiveContainer width="100%" height={500}>
      <ComposedChart data={prepareChartData(combinedData)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="timestamp"
          type="number"
          scale="time"
          domain={[timeScale.start, timeScale.end]}
          ticks={timeContext && timeContext.generateTimeTicks ?
                timeContext.generateTimeTicks() :
                TimeManager.generateTimeTicks(timeScale.start, timeScale.end, timeScale.tickInterval)}
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
        {(viewMode === 'combined' || viewMode === 'meals') && showMeals && (
          <YAxis
            yAxisId="mealCarbs"
            orientation="right"
            domain={[0, 'dataMax + 10']}
            label={{
              value: 'Carbohydrates (g)',
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
            domain={[0, 2]} // Fixed domain to make small effects more visible
            label={{ value: 'Meal Effect (units)', angle: -90, position: 'insideRight' }}
          />
        )}

        {/* NEW - Y-axis for insulin doses - BIDIRECTIONAL */}
        {(viewMode === 'combined' || viewMode === 'insulin') && showInsulinDoses && (
          <YAxis
            yAxisId="insulinDose"
            orientation="right"
            domain={[-30, 0]} // Only negative domain for clearer bars
            ticks={[-30, -25, -20, -15, -10, -5, 0]}
            tickFormatter={(value) => Math.abs(value)} // Show positive values on ticks
            label={{
              value: 'Insulin Dose (units)',
              angle: -90,
              position: 'insideRight'
            }}
          />
        )}

        {/* NEW - Y-axis for insulin effect - BIDIRECTIONAL */}
        {(viewMode === 'combined' || viewMode === 'insulin') && showInsulinEffect && (
          <YAxis
            yAxisId="insulinEffect"
            orientation="right"
            domain={[-5, 0]} // Only negative domain for clearer visualization
            ticks={[-5, -4, -3, -2, -1, 0]}
            tickFormatter={(value) => Math.abs(value)} // Show positive values on ticks
            label={{ value: 'Active Insulin (units)', angle: -90, position: 'insideRight' }}
          />
        )}

        <Tooltip content={<CustomCombinedTooltip />} />
        <Legend formatter={formatLegendText} />

        {/* Zero line for insulin dose axis */}
        {(viewMode === 'combined' || viewMode === 'insulin') && showInsulinDoses && (
          <ReferenceLine
            y={0}
            yAxisId="insulinDose"
            stroke="#888888"
            strokeWidth={1}
          />
        )}

        {/* Target glucose reference lines */}
        {showBloodSugar && (
          <>
            {/* High threshold */}
            <ReferenceLine
              y={targetGlucose * 1.3}
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
              y={targetGlucose}
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
              y={targetGlucose * 0.7}
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

        {/* Blood Sugar Visualization */}
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

            {/* NEW - Blood sugar with combined effects (green) */}
            {showCombinedEffects && (
              <Line
                yAxisId="bloodSugar"
                type="basis"
                dataKey="bloodSugarWithCombinedEffects"
                name="Blood Sugar with Combined Effects"
                stroke="#00A36C"  // Green
                strokeWidth={2.5}
                strokeDasharray="5 2"  // Dashed
                connectNulls={false}
                isAnimationActive={false}
                dot={false}
              />
            )}
          </>
        )}

        {/* Second visualization: Target with meal effect line */}
        {showBloodSugar && showMealEffect && (
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
              if (!payload.totalMealEffect || payload.totalMealEffect <= 0) return null;

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

        {/* Meal Bars */}
        {(viewMode === 'combined' || viewMode === 'meals') && showMeals && filteredMeals.map(meal => (
          <Bar
            key={`meal-${meal.id}`}
            yAxisId="mealCarbs"
            dataKey={`mealCarbs.${meal.id}`}
            name={`${meal.mealType} (${meal.formattedTime})`}
            fill={getMealColor(meal.mealType)}
            barSize={80}  // Wider bars for better visibility with bidirectional
            fillOpacity={0.85}
            stroke={getMealColor(meal.mealType)}
            strokeWidth={2}
          />
        ))}

        {/* NEW - Insulin Dose Bars */}
        {(viewMode === 'combined' || viewMode === 'insulin') && showInsulinDoses &&
          selectedInsulinTypes.map((insulinType, idx) => (
            <Bar
              key={`insulin-${insulinType}-${idx}`}
              yAxisId="insulinDose"
              dataKey={`insulinBars.${insulinType}`}
              name={`${insulinType.replace(/_/g, ' ')} Dose`}
              fill={getInsulinColor(insulinType, idx)}
              barSize={80}  // Same width as meal bars
              fillOpacity={0.85}
              stroke={getInsulinColor(insulinType, idx)}
              strokeWidth={2}
            />
          ))
        }

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

        {/* NEW - Insulin Effect Area */}
        {(viewMode === 'combined' || viewMode === 'insulin') && showInsulinEffect && (
          <Area
            yAxisId="insulinEffect"
            type="monotone"
            dataKey="activeInsulinBidirectional"  // Use bidirectional value
            name="Active Insulin"
            fill="#00BCD4"  // Cyan fill
            stroke="#0097A7"  // Darker cyan stroke
            fillOpacity={0.4}
            strokeWidth={1.5}
            isAnimationActive={false}
          />
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

    // Get meal effect projection using TimeEffect utility
    let mealEffects = [];

    // Create patient factors object for TimeEffect
    const patientFactors = {
      proteinFactor: proteinFactor,
      fatFactor: fatFactor,
      absorptionFactors: patientConstants?.absorption_modifiers || {
        very_fast: 1.4,
        fast: 1.2,
        medium: 1.0,
        slow: 0.8,
        very_slow: 0.6
      },
      dawnPhenomenonFactor: patientConstants?.dawn_phenomenon_factor || 1.2
    };

    try {
      // Attempt to use TimeEffect utility first
      mealEffects = TimeEffect.calculateBGImpactCurve({
        nutrition: {
          carbs: carbs,
          protein: protein,
          fat: fat,
          absorptionType: detailView.nutrition.absorptionType || 'medium'
        },
        timestamp: detailView.timestamp
      }, patientFactors, effectDurationHours, 15);

      // If no results or error, fall back to local calculation
      if (!mealEffects || mealEffects.length === 0) {
        mealEffects = calculateMealEffect(detailView);
      }
    } catch (error) {
      console.error("Error using TimeEffect, falling back to local calculation:", error);
      mealEffects = calculateMealEffect(detailView);
    }

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

        {/* Meal Effect Visualization */}
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

  // Render nutrition distribution chart
  const renderNutritionChart = () => {
    // Determine if we need to apply special handling for sparse data (like single meal)
    const isSparseData = filteredMeals.length <= 1;

    return (
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
            ticks={timeContext && timeContext.generateTimeTicks ?
                  timeContext.generateTimeTicks() :
                  TimeManager.generateTimeTicks(timeScale.start, timeScale.end, timeScale.tickInterval)}
            tickFormatter={formatXAxis}
            angle={-45}
            textAnchor="end"
            height={70}
          />
          <YAxis />
          <Tooltip
            labelFormatter={(timestamp) => TimeManager.formatDate(timestamp, TimeManager.formats.DATETIME_DISPLAY)}
            formatter={(value, name) => {
              return [value.toFixed(1) + "g", name];
            }}
          />
          <Legend />

          {/* Keep stacking behavior in both cases but force size for sparse data */}
          <Bar
            dataKey="nutrition.totalCarbs"
            name="Carbs (g)"
            fill="#8884d8"
            stackId="nutrition"
            barSize={isSparseData ? 40 : undefined} // Force wide bars only for single meal
          />
          <Bar
            dataKey="nutrition.proteinCarbEquiv"
            name={`Protein as Carbs (${patientConstants?.protein_factor || 0.5}x)`}
            fill="#82ca9d"
            stackId="nutrition"
            barSize={isSparseData ? 40 : undefined}
          />
          <Bar
            dataKey="nutrition.fatCarbEquiv"
            name={`Fat as Carbs (${patientConstants?.fat_factor || 0.2}x)`}
            fill="#ffc658"
            stackId="nutrition"
            barSize={isSparseData ? 40 : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    );
  };

  // Main render function
  if (loading && !filteredMeals.length) {
    return <div className="loading">Loading meal data...</div>;
  }

  return (
    <div className={`meal-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Combined Meal & Insulin Impact Visualization</h2>}

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
          <button
            className={`toggle-btn ${viewMode === 'insulin' ? 'active' : ''}`}
            onClick={() => setViewMode('insulin')}
          >
            Insulin
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
                value={timeContext ? dateRange : localDateRange}
                onChange={handleDateRangeChange}
                useTimeContext={!!timeContext}
                showPresets={false}
              />
            </div>

            <div className="quick-ranges">
              <button onClick={() => timeContext ? timeContext.applyDatePreset(1) : applyDatePreset(1)}>
                <FaCalendarAlt /> Today
              </button>
              <button onClick={() => timeContext ? timeContext.applyDatePreset(7) : applyDatePreset(7)}>
                <FaCalendarAlt /> Week
              </button>
              <button onClick={() => timeContext ? timeContext.applyDatePreset(30) : applyDatePreset(30)}>
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

            {/* NEW - Insulin type filters */}
            {insulinTypes.length > 0 && (
              <div className="insulin-type-filter">
                <label>
                  <FaFilter /> Insulin Types:
                </label>
                <div className="insulin-filter-options">
                  {insulinTypes.map((type, idx) => (
                    <label key={type} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedInsulinTypes.includes(type)}
                        onChange={() => handleInsulinTypeToggle(type)}
                      />
                      <span style={{color: getInsulinColor(type, idx)}}>
                        {type.replace(/_/g, ' ')}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

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
                  className={`chart-type-btn ${chartType === 'combined' ? 'active' : ''}`}
                  onClick={() => handleChartTypeChange('combined')}
                >
                  Combined Effects
                </button>
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
                <div className="display-section">
                  <h4>Meal Settings</h4>
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
                </div>

                <div className="display-section">
                  <h4>Insulin Settings</h4>
                  <label className="display-option">
                    <input
                      type="checkbox"
                      checked={showInsulinDoses}
                      onChange={() => setShowInsulinDoses(!showInsulinDoses)}
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
                </div>

                <div className="display-section">
                  <h4>Blood Sugar Display</h4>
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
                      checked={showCombinedEffects}
                      onChange={() => setShowCombinedEffects(!showCombinedEffects)}
                    />
                    Show Combined Effects
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
                        onChange={(e) => setFutureHoursInContext(parseInt(e.target.value) || 7)}
                      />
                    </div>
                  )}
                </div>

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
      {insulinError && <div className="error-message">{insulinError}</div>}

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
                  <FaInfoCircle /> About Combined Effects
                </button>

                {showFactorInfo && (
                  <div className="info-panel">
                    <h4>Combined Effects Visualization Explained</h4>
                    <p>
                      This chart shows the complete picture of how meals and insulin affect blood glucose:
                    </p>
                    <ul>
                      <li><strong>Upward Bars:</strong> Represent meal carbohydrate content that raises blood glucose</li>
                      <li><strong>Downward Bars:</strong> Represent insulin doses that lower blood glucose</li>
                      <li><strong>Green Area (up):</strong> Shows the meal's effect on blood glucose</li>
                      <li><strong>Blue Area (down):</strong> Shows insulin's active effect over time</li>
                      <li><strong>Purple Line:</strong> Blood glucose baseline and with meal effect</li>
                      <li><strong>Green Line:</strong> Blood glucose with both meal and insulin effects</li>
                    </ul>
                    <p>
                      The bidirectional visualization helps clearly distinguish between factors that raise glucose
                      (meals, shown above the center line) and factors that lower glucose (insulin, shown below).
                    </p>
                    <button
                      className="close-button"
                      onClick={() => setShowFactorInfo(false)}
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>

              {chartType === 'combined' && renderCombinedEffectChart()}
              {chartType === 'mealEffect' && renderCombinedEffectChart()}
              {chartType === 'nutrition' && renderNutritionChart()}
            </div>
          )}

         // Replace the problematic Table View section with this simplified version

{activeView === 'table' && (
  <div className="table-container">
    <table className="meal-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Meal Type</th>
          <th>Carbs (g)</th>
          <th>Protein (g)</th>
          <th>Fat (g)</th>
          <th>Equivalent Carbs</th>
          <th>Insulin</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        {filteredMeals.length > 0 ? (
          filteredMeals.map((meal) => (
            <tr key={meal.id}>
              <td>{meal.formattedTime}</td>
              <td>{meal.mealType}</td>
              <td>{meal.nutrition.totalCarbs.toFixed(1)}</td>
              <td>{meal.nutrition.totalProtein.toFixed(1)}</td>
              <td>{meal.nutrition.totalFat.toFixed(1)}</td>
              <td>{meal.nutrition.totalCarbEquiv.toFixed(1)}</td>
              <td>
                {meal.insulin?.dose > 0 ?
                  `${meal.insulin.dose} units (${meal.insulin.type})` :
                  'None'}
              </td>
              <td>{meal.notes}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={8} className="no-data">
              No meal data found for the selected filters.
            </td>
          </tr>
        )}
      </tbody>
    </table>

    {/* Simple pagination controls */}
    <div className="pagination">
      <button onClick={() => console.log("First page")}>{'<<'}</button>
      <button onClick={() => console.log("Previous page")}>{'<'}</button>
      <button onClick={() => console.log("Next page")}>{'>'}</button>
      <button onClick={() => console.log("Last page")}>{'>>'}</button>
      <span>
        Page{' '}
        <strong>
          1 of {Math.ceil(filteredMeals.length / 10)}
        </strong>
      </span>
    </div>
  </div>
)}

{/* For the details view, provide a simplified version too */}
{activeView === 'details' && (
  <div className="meal-details">
    {detailView ? (
      <div className="meal-detail-view">
        {/* Meal detail content would be here */}
        <button onClick={() => setDetailView(null)}>
          Back to List
        </button>
      </div>
    ) : (
      <div className="meal-list">
        {filteredMeals.map((meal) => (
          <div key={meal.id} className="meal-list-item" onClick={() => setDetailView(meal)}>
            <div className="meal-list-header">
              <span className="meal-type">{meal.mealType}</span>
              <span className="meal-time">{meal.formattedTime}</span>
            </div>
            <div className="meal-list-details">
              <span>{meal.nutrition.totalCarbs.toFixed(1)}g carbs</span>
              <span>{meal.nutrition.totalProtein.toFixed(1)}g protein</span>
              <span>{meal.nutrition.totalFat.toFixed(1)}g fat</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

// And replace it with this properly structured version:
          {activeView === 'details' && (
            <div className="detail-container">
              {renderMealDetail()}
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
      )}
    </div>
  );
};
// Helper function for date presets when TimeContext is not available
const applyDatePreset = (days) => {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  const startStr = TimeManager.formatDate(start, 'YYYY-MM-DD');

  let end;
  if (days === 1) {
    // For "Last 24h": past day plus 12 hours
    end = new Date(now);
    end.setHours(end.getHours() + 12);
  } else {
    // Default: add one future day
    end = new Date(now);
    end.setDate(end.getDate() + 1);
  }
  const endStr = TimeManager.formatDate(end, 'YYYY-MM-DD');

  return { start: startStr, end: endStr };
};

export default MealVisualization;