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
import TimeInput from '../components/TimeInput';
import { FaSync, FaFilter, FaCalendarAlt, FaInfoCircle } from 'react-icons/fa';

import './MealVisualization.css';

const SimpleMealEffectChart = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  height = '500px',
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
  const [viewMode, setViewMode] = useState('combined');

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

    // Notify parent when chart is ready
    if (onChartReady && typeof onChartReady === 'function') {
      onChartReady(chartRef.current);
    }
  }, [onChartReady]);

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

  const generateCombinedData = useCallback((mealData, bloodGlucoseData) => {
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

    // Use the utility function
    return generateMealTimelineData(
      mealData,
      bloodGlucoseData || [],
      options,
      contextFunctions,
      TimeManager
    );
  }, [targetGlucose, includeFutureEffect, futureHours,
      getBloodSugarAtTime, getBloodSugarStatus, getFilteredData, TimeManager, patientConstants,
      timeScale, effectDurationHours]);

  // Fetch meal and blood sugar data
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

        // Filter blood sugar data to match our date range - USE CONTEXT FUNCTION
        let filteredBloodSugar = [];
        if (bloodSugarData && bloodSugarData.length > 0) {
          filteredBloodSugar = getFilteredData ? getFilteredData(bloodSugarData) : [];
          console.log("Filtered blood sugar readings from context:", filteredBloodSugar.length);
        }

        // Generate combined data
        const combinedResult = generateCombinedData(processedMeals, filteredBloodSugar);
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
      generateCombinedData, bloodSugarData, onDataLoaded]);

  const debouncedFetchData = useCallback(
    debounce(() => {
      fetchData();
    }, 500),
    [fetchData]
  );

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
    if (didFetchRef.current && bloodSugarData && bloodSugarData.length > 0 && filteredMeals.length > 0) {
      const filteredData = getFilteredData ? getFilteredData(bloodSugarData) : [];
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

  // Format legend text to clean up labels
  const formatLegendText = useCallback((value) => {
    // Format specific data series properly
    if (value === 'bloodSugar') {
      return 'Blood Sugar (with meal effects, future)';
    } else if (value === 'estimatedBloodSugar') {
      return 'Baseline Blood Sugar (historical)';
    } else if (value === 'targetWithMealEffect') {
      return 'Default + Meal Effect';
    } else if (value === 'totalMealEffect') {
      return 'Total Meal Effect';
    }
    // Handle meal-related entries
    if (value.includes('mealCarbs.')) {
      return 'Meal Carbs';  // All meal carbs now have the same legend label
    } else if (value.includes('mealEffect.')) {
      return 'Meal Effect';
    }

    return value;
  }, []);

  // Custom meal effect tooltip
  const CustomMealTooltip = useCallback(({ active, payload, label }) => {
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

      const mealImpact = data.mealImpactMgdL ||
        (data.totalMealEffect && !isNaN(data.totalMealEffect) ?
          parseFloat((data.totalMealEffect * 1.0).toFixed(1)) : 0);

      return (
        <div className="meal-effect-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

          {/* Show meal effect information if present */}
          {data.totalMealEffect > 0 && (
            <div className="tooltip-section tooltip-meal-section">
              <h4>Meal Impact:</h4>
              <p className="tooltip-meal-impact">
                Raw effect: <strong>+{mealImpact.toFixed(1)} mg/dL</strong>
              </p>
            </div>
          )}

          {/* Indicate if showing historical or future data */}
          <p className="tooltip-data-type">
            {isHistorical ?
              <em>Showing historical data {!data.isActualReading && "(baseline estimate)"}</em> :
              <em>Showing future projection with meal effects</em>}
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
                {data.totalMealEffect > 0 && !isHistorical && (
                  <p className="tooltip-projected">
                    With meal effect: <strong>{bloodSugar} mg/dL</strong>
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
      <ResponsiveContainer width="100%" height={500}>
        <ComposedChart
          data={prepareChartData(combinedData, { targetGlucose: targetGlucose || 100 })}
          margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          ref={chartRef}
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
              domain={['dataMin - 20', 'dataMax + 20']}
              tickFormatter={(value) => Math.round(value)}
              label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
            />
          )}

          {/* Y-axis for meal carbs - excluded from insulin view */}
          {(viewMode === 'combined' || viewMode === 'effect') && (
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


{/* Y-axis for insulin (placeholder) */}
          {(viewMode === 'combined' || viewMode === 'insulin') && showMealEffect && (
  <YAxis
    yAxisId="insulinAxis"
    orientation="right"
    domain={[0, 10]} // Default domain for insulin units (adjust as needed)
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
              domain={[0, 2]} // Fixed domain to make small effects more visible
              label={{ value: 'Meal Effect (units)', angle: -90, position: 'insideRight' }}
            />
          )}

          <Tooltip content={<CustomMealTooltip />} />
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
{(viewMode === 'combined'  || viewMode === 'effect') && showMeals && (
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

//  add a placeholder for insulin in the meals view:
{/* Placeholder for future insulin data */}
{viewMode === 'insulin' && (
  <text
    x="50%"
    y="50%"
    textAnchor="middle"
    dominantBaseline="middle"
    className="insulin-placeholder-text"
    fill="#999"
  >
    Ready for insulin data integration
  </text>
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
      {!embedded && <h2 className="title">Meal Impact Chart</h2>}

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
          Insulin Ready
        </button>
        <button
          className={`toggle-btn ${viewMode === 'effect' ? 'active' : ''}`}
          onClick={() => setViewMode('effect')}
        >
          Meal Effect
        </button>
      </div>

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
                checked={showTargetMealEffect}
                onChange={() => setShowTargetMealEffect(!showTargetMealEffect)}
              />
              Show Target With Meal Effect
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
                    <li><strong>Green area:</strong> Shows the meal's projected effect on blood glucose</li>
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

            {renderMealEffectChart()}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleMealEffectChart;