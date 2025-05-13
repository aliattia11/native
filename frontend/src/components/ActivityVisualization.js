import React, { useState, useEffect, useCallback, useMemo, useContext, useRef, memo } from 'react';
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
const CurrentTimeDisplay = memo(({ timeInRange, yAxisId }) => {
  const [time, setTime] = useState(new Date().getTime());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date().getTime());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  if (!timeInRange) return null;

  return (
    <ReferenceLine
      x={time}
      yAxisId={yAxisId}
      stroke="#ff0000"
      strokeWidth={2}
      label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
    />
  );
});
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
  const totalEffectHours = params.totalDurationHours + (duration || 1);
  if (hoursSinceActivity < 0 || hoursSinceActivity > totalEffectHours) {
    return 0;
  }

  // Calculate effect strength with a clear physiological model
  let effectStrength = 0;

  if (hoursSinceActivity <= duration) {
    // Full effect during activity
    effectStrength = params.strength;
  } else {
    // Exponential decay after activity ends (more physiologically accurate)
    const timeAfterActivity = hoursSinceActivity - duration;
    const halfLife = totalEffectHours / 3; // Effect half-life
    effectStrength = params.strength * Math.exp(-Math.log(2) * timeAfterActivity / halfLife);
  }

  // Clear direction based on activity level
  // Positive activity levels (1,2) -> negative effect (lowers blood sugar)
  // Negative activity levels (-1,-2) -> positive effect (raises blood sugar)
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

    // Define physiological constants for better modeling
    const MIN_SAFE_BLOOD_GLUCOSE = 70; // Minimum safe blood glucose level (mg/dL)
    const ACTIVITY_IMPACT_FACTOR = 35; // More realistic impact factor (was 50)
    const MAX_REASONABLE_BG_CHANGE = 40; // Maximum reasonable change in 15 minutes (mg/dL)

    const minTime = Math.min(...allTimestamps);
    let maxTime = Math.max(...allTimestamps);

    // If including future effects, extend the timeline
    if (includeFutureEffect) {
      const futureTime = TimeManager.getFutureProjectionTime(futureHours);
      maxTime = Math.max(maxTime, futureTime);
    }

    // Create maps for quick lookups
    const actualReadingsMap = new Map();
    const estimatedReadingsMap = new Map();

    // Separate actual and estimated readings into maps for efficient lookups
    bloodGlucoseData.forEach(reading => {
      if (reading.isActualReading) {
        actualReadingsMap.set(reading.readingTime, reading);
      } else if (reading.isInterpolated || reading.isEstimated) {
        estimatedReadingsMap.set(reading.readingTime, reading);
      }
    });

    // Create a timeline using 15-minute intervals
    const timelineData = [];
    let currentTime = minTime;
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds

    // Get the ordered readings for better interpolation
    const orderedReadings = [...bloodGlucoseData]
      .sort((a, b) => a.readingTime - b.readingTime);

    // Helper function to find nearby readings
    const findNearbyReadings = (timestamp) => {
      let before = null;
      let after = null;

      // Find closest reading before timestamp
      for (let i = orderedReadings.length - 1; i >= 0; i--) {
        if (orderedReadings[i].readingTime <= timestamp) {
          before = orderedReadings[i];
          break;
        }
      }

      // Find closest reading after timestamp
      for (let i = 0; i < orderedReadings.length; i++) {
        if (orderedReadings[i].readingTime > timestamp) {
          after = orderedReadings[i];
          break;
        }
      }

      return { before, after };
    };

    // Helper function to determine blood sugar at a given time
    const getBloodSugarAtTime = (timestamp) => {
      // First check if we have an exact actual reading at this time
      if (actualReadingsMap.has(timestamp)) {
        return actualReadingsMap.get(timestamp);
      }

      // Then check if we have an estimated reading from the context
      if (estimatedReadingsMap.has(timestamp)) {
        return estimatedReadingsMap.get(timestamp);
      }

      // Find closest actual readings within 15 minutes
      const closestActual = [...actualReadingsMap.entries()]
        .filter(([time, _]) => Math.abs(time - timestamp) < 15 * 60 * 1000)
        .sort(([timeA, _a], [timeB, _b]) => Math.abs(timeA - timestamp) - Math.abs(timeB - timestamp))[0];

      if (closestActual) {
        return closestActual[1];
      }

      // Find closest estimated reading within 15 minutes
      const closestEstimated = [...estimatedReadingsMap.entries()]
        .filter(([time, _]) => Math.abs(time - timestamp) < 15 * 60 * 1000)
        .sort(([timeA, _a], [timeB, _b]) => Math.abs(timeA - timestamp) - Math.abs(timeB - timestamp))[0];

      if (closestEstimated) {
        return closestEstimated[1];
      }

      // If no close readings found, interpolate between available readings
      const { before, after } = findNearbyReadings(timestamp);

      if (before && after) {
        // Interpolate between known readings
        const timeRange = after.readingTime - before.readingTime;
        const timeElapsed = timestamp - before.readingTime;
        const ratio = timeRange > 0 ? timeElapsed / timeRange : 0;

        const interpolatedValue = Number(
          (before.bloodSugar + ratio * (after.bloodSugar - before.bloodSugar)).toFixed(2)
        );

        return {
          readingTime: timestamp,
          bloodSugar: interpolatedValue,
          isActualReading: false,
          isInterpolated: true,
          isEstimated: true,
          dataType: 'estimated',
          status: getBloodSugarStatus(interpolatedValue, targetGlucose)
        };
      } else if (before) {
        // Gradual return to target after last reading
        const hoursElapsed = (timestamp - before.readingTime) / (60 * 60 * 1000);
        const stabilizationHours = 2; // Hours to stabilize to target

        if (hoursElapsed <= stabilizationHours) {
          const ratio = hoursElapsed / stabilizationHours;
          const stabilizedValue = Number(
            (before.bloodSugar + ratio * (targetGlucose - before.bloodSugar)).toFixed(2)
          );

          return {
            readingTime: timestamp,
            bloodSugar: stabilizedValue,
            isActualReading: false,
            isInterpolated: true,
            isEstimated: true,
            dataType: 'estimated',
            status: getBloodSugarStatus(stabilizedValue, targetGlucose)
          };
        } else {
          // Beyond stabilization time, use target glucose
          return {
            readingTime: timestamp,
            bloodSugar: targetGlucose,
            isActualReading: false,
            isInterpolated: true,
            isEstimated: false,
            dataType: 'target',
            status: getBloodSugarStatus(targetGlucose, targetGlucose)
          };
        }
      } else if (after) {
        // Start from target, moving toward the first reading
        const hoursUntil = (after.readingTime - timestamp) / (60 * 60 * 1000);
        const approachHours = 2; // Hours to approach from target

        if (hoursUntil <= approachHours) {
          const ratio = (approachHours - hoursUntil) / approachHours;
          const approachedValue = Number(
            (targetGlucose + ratio * (after.bloodSugar - targetGlucose)).toFixed(2)
          );

          return {
            readingTime: timestamp,
            bloodSugar: approachedValue,
            isActualReading: false,
            isInterpolated: true,
            isEstimated: true,
            dataType: 'estimated',
            status: getBloodSugarStatus(approachedValue, targetGlucose)
          };
        } else {
          // Beyond approach window, use target glucose
          return {
            readingTime: timestamp,
            bloodSugar: targetGlucose,
            isActualReading: false,
            isInterpolated: true,
            isEstimated: false,
            dataType: 'target',
            status: getBloodSugarStatus(targetGlucose, targetGlucose)
          };
        }
      } else {
        // No readings, return target glucose
        return {
          readingTime: timestamp,
          bloodSugar: targetGlucose,
          isActualReading: false,
          isInterpolated: false,
          isEstimated: false,
          dataType: 'target',
          status: getBloodSugarStatus(targetGlucose, targetGlucose)
        };
      }
    };

    // Set to track which readings we've included
    const includedReadings = new Set();

    // Generate the timeline
    while (currentTime <= maxTime) {
      // Get blood sugar data for this time point
      const bsData = getBloodSugarAtTime(currentTime);

      const timePoint = {
        timestamp: currentTime,
        formattedTime: TimeManager.formatDate(currentTime, TimeManager.formats.DATETIME_DISPLAY),
        readingTime: bsData.readingTime,
        formattedReadingTime: TimeManager.formatDate(bsData.readingTime || currentTime, TimeManager.formats.DATETIME_DISPLAY),
        bloodSugar: bsData.bloodSugar,
        bloodSugarStatus: bsData.status,
        isActualReading: bsData.isActualReading || false,
        dataType: bsData.dataType || 'estimated',
        isInterpolated: bsData.isInterpolated || false,
        isEstimated: bsData.isEstimated || false,
        originalBloodSugar: bsData.bloodSugar, // Store original value before any modifications
        activities: {},
        activityEffects: {},
        totalActivityEffect: 0
      };

      if (bsData.isActualReading) {
        includedReadings.add(bsData.readingTime);
      }

      // Calculate activity effects at this time
      activityData.forEach(activity => {
        // Record ongoing activities at this time
        if (activity.startTime <= currentTime && activity.endTime >= currentTime) {
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

        // Calculate effect from each activity
        const activityStartTime = activity.startTime;
        if (activityStartTime) {
          const hoursSinceActivityStart = (currentTime - activityStartTime) / (60 * 60 * 1000);
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

      // Apply activity effect to blood sugar if present and point is not an actual reading
      if (timePoint.totalActivityEffect !== 0) {
        // Calculate activity impact with more reasonable factor
        const activityImpact = ACTIVITY_IMPACT_FACTOR * timePoint.totalActivityEffect;

        // Store the estimated blood sugar before activity effect
        timePoint.estimatedBloodSugar = timePoint.bloodSugar;

        // Store the raw activity impact in mg/dL for the tooltip
        timePoint.activityImpactMgdL = Number(activityImpact.toFixed(2));

        // Only modify non-actual readings
        if (!timePoint.isActualReading) {
          // Apply the activity effect with physiological limits
          const potentialValue = timePoint.bloodSugar + activityImpact;

          // Ensure value doesn't go below safe minimum and round to 2 decimal places
          timePoint.bloodSugar = Number(Math.max(MIN_SAFE_BLOOD_GLUCOSE, potentialValue).toFixed(2));
          timePoint.bloodSugarStatus = getBloodSugarStatus(timePoint.bloodSugar, targetGlucose);
          timePoint.activityModified = true;

          // Indicate if value was adjusted due to physiological constraints
          if (potentialValue < MIN_SAFE_BLOOD_GLUCOSE) {
            timePoint.limitAdjusted = true;
            timePoint.originalEstimate = Number(potentialValue.toFixed(2)); // Store what it would have been
          }
        }
      } else if (showActualBloodSugar && !timePoint.bloodSugar) {
        // When no activity effect and no blood sugar value, use target
        timePoint.bloodSugar = targetGlucose;
        timePoint.estimatedBloodSugar = targetGlucose; // Keep consistent
        timePoint.bloodSugarStatus = getBloodSugarStatus(targetGlucose, targetGlucose);
      } else {
        // No activity effect but we still store the estimated blood sugar
        timePoint.estimatedBloodSugar = timePoint.bloodSugar;
      }

      // Format total activity effect for display - round to 2 decimal places
      if (timePoint.totalActivityEffect) {
        timePoint.totalActivityEffect = Number(timePoint.totalActivityEffect.toFixed(2));
      }

      timelineData.push(timePoint);
      currentTime += interval;
    }

    // Post-process to smooth out any remaining unrealistic transitions
    for (let i = 1; i < timelineData.length - 1; i++) {
      const current = timelineData[i];
      const prev = timelineData[i-1];
      const next = timelineData[i+1];

      // Skip actual readings
      if (current.isActualReading) continue;

      // Check for unrealistic changes in 15-minute periods
      const prevDiff = Math.abs(current.bloodSugar - prev.bloodSugar);
      const nextDiff = Math.abs(next.bloodSugar - current.bloodSugar);

      if (prevDiff > MAX_REASONABLE_BG_CHANGE && nextDiff > MAX_REASONABLE_BG_CHANGE) {
        // This point is likely an unrealistic spike or drop
        // Smooth it using a weighted average with neighbors
        const neighborAvg = (prev.bloodSugar + next.bloodSugar) / 2;
        // Weight toward original value slightly to preserve trends and round to 2 decimal places
        current.bloodSugar = Number((0.3 * current.bloodSugar + 0.7 * neighborAvg).toFixed(2));
        current.estimatedBloodSugar = current.bloodSugar; // Keep consistent
        current.bloodSugarStatus = getBloodSugarStatus(current.bloodSugar, targetGlucose);
        current.wasSmoothed = true;
      }
    }

    // Sort by timestamp for proper rendering
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

// Custom tooltip for the chart - SIMPLIFIED
const CustomTooltip = useCallback(({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;

    return (
      <div className="activity-tooltip">
        <p className="tooltip-time">{data.formattedTime}</p>

        {/* Display activities without impact percentages */}
        {data.activityDetails && data.activityDetails.length > 0 && (
          <div className="tooltip-section">
            <p className="tooltip-header">Activities:</p>
            {data.activityDetails.map((activity, idx) => {
              // Determine direction text
              const direction = activity.level === 0 ? 'Neutral' :
                              (activity.level > 0) ? 'Decreases blood sugar' :
                              'Increases blood sugar';

              return (
                <p key={idx} className="tooltip-activity">
                  {activity.levelLabel}
                  <span className="tooltip-direction"> ({direction})</span>
                </p>
              );
            })}
          </div>
        )}

        {/* Blood sugar information */}
        <div className="tooltip-section">
          <p className="tooltip-header">Blood Sugar:</p>

          {/* For actual readings */}
          {data.isActualReading && (
            <p className="tooltip-blood-sugar">
              <strong>{Math.round(data.bloodSugar)} mg/dL</strong> (Actual Reading)
              {data.bloodSugarStatus && ` - ${data.bloodSugarStatus.label}`}
            </p>
          )}

          {/* For estimated readings */}
          {!data.isActualReading && (
            <>
              {/* Show baseline estimate */}
              <p className="tooltip-blood-sugar">
                <span className="tooltip-label">Baseline estimate:</span>
                <strong>{Math.round(data.originalBloodSugar)} mg/dL</strong>
              </p>

              {/* Only show activity impact if there is one */}
              {data.activityModified && data.activityImpactMgdL !== 0 && (
                <p className="tooltip-activity-impact">
                  <span className="tooltip-label">Activity impact:</span>
                  <strong className={data.activityImpactMgdL > 0 ? "positive-impact" : "negative-impact"}>
                    {data.activityImpactMgdL > 0 ? "+" : ""}{data.activityImpactMgdL} mg/dL
                  </strong>
                </p>
              )}

              {/* Final estimate after activity effects */}
              <p className="tooltip-final-estimate">
                <span className="tooltip-label">Final estimate:</span>
                <strong>{Math.round(data.bloodSugar)} mg/dL</strong>
                {data.bloodSugarStatus && ` - ${data.bloodSugarStatus.label}`}
                {data.limitAdjusted && " (Limited to minimum safe value)"}
              </p>
            </>
          )}
        </div>

        {/* Display activity effect summary */}
        {data.totalActivityEffect !== 0 && (
          <div className="tooltip-section">
            <p className="tooltip-header">Activity Effect Summary:</p>
            <p className="tooltip-effect">
              Effect Strength: {Math.abs(data.totalActivityEffect).toFixed(2)} units
              <span style={{
                color: data.totalActivityEffect > 0 ? '#2196F3' : '#F44336',
                fontWeight: 'bold',
                marginLeft: '4px'
              }}>
                ({data.totalActivityEffect > 0 ? 'Decreases' : 'Increases'} blood sugar)
              </span>
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
                      domain={[-20, 2]} // Balanced domain for bidirectional display
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
                      domain={[-4, 3]}
                      ticks={[-1, -0.5, 0, 0.5, 1]} // Ticks representing activity effect

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
    stroke="#8031A7"
    dot={({ cx, cy, payload }) => {
      if (!payload.isActualReading) return null;

      // Get color from status
      const dotColor = payload.bloodSugarStatus?.color ||
                      (payload.bloodSugar > targetGlucose ? '#ff8800' : '#00C851');

      // Using isActualReading in the condition ensures only one dot per actual reading
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
    }}
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
    dot={false}      // No dots for estimated line
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