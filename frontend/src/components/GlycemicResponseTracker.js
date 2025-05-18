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
import TimeContext from '../contexts/TimeContext';
import {
  calculateMealEffect,
  generateMealTimelineData,
  prepareChartData,
  calculateCarbEquivalents,
  applyDatePreset
} from '../utils/BG_Effect';
// Import insulin utilities
import {  generateInsulinTimelineData
} from '../utils/insulinUtils';
import TimeInput from '../components/TimeInput';
import { FaSync, FaFilter, FaCalendarAlt, FaInfoCircle, FaSyringe } from 'react-icons/fa';

// Import the extracted chart utilities
import {
  EnhancedTooltip,
  CustomBloodSugarDot,
  CustomInsulinDot,
  formatLegendText,
  InfoPanel,
  getMealColor,
  getInsulinColor
} from '../utils/MealChartUtils';

import './MealVisualization.css';

const GlycemicResponseTracker = ({
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
      patientConstants, timeScale, effectDurationHours,
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

  // Fetch insulin data
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
      generateCombinedData, bloodSugarData, onDataLoaded, fetchInsulinData, fetchActiveInsulin]);

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
  }, [bloodSugarData, getFilteredData]);

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

  // Close the sticky tooltip
  const handleCloseTooltip = () => {
    setStickyTooltip(null);
  };

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
          onClick={handleChartClick}
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
              // Set domain to negative values for insulin (top-down visualization)
              domain={['dataMin - 30', 0]}
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
                patientConstants={patientConstants}
                targetGlucose={targetGlucose}
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
                dot={(props) => CustomBloodSugarDot(props, targetGlucose)} // Pass targetGlucose
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
                // Return negative value for top-down bars
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
              // Use modified insulin data (negated)
              dataKey={(dataPoint) => dataPoint.activeInsulin > 0 ? -dataPoint.activeInsulin : null}
              name="Active Insulin"
              fill="#4a90e2"
              fillOpacity={0.3}
              stroke="#4a90e2"
              strokeWidth={1.5}
              dot={CustomInsulinDot}
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
            {/* Use the extracted InfoPanel component */}
            <InfoPanel
              showFactorInfo={showFactorInfo}
              setShowFactorInfo={setShowFactorInfo}
              patientConstants={patientConstants}
            />

            {renderMealEffectChart()}

            {/* Sticky tooltip container */}
            {stickyTooltip && (
              <div
                className={`tooltip-container ${stickyTooltip ? 'sticky' : ''}`}
                style={{
                  position: 'absolute',
                  left: tooltipPosition.left + 'px',
                  top: tooltipPosition.top + 'px',
                  transform: 'translate(-50%, 0)',
                  maxHeight: '60%',
                  maxWidth: '320px',
                  zIndex: 1000
                }}
              >
                <EnhancedTooltip
                  stickyData={stickyTooltip}
                  position={{left: 0, top: 0}}
                  isSticky={true}
                  onClose={handleCloseTooltip}
                  patientConstants={patientConstants}
                  targetGlucose={targetGlucose}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlycemicResponseTracker;