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
  ReferenceLine
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import TimeManager from '../utils/TimeManager';
import TimeContext from '../contexts/TimeContext';
import TimeInput from '../components/TimeInput';
import { ACTIVITY_LEVELS } from '../constants';
import './ActivityVisualization.css';

const ActivityVisualization = ({ isDoctor = false, patientId = null }) => {
  // Use TimeContext for date range and future projection management
  const timeContext = useContext(TimeContext);
  const lastFetchedDateRange = useRef({ start: null, end: null });

  // Use contexts for activity coefficients and blood sugar data
  const { patientConstants } = useConstants();
  const {
    combinedData: bloodSugarData,
    getFilteredData,
    targetGlucose,
    timeScale,
    // Remove systemDateTime and currentUserLogin from context usage
    includeFutureEffect,
    futureHours,
    toggleFutureEffect,
    setFutureHours
  } = useBloodSugarData();

  // State management
  const [activityData, setActivityData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [activityLevels, setActivityLevels] = useState([]);
  const [selectedActivityLevels, setSelectedActivityLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showActualBloodSugar, setShowActualBloodSugar] = useState(true);
  const [showActivityEffect, setShowActivityEffect] = useState(true);
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [viewMode, setViewMode] = useState('combined'); // 'combined', 'activities', or 'effect'
  const [dataFetched, setDataFetched] = useState(false);
  const [effectDurationHours, setEffectDurationHours] = useState(5); // Hours activity affects blood sugar
const getBloodSugarStatus = useCallback((bloodSugar, target) => {
  const statusMap = {
    'low': { color: '#ff4444', label: 'Low' },
    'normal': { color: '#00C851', label: 'Normal' },
    'high': { color: '#ff8800', label: 'High' }
  };

  if (bloodSugar < target * 0.7) return statusMap.low;
  if (bloodSugar > target * 1.3) return statusMap.high;
  return statusMap.normal;
}, []);
  // Get user's time zone from TimeManager
  const userTimeZone = useMemo(() => TimeManager.getUserTimeZone(), []);

  // Helper function to get activity parameters from patient constants
  const getActivityParameters = useCallback((activityLevel) => {
    // Get activity coefficients from patient constants
    const activityCoefficients = patientConstants.activity_coefficients || {};

    // Get coefficient for this level (default to 1.0 for neutral effect)
    const coefficient = activityCoefficients[activityLevel] || 1.0;

    // Determine if activity increases or decreases blood sugar
   const activityLevel_num = Number(activityLevel);
const direction = activityLevel_num > 0 ? 'decrease' :
                 activityLevel_num < 0 ? 'increase' : 'neutral';

    // Calculate strength (magnitude of effect)
    const strength = Math.abs(coefficient - 1.0);

    return {
      coefficient,
      direction,
      strength,
      maxEffectHours: 1.5, // Time to peak effect
      totalDurationHours: effectDurationHours // Total duration of effect
    };
  }, [patientConstants, effectDurationHours]);

  // Calculate activity effect at a given time point
  const calculateActivityEffect = useCallback((hoursSinceActivity, duration, activityLevel) => {
    // Get parameters for this activity level
    const params = getActivityParameters(activityLevel);

    // Early return if outside the duration window
    const totalEffectHours = params.totalDurationHours + (duration || 1); // Add activity duration to effect duration
    if (hoursSinceActivity < 0 || hoursSinceActivity > totalEffectHours) {
      return 0;
    }

    let effectStrength = 0;

    // Calculate effect strength based on time elapsed
    if (hoursSinceActivity <= duration) {
      // Full effect during activity
      effectStrength = params.strength;
    } else {
      // Tapering effect after activity ends
      const timeAfterActivity = hoursSinceActivity - duration;
      const totalAfterEffectTime = totalEffectHours - duration;

      // Apply decay curve to effect strength
      effectStrength = params.strength * Math.exp(-2 * timeAfterActivity / totalAfterEffectTime);
    }


    // Convert effect strength to blood sugar impact
    // For coefficient > 1, positive effect (increases insulin need, decreases blood sugar)
    // For coefficient < 1, negative effect (decreases insulin need, increases blood sugar)
const effect = params.direction === 'decrease' ? -effectStrength :
              params.direction === 'increase' ? effectStrength : 0;
    return effect;
  }, [getActivityParameters]);

  // Helper function to convert activity level to bidirectional bar value
  // Inverts the values: high activity (1,2) becomes negative, low activity (-1,-2) becomes positive
  const getActivityBarValue = useCallback((level) => {
    // Convert level to number if it's a string
    const numLevel = Number(level);
    // Invert the value: high activity (positive) -> negative, low activity (negative) -> positive
    return -numLevel;
  }, []);

  // Generate combined data for timeline visualization
  const generateCombinedData = useCallback((activityData, bloodGlucoseData) => {
  try {
    // Find the earliest and latest timestamps
    const allTimestamps = [
      ...activityData.flatMap(a => [a.startTime, a.endTime]),
      ...bloodGlucoseData.map(d => d.readingTime)
    ].filter(Boolean);

    if (allTimestamps.length === 0) {
      return [];
    }

    const minTime = Math.min(...allTimestamps);
    let maxTime = Math.max(...allTimestamps);

    // If including future effects, extend the timeline by the specified number of hours
    if (includeFutureEffect) {
      const futureTime = TimeManager.getFutureProjectionTime(futureHours);
      maxTime = Math.max(maxTime, futureTime);
    }

    // Generate timeline with 15-minute intervals
    const timelineData = [];
    let currentTime = minTime;
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds

    // First, create a map of all exact blood sugar readings for quick lookup
    const exactBloodSugarMap = new Map();
    bloodGlucoseData.forEach(reading => {
      if (reading.isActualReading) {
        exactBloodSugarMap.set(reading.readingTime, reading);
      }
    });

    // Track which readings we've already included
    const includedReadings = new Set();

    while (currentTime <= maxTime) {
      const timePoint = {
        timestamp: currentTime,
        formattedTime: TimeManager.formatDate(currentTime, TimeManager.formats.DATETIME_DISPLAY),
        activities: {},
        activityEffects: {},
        totalActivityEffect: 0,
        // Default to not being an actual reading
        isActualReading: false,
        dataType: 'estimated'
      };

      // Check if there's an exact blood sugar reading at this time
      const exactBSReading = exactBloodSugarMap.get(currentTime);
      if (exactBSReading) {
        timePoint.bloodSugar = exactBSReading.bloodSugar;
        timePoint.bloodSugarStatus = exactBSReading.status;
        timePoint.isActualReading = true;
        timePoint.dataType = 'actual';
        includedReadings.add(currentTime);
      } else {
        // If no exact match, look for the closest reading within the interval window
        const searchTime = currentTime;
        const closestBloodSugar = bloodGlucoseData.find(bs =>
          !includedReadings.has(bs.readingTime) &&
          Math.abs(bs.readingTime - searchTime) < 15 * 60 * 1000 // Within 15 minutes
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.readingTime = closestBloodSugar.readingTime; // Keep original reading time
          timePoint.isActualReading = closestBloodSugar.isActualReading;
          timePoint.dataType = closestBloodSugar.dataType || (closestBloodSugar.isActualReading ? 'actual' : 'estimated');
          timePoint.isInterpolated = closestBloodSugar.isInterpolated;
          timePoint.isEstimated = closestBloodSugar.isEstimated;
          includedReadings.add(closestBloodSugar.readingTime);
        }
      }

      // Calculate activities and effects at this time
      const thisMoment = currentTime;
      activityData.forEach(activity => {
        // Record ongoing activities at this time
        if (activity.startTime <= thisMoment && activity.endTime >= thisMoment) {
          const activityKey = `level_${activity.level}`;
          const activityBarValue = getActivityBarValue(activity.level);
          timePoint.activities[activityKey] = activityBarValue;

          // Store activity details for tooltip
          if (!timePoint.activityDetails) timePoint.activityDetails = [];
          timePoint.activityDetails.push({
            level: activity.level,
            barValue: activityBarValue,
            levelLabel: activity.levelLabel,
            startTime: activity.startTime,
            endTime: activity.endTime,
            impact: activity.impact,
            notes: activity.notes
          });
        }

        // Calculate expected effect from each activity at current time
        const activityStartTime = activity.startTime;
        if (activityStartTime) {
          const hoursSinceActivityStart = (thisMoment - activityStartTime) / (60 * 60 * 1000);
          const durationHours = activity.endTime && activity.startTime ?
                           (activity.endTime - activity.startTime) / (60 * 60 * 1000) : 1;

          if (hoursSinceActivityStart >= 0 || includeFutureEffect) {
            const effect = calculateActivityEffect(hoursSinceActivityStart, durationHours, activity.level);
            if (effect !== 0) {
              const activityKey = `level_${activity.level}`;
              timePoint.activityEffects[activityKey] = (timePoint.activityEffects[activityKey] || 0) + effect;
              timePoint.totalActivityEffect += effect;
            }
          }
        }
      });

      // Add simulated blood sugar effect if we have an activity effect
      if (timePoint.totalActivityEffect !== 0) {
        // *** FIX: Use existing blood sugar as base when available, or target glucose when not ***
        const baseValue = timePoint.isActualReading ?
                          timePoint.bloodSugar : // Use actual reading value if it exists
                          (timePoint.bloodSugar || targetGlucose || 120); // Otherwise use interpolated value or target

        // *** FIX: We need to negate the effect because negative effects increase blood sugar ***
        const activityImpact = 50 * timePoint.totalActivityEffect; // Note the negative sign for correct direction

        // Always calculate the estimated impact
        timePoint.estimatedBloodSugar = baseValue + activityImpact;

        // *** FIX: Apply to bloodSugar for all non-actual readings (not just when bloodSugar is undefined) ***
        if (!timePoint.isActualReading) {
          timePoint.bloodSugar = timePoint.estimatedBloodSugar;
          timePoint.dataType = 'estimated';
          timePoint.isInterpolated = true;
          timePoint.isEstimated = true;
          // Update the status based on the new value
          if (timePoint.bloodSugar !== undefined) {
            timePoint.bloodSugarStatus = getBloodSugarStatus(timePoint.bloodSugar, targetGlucose);
          }
        }
      } else if (!timePoint.bloodSugar && showActualBloodSugar) {
        // When no activity effect and no reading, show target line
        timePoint.estimatedBloodSugar = targetGlucose;
        // Also set the primary value in this case
        timePoint.bloodSugar = targetGlucose;
      }

      if (timePoint.totalActivityEffect) {
        timePoint.totalActivityEffect = Math.round(timePoint.totalActivityEffect * 100) / 100;
      }

      timelineData.push(timePoint);
      currentTime += interval;
    }

    // Make a final pass to ensure all actual readings are included
    bloodGlucoseData.forEach(reading => {
      if (reading.isActualReading && !includedReadings.has(reading.readingTime)) {
        // Find the closest timeline point
        const timeIndex = timelineData.findIndex(p => p.timestamp > reading.readingTime) - 1;
        const insertIndex = timeIndex >= 0 ? timeIndex : timelineData.length;

        // Create a new point with the exact actual reading
        const newPoint = {
          timestamp: reading.readingTime,
          readingTime: reading.readingTime,
          formattedTime: TimeManager.formatDate(reading.readingTime, TimeManager.formats.DATETIME_DISPLAY),
          formattedReadingTime: TimeManager.formatDate(reading.readingTime, TimeManager.formats.DATETIME_DISPLAY),
          bloodSugar: reading.bloodSugar,
          bloodSugarStatus: reading.status,
          isActualReading: true,
          dataType: 'actual',
          activities: {},
          activityEffects: {},
          totalActivityEffect: 0
        };

        timelineData.splice(insertIndex + 1, 0, newPoint);
        includedReadings.add(reading.readingTime);
      }
    });

    // Sort by timestamp
    timelineData.sort((a, b) => a.timestamp - b.timestamp);

    return timelineData;
  } catch (error) {
    console.error('Error generating combined data:', error);
    return [];
  }
}, [calculateActivityEffect, targetGlucose, getActivityBarValue, includeFutureEffect, futureHours, showActualBloodSugar, getBloodSugarStatus]);


 const getActivityLevelLabel = useCallback((level) => {
    const matchingLevel = ACTIVITY_LEVELS.find(a => a.value === Number(level));
    return matchingLevel ? matchingLevel.label : `Level ${level}`;
  }, []);

  // Helper function to get activity impact coefficient
  const getActivityImpactCoefficient = useCallback((level) => {
    const activityCoefficients = patientConstants.activity_coefficients || {};
    return activityCoefficients[level] || 1.0;
  }, [patientConstants]);



  // Fetch activity and blood sugar data
const fetchData = useCallback(async () => {
  try {
    setLoading(true);
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('Authentication token not found');
    }

    // Get time settings from TimeContext
    const timeSettings = timeContext && timeContext.getAPITimeSettings
      ? timeContext.getAPITimeSettings()
      : {
          startDate: timeContext ? timeContext.dateRange.start : null,
          endDate: moment(timeContext ? timeContext.dateRange.end : null)
            .add(includeFutureEffect ? futureHours : 0, 'hours')
            .format('YYYY-MM-DD')
        };

    // Compare with last fetched range to prevent duplicate fetches
    if (
      lastFetchedDateRange.current.start === timeSettings.startDate &&
      lastFetchedDateRange.current.end === timeSettings.endDate
    ) {
      setLoading(false);
      return; // Skip fetch if date range hasn't changed
    }

    // Update lastFetchedDateRange ref
    lastFetchedDateRange.current = {
      start: timeSettings.startDate,
      end: timeSettings.endDate
    };

    // Use the activity API endpoint
    const endpoint = patientId
      ? `http://localhost:5000/api/patient/${patientId}/activity-history`
      : 'http://localhost:5000/api/activity';

    const activityResponse = await axios.get(
      `${endpoint}?start_date=${timeSettings.startDate}&end_date=${timeSettings.endDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Process activity data with proper memoization
    const processedActivityData = activityResponse.data.map(activity => {
      // Parse times
      const startTime = activity.startTime ? new Date(activity.startTime).getTime() : null;
      const endTime = activity.endTime ? new Date(activity.endTime).getTime() : null;

      return {
        id: activity.id || activity._id,
        level: activity.level,
        levelLabel: activity.levelLabel || getActivityLevelLabel(activity.level),
        impact: activity.impact || getActivityImpactCoefficient(activity.level),
        startTime,
        endTime,
        formattedStartTime: startTime ? TimeManager.formatDate(startTime, TimeManager.formats.DATETIME_DISPLAY) : 'N/A',
        formattedEndTime: endTime ? TimeManager.formatDate(endTime, TimeManager.formats.DATETIME_DISPLAY) : 'N/A',
        duration: TimeManager.calculateDuration(startTime, endTime).formatted,
        type: activity.type || 'unknown',
        notes: activity.notes || ''
      };
    });

    // Extract unique activity levels
    const levels = [...new Set(processedActivityData.map(a => a.level))];
    setActivityLevels(levels);

    // Only set selectedActivityLevels if it's empty and we have levels
    if (selectedActivityLevels.length === 0 && levels.length > 0) {
      setSelectedActivityLevels(levels);
    }

    // Save processed data
    setActivityData(processedActivityData);

    // Filter blood sugar data to match our date range
    let filteredBloodSugar = [];
    if (bloodSugarData && bloodSugarData.length > 0) {
      filteredBloodSugar = getFilteredData(bloodSugarData);
    }

    // Generate combined data
    const combinedResult = generateCombinedData(processedActivityData, filteredBloodSugar);
    setCombinedData(combinedResult);

    setError('');
    setDataFetched(true);
  } catch (error) {
    console.error('Error fetching activity data:', error);
    setError('Failed to load activity data. Please try again.');
  } finally {
    setLoading(false);
  }
}, [timeContext, includeFutureEffect, futureHours, patientId, selectedActivityLevels.length,
    getActivityLevelLabel, getActivityImpactCoefficient, getFilteredData, generateCombinedData]);

  // Helper function to get activity level label

const debouncedFetchData = useCallback(
  debounce(() => {
    fetchData();
  }, 500),
  [fetchData]
);

  // Effect to fetch data once when component mounts and when necessary params change
useEffect(() => {
  // Only fetch if we haven't fetched yet or if the date range changes
  if (!dataFetched ||
      (timeContext?.dateRange?.start && timeContext?.dateRange?.end)) {
    debouncedFetchData();
  }
}, [debouncedFetchData, dataFetched, timeContext?.dateRange]);

  // Regenerate combined data when blood sugar data changes
  useEffect(() => {
    if (dataFetched && bloodSugarData && bloodSugarData.length > 0 && activityData.length > 0) {
      const filteredData = getFilteredData(bloodSugarData);
      if (filteredData.length > 0) {
        console.log("Regenerating combined data with updated blood sugar data");
        const combinedResult = generateCombinedData(activityData, filteredData);
        setCombinedData(combinedResult);
      }
    }
  }, [bloodSugarData, getFilteredData, dataFetched, generateCombinedData, activityData]);

  // Handler for activity level filter toggling
  const handleActivityLevelToggle = useCallback((level) => {
    setSelectedActivityLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level);
      } else {
        return [...prev, level];
      }
    });
  }, []);

  // Custom dot renderer for blood sugar readings
  const CustomBloodSugarDot = useCallback((props) => {
    const { cx, cy, stroke, payload } = props;

    // Only render visible dots for actual readings
    if (!payload.isActualReading) return null;

    // Get color from status or use a default
    const dotColor = payload.bloodSugarStatus ?
      payload.bloodSugarStatus.color :
      (payload.bloodSugar > targetGlucose ? '#ff8800' : '#00C851');

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

  // Force update the data
 const handleForceUpdate = useCallback(() => {
  console.log('Forcing data update...');
  fetchData(); // Call the non-debounced version directly
}, [fetchData]);

     // Handler for when date range changes
  const handleDateRangeChange = useCallback(() => {
    // Don't automatically fetch - just mark that we need to update
    // This allows the user to make multiple changes before clicking Update
    console.log('Date range changed, click Update to refresh data');
  }, []);

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="activity-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

          {/* Display activities */}
          {data.activityDetails && data.activityDetails.length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Activities:</p>
              {data.activityDetails.map((activity, idx) => (
                <p key={idx} className="tooltip-activity">
                  {activity.levelLabel} - Impact: {Math.round((activity.impact - 1) * 100)}%
                  <span className="tooltip-direction">
                    {activity.level > 0 ? ' (Decreases blood sugar)' :
                     activity.level < 0 ? ' (Increases blood sugar)' :
                     ' (Neutral)'}
                  </span>
                </p>
              ))}
            </div>
          )}

          {/* Display activity effect */}
          {data.totalActivityEffect !== 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Activity Effect:</p>
              <p className="tooltip-effect">
                Total Effect: {Math.abs(data.totalActivityEffect).toFixed(2)} units
                ({data.totalActivityEffect > 0 ? 'Decreases' : 'Increases'} blood sugar)
              </p>
            </div>
          )}

          {/* Display blood sugar if available */}
          {data.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar:</p>
              <p className="tooltip-blood-sugar">
                {data.bloodSugar} mg/dL
                {data.bloodSugarStatus && ` (${data.bloodSugarStatus.label})`}
              </p>
            </div>
          )}

          {/* Display estimated blood sugar if available */}
          {data.estimatedBloodSugar && !data.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Estimated Blood Sugar:</p>
              <p className="tooltip-estimated-bg">
                ~{Math.round(data.estimatedBloodSugar)} mg/dL (estimated)
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  }, []);

  // Table columns definition
  const columns = useMemo(() => [
    {
      Header: 'Start Time',
      accessor: 'formattedStartTime',
      sortType: (a, b) => {
        return a.original.startTime - b.original.startTime;
      }
    },
    {
      Header: 'End Time',
      accessor: 'formattedEndTime'
    },
    {
      Header: 'Duration',
      accessor: 'duration'
    },
    {
      Header: 'Activity Level',
      accessor: 'levelLabel'
    },
    {
      Header: 'Impact',
      accessor: 'impact',
      Cell: ({ value }) => {
        // Round to nearest integer
        const percent = Math.round((value - 1) * 100);
        const direction = value > 1 ? 'increase' : value < 1 ? 'decrease' : 'none';
        return (
          <span className={`impact-${direction}`}>
            {direction === 'none' ? 'Neutral' : `${Math.abs(percent)}% ${direction}`}
          </span>
        );
      }
    },
    {
      Header: 'Blood Sugar Effect',
      accessor: row => row.level,
      Cell: ({ value }) => {
        const level = Number(value);
        return (
          <span className={level > 0 ? 'bs-decrease' : level < 0 ? 'bs-increase' : 'bs-neutral'}>
            {level > 0 ? 'Decrease' : level < 0 ? 'Increase' : 'Neutral'}
          </span>
        );
      },
      id: 'bloodSugarEffect'
    },
    {
      Header: 'Type',
      accessor: 'type',
      Cell: ({ value }) => value.charAt(0).toUpperCase() + value.slice(1)
    },
    {
      Header: 'Notes',
      accessor: 'notes',
      Cell: ({ value }) => value || 'No notes'
    }
  ], []);

  // Filter the activity data based on selectedActivityLevels
  const filteredActivityData = useMemo(() => {
    return activityData.filter(item => selectedActivityLevels.includes(item.level));
  }, [activityData, selectedActivityLevels]);

  // Set up the table instance
  const tableInstance = useTable(
    {
      columns,
      data: filteredActivityData,
      initialState: { pageIndex: 0, pageSize: 10 }
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
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize }
  } = tableInstance;

  // Format the X-axis labels using TimeManager
  const formatXAxis = useCallback((tickItem) => {
    return TimeManager.formatAxisTick(tickItem, timeScale.tickFormat || 'CHART_TICKS_MEDIUM');
  }, [timeScale]);

  // Generate ticks for x-axis based on time scale
  const ticks = useMemo(() => {
    return TimeManager.generateTimeTicks(timeScale.start, timeScale.end, timeScale.tickInterval || 12);
  }, [timeScale]);

  // Helper function to get consistent colors for activity levels
  const getActivityColor = useCallback((level, isEffect = false) => {
  // Color scheme based on activity level - MORE VIBRANT COLORS
  const colorMap = {
    '-2': '#FF1744', // Very low activity - intense red (increases BG)
    '-1': '#FF6D00', // Low activity - bright orange (increases BG)
    '0': '#00E676', // Normal activity - bright green (neutral)
    '1': '#00B0FF', // High activity - bright blue (decreases BG)
    '2': '#3D5AFE', // Vigorous activity - intense blue (decreases BG)
  };

  const baseColor = colorMap[level] || '#00E676'; // Default to normal

  if (isEffect) {
    // For effect lines, use a slightly different shade but still vibrant
    return adjustColorBrightness(baseColor, -15);
  }

  return baseColor;
}, []);

  // Helper function to adjust color brightness
  function adjustColorBrightness(hex, percent) {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // Determine which Y-axis ID to use for the current time reference line
  const currentTimeYAxisId = useMemo(() => {
    if (showActualBloodSugar) return "bloodSugar";
    return "activityLevel";
  }, [showActualBloodSugar]);

  // Process blood sugar data for display
  const processedBloodSugarData = useMemo(() => {
    if (!combinedData || combinedData.length === 0) return [];

    return combinedData.map((reading, index, array) => {
      // Check if this reading should connect to the previous one
      const connectToPrevious = index > 0 &&
        (reading.isActualReading || array[index-1].isActualReading) &&
        (reading.timestamp - array[index-1].timestamp <= 20 * 60 * 1000); // 20 minute maximum gap

      return {
        ...reading,
        connectToPrevious
      };
    });
  }, [combinedData]);

  // Check if current time is within chart range
  const currentTimeInRange = TimeManager.isTimeInRange(
    new Date().getTime(),
    timeScale.start,
    timeScale.end
  );

  return (
    <div className="activity-visualization">
      <h2 className="title">Activity Analysis</h2>

      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      <div className="view-toggle">
        <button
          className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveView('chart')}
        >
          Chart View
        </button>
        <button
          className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
          onClick={() => setActiveView('table')}
        >
          Table View
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
            className={`toggle-btn ${viewMode === 'activities' ? 'active' : ''}`}
            onClick={() => setViewMode('activities')}
          >
            Activities
          </button>
          <button
            className={`toggle-btn ${viewMode === 'effect' ? 'active' : ''}`}
            onClick={() => setViewMode('effect')}
          >
            Activity Effect
          </button>
        </div>
      )}

      {/* Modified Controls Section */}
<div className="controls">
  <div className="date-range-control">
    <TimeInput
      mode="daterange"
      value={timeContext ? timeContext.dateRange : null}
      onChange={timeContext ? (e) => {
        timeContext.handleDateRangeChange(e);
        handleDateRangeChange();
      } : null}
      useTimeContext={!!timeContext}
      label="Date Range"
      className="date-range-control"
    />

    <button className="update-btn" onClick={handleForceUpdate}>Update Data</button>
  </div>

  <div className="filters-and-options">
    <div className="activity-level-filters">
      <div className="filter-header">Activity Levels:</div>
      <div className="filter-options">
        {activityLevels.map((level, idx) => (
          <label key={`${level}_${idx}`} className="filter-option">
            <input
              type="checkbox"
              checked={selectedActivityLevels.includes(level)}
              onChange={() => handleActivityLevelToggle(level)}
            />
            {getActivityLevelLabel(level)}
          </label>
        ))}
      </div>
    </div>

    <div className="display-options">
      <label className="display-option">
        <input
          type="checkbox"
          checked={showActualBloodSugar}
          onChange={() => setShowActualBloodSugar(!showActualBloodSugar)}
        />
        Show Blood Sugar
      </label>
      <label className="display-option">
        <input
          type="checkbox"
          checked={showActivityEffect}
          onChange={() => setShowActivityEffect(!showActivityEffect)}
        />
        Show Activity Effect
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
          onChange={(e) => setEffectDurationHours(parseInt(e.target.value) || 5)}
        />
      </div>
    </div>
  </div>
        <button className="update-btn" onClick={handleForceUpdate}>Update Data</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
          <div className="loading">Loading activity data...</div>
      ) : combinedData.length === 0 ? (
          <div className="no-data">No activity data found for the selected date range.</div>
      ) : (
          <div className="content-container">
            {activeView === 'chart' && (
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height={500}>
                <ComposedChart
                  data={combinedData}
                  margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={[timeScale.start, timeScale.end]}
                    ticks={ticks}
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />

                  {/* Y-axis for blood sugar */}
                  {showActualBloodSugar && (
                    <YAxis
                      yAxisId="bloodSugar"
                      orientation="left"
                      domain={['dataMin - 20', 'dataMax + 20']}
                      tickFormatter={(value) => Math.round(value)}
                      label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
                    />
                  )}

                  {/* Y-axis for activity levels - MODIFIED to be bidirectional */}
                  {(viewMode === 'combined' || viewMode === 'activities') && (
                    <YAxis
                      yAxisId="activityLevel"
                      orientation={showActualBloodSugar ? "right" : "left"}
                      domain={[-10, 2]} // Balanced domain for bidirectional display
                      ticks={[-2, -1, 0, 1, 2]} // Ticks representing activity directions
                      label={{
                        value: 'Activity Level',
                        angle: -90,
                        position: showActualBloodSugar ? 'insideRight' : 'insideLeft'
                      }}
                    />
                  )}

                  {/* Y-axis for activity effect */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showActivityEffect && (
                    <YAxis
                      yAxisId="activityEffect"
                      orientation="right"
                      domain={[-2, 1]}
                      label={{ value: 'Activity Effect', angle: -90, position: 'insideRight' }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Zero line for activity level axis */}
                  {(viewMode === 'combined' || viewMode === 'activities') && (
                    <ReferenceLine
                      y={0}
                      yAxisId="activityLevel"
                      stroke="#888888"
                      strokeWidth={1}
                    />
                  )}

                  {/* Target glucose reference line */}
                  {showActualBloodSugar && (
                    <ReferenceLine
                      y={targetGlucose}
                      yAxisId="bloodSugar"
                      label="Target"
                      stroke="#FF7300"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Blood Sugar Line */}
                  {showActualBloodSugar && (
                    <Line
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="bloodSugar"
                      name="Blood Sugar"
                      stroke="#8884d8"
                      dot={CustomBloodSugarDot}
                      activeDot={{ r: 8 }}
                      connectNulls
                    />
                  )}

                  {/* Estimated Blood Sugar Line */}
                  {showActualBloodSugar && (
                    <Line
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="estimatedBloodSugar"
                      name="Estimated Blood Sugar"
                      stroke="#8884d8"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  )}

                  {/* Activity Level Bars */}
                  {(viewMode === 'combined' || viewMode === 'activities') && selectedActivityLevels.map((level, idx) => (
                    <Bar
                      key={`activity-${level}-${idx}`}
                      yAxisId="activityLevel"
                      dataKey={`activities.level_${level}`}
                      name={`${getActivityLevelLabel(level)} Activity`}
                      fill={getActivityColor(level)}
                      barSize={20}
                    />
                  ))}

                  {/* Activity Effect Area */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showActivityEffect && (
                    <Area
                      yAxisId="activityEffect"
                      type="monotone"
                      dataKey="totalActivityEffect"
                      name="Activity Effect"
                      fill="#82ca9d"
                      stroke="#82ca9d"
                      fillOpacity={0.3}
                    />
                  )}

                  {/* Reference lines for individual activity effects */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showActivityEffect &&
                    selectedActivityLevels.map((level, idx) => (
                      <Line
                        key={`effect-${level}-${idx}`}
                        yAxisId="activityEffect"
                        type="monotone"
                        dataKey={`activityEffects.level_${level}`}
                        name={`${getActivityLevelLabel(level)} Effect`}
                        stroke={getActivityColor(level, true)}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        dot={false}
                      />
                    ))}

                  {/* Current time reference line */}
                  {currentTimeInRange && (
                    <ReferenceLine
                      x={new Date().getTime()}
                      yAxisId={currentTimeYAxisId}
                      stroke="#ff0000"
                      strokeWidth={2}
                      label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="activity-legend">
                <h4>Activity Scale Guide</h4>
                <div className="activity-scale">
                  <div className="activity-scale-item">
                    <span className="scale-color" style={{ backgroundColor: getActivityColor('2') }}></span>
                    <span className="scale-label">Vigorous Activity (Level 2)</span>
                    <span className="scale-direction">Decreases Blood Sugar</span>
                  </div>
                  <div className="activity-scale-item">
                    <span className="scale-color" style={{ backgroundColor: getActivityColor('1') }}></span>
                    <span className="scale-label">High Activity (Level 1)</span>
                    <span className="scale-direction">Decreases Blood Sugar</span>
                  </div>
                  <div className="activity-scale-item">
                    <span className="scale-color" style={{ backgroundColor: getActivityColor('0') }}></span>
                    <span className="scale-label">Normal Activity (Level 0)</span>
                    <span className="scale-direction">Neutral Effect</span>
                  </div>
                  <div className="activity-scale-item">
                    <span className="scale-color" style={{ backgroundColor: getActivityColor('-1') }}></span>
                    <span className="scale-label">Low Activity (Level -1)</span>
                    <span className="scale-direction">Increases Blood Sugar</span>
                  </div>
                  <div className="activity-scale-item">
                    <span className="scale-color" style={{ backgroundColor: getActivityColor('-2') }}></span>
                    <span className="scale-label">Very Low Activity (Level -2)</span>
                    <span className="scale-direction">Increases Blood Sugar</span>
                  </div>
                </div>
              </div>

              <div className="chart-legend">
                <h4>Activity Level Details</h4>
                <div className="activity-levels-grid">
                  {activityLevels.filter(level => selectedActivityLevels.includes(level)).map((level, idx) => {
                    const coefficient = getActivityImpactCoefficient(level);
                    // Round to nearest integer
                    const percentEffect = Math.round((coefficient - 1) * 100);
                    const direction = coefficient > 1 ? 'increase' : coefficient < 1 ? 'decrease' : 'neutral';

                    return (
                      <div key={`legend-${level}-${idx}`} className="activity-level-details">
                        <div className="activity-level-header">
                          <span
                            className="activity-color-box"
                            style={{ backgroundColor: getActivityColor(level) }}
                          ></span>
                          <span className="activity-level-name">
                            {getActivityLevelLabel(level)}
                          </span>
                        </div>
                        <div className="activity-impact">
                          <span>Effect: {direction === 'neutral' ? 'Neutral' :
                                          `${Math.abs(percentEffect)}% ${direction} in insulin needs`}</span>
                          <span>Blood Sugar: {direction === 'increase' ? 'Decrease' :
                                              direction === 'decrease' ? 'Increase' : 'No change'}</span>
                          <span>Chart Position: {Number(level) > 0 ? 'Below zero line' :
                                                 Number(level) < 0 ? 'Above zero line' : 'At zero line'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
            <div className="table-container">
              <table {...getTableProps()} className="activity-table">
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
                      <tr key={`row-${i}`} {...rowProps}>
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
        </div>
      )}
    </div>
  );
};

export default ActivityVisualization;