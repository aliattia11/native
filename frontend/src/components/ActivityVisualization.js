import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import moment from 'moment';
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
  Rectangle
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import './ActivityVisualization.css';

/**
 * Enhanced Activity and Blood Sugar Chart Component
 *
 * Visualizes the relationship between physical activity and blood glucose levels,
 * showing both immediate and extended effects of activity on blood sugar.
 *
 * Activities that decrease blood sugar (high/vigorous) emerge from the top of the chart.
 * Activities that increase blood sugar (low/very low) emerge from the bottom of the chart.
 * Bar width represents the duration of the activity.
 */
const ActivityBloodSugarChart = ({ isDoctor = false, patientId = null }) => {
  // Context hooks for patient constants and blood sugar data
  const { patientConstants } = useConstants();
  const {
    filteredData: bloodSugarData,
    combinedData: allBloodSugarData,
    filteredEstimatedReadings,
    targetGlucose,
    dateRange,
    setDateRange,
    timeScale,
    unit,
    getBloodSugarAtTime
  } = useBloodSugarData();

  // Local state
  const [activityData, setActivityData] = useState([]);
  const [activityLevels, setActivityLevels] = useState([]);
  const [selectedActivityLevels, setSelectedActivityLevels] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showActualBloodSugar, setShowActualBloodSugar] = useState(true);
  const [showEstimatedBloodSugar, setShowEstimatedBloodSugar] = useState(true);
  const [showActivityImpact, setShowActivityImpact] = useState(true);
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [viewMode, setViewMode] = useState('combined'); // 'combined', 'activities', or 'impact'
  const [userTimeZone, setUserTimeZone] = useState('');
  const [dataFetched, setDataFetched] = useState(false);
  const [activityImpactThreshold, setActivityImpactThreshold] = useState(2); // Hours
  const [activityEffectMultiplier, setActivityEffectMultiplier] = useState(1.0); // Effect strength multiplier
  const [processedBloodSugarData, setProcessedBloodSugarData] = useState([]);
  const [barMaxHeight, setBarMaxHeight] = useState(25); // Maximum height of activity bars as percentage of chart

  // Track initialization
  const initializedRef = useRef(false);

  // System info - using your provided values
  const currentDateTime = "2025-04-24 01:17:07";
  const currentUserLogin = "aliattia02";

  // Get activity levels from patient constants - ADDED MORE DEFENSIVE CHECKS
  const systemActivityLevels = useMemo(() => {
    if (!patientConstants || !patientConstants.activity_coefficients) {
      return [];
    }

    try {
      // Convert the activity coefficients object into an array of levels
      return Object.entries(patientConstants.activity_coefficients)
        .filter(([value, impact]) => value !== undefined && impact !== undefined)
        .map(([value, impact]) => {
          // Safe parsing
          const numValue = parseInt(value);
          const numImpact = parseFloat(impact) || 1.0;

          // Create readable labels for activity levels
          let label;
          switch (numValue) {
            case -2:
              label = "Very Low Activity";
              break;
            case -1:
              label = "Low Activity";
              break;
            case 0:
              label = "Normal Activity";
              break;
            case 1:
              label = "High Activity";
              break;
            case 2:
              label = "Vigorous Activity";
              break;
            default:
              label = `Level ${value}`;
          }

          return {
            value: numValue,
            label,
            impact: numImpact
          };
        })
        .sort((a, b) => a.value - b.value); // Sort by value
    } catch (error) {
      console.error("Error processing activity levels:", error);
      return [];
    }
  }, [patientConstants]);

  // Safe formatting function that handles undefined values
  const safeToFixed = useCallback((value, decimals = 2) => {
    if (value === undefined || value === null || isNaN(value)) {
      return '1.00';
    }
    return value.toFixed(decimals);
  }, []);

  // Helper function to get activity impact coefficient from patient constants
  const getActivityImpact = useCallback((level) => {
    if (!patientConstants || !patientConstants.activity_coefficients) return 1.0;
    const impact = patientConstants.activity_coefficients[level];
    return impact !== undefined ? parseFloat(impact) : 1.0;
  }, [patientConstants]);

  // Helper function to get color for activity levels
  const getActivityColor = useCallback((level) => {
    // Define colors for activity levels from -2 to 2
    const colors = {
      '-2': '#6baed6', // Blue for very low activity
      '-1': '#9ecae1', // Light blue for low activity
      '0': '#c6dbef',  // Very light blue for normal activity
      '1': '#fd8d3c',  // Orange for high activity
      '2': '#e6550d',  // Dark orange for vigorous activity
    };

    return colors[level] || '#c6dbef'; // Default to normal activity color
  }, []);

  // Calculate activity effect on blood glucose at a given time point
  const calculateActivityEffect = useCallback((activityImpact, hoursSinceStart, hoursDuration) => {
  // Safety checks
  if (activityImpact === undefined || hoursSinceStart === undefined || hoursDuration === undefined) {
    return 0;
  }

  // No effect before activity starts
  if (hoursSinceStart < 0) return 0;

  // Scale effect magnitude based on duration (similar to your old implementation)
  // Longer activities have stronger effect, up to a maximum at 2 hours
  const durationScalingFactor = Math.min(1.0, hoursDuration / 2);
  const scaledImpact = activityImpact * durationScalingFactor;

  // During activity - progressive buildup like your old implementation
  if (hoursSinceStart <= hoursDuration) {
    // Build up gradually during activity (optional - remove if you prefer instant effect)
    const progressFactor = Math.min(1.0, hoursSinceStart / Math.max(0.5, hoursDuration/2));
    return scaledImpact * progressFactor;
  }

  // After activity, effect gradually diminishes over activityImpactThreshold hours
  const hoursAfterActivity = hoursSinceStart - hoursDuration;
  if (hoursAfterActivity <= activityImpactThreshold) {
    // Using existing decay curve but with scaled impact
    const normalizedTime = hoursAfterActivity / activityImpactThreshold;
    const exponentialComponent = Math.exp(-2 * normalizedTime);
    const linearComponent = 1 - normalizedTime;
    const blendFactor = Math.min(1, normalizedTime * 2);
    const blendedEffect = exponentialComponent * (1 - blendFactor) + linearComponent * blendFactor;

    return scaledImpact * blendedEffect;
  }

  return 0;
}, [activityImpactThreshold]);

  // Calculate the cumulative effect of multiple activities
 const calculateCumulativeEffect = useCallback((activities, timestamp) => {
  if (!activities || activities.length === 0 || timestamp === undefined) {
    return {
      netEffect: 0,
      effectMultiplier: 1.0,
      decreaseEffect: 0,
      increaseEffect: 0,
      details: []
    };
  }

  // Track individual effects for detailed reporting
  const effectDetails = [];

  // Track effects by level for detailed tooltip display
  const effectsByLevel = {};

  // Calculate effect from each activity
  let totalDecreaseEffect = 0;
  let totalIncreaseEffect = 0;

  activities.forEach(activity => {
    if (!activity) return; // Skip undefined activities

    // Calculate time parameters
    const startTime = activity.startTime;
    const endTime = activity.endTime;
    if (!startTime || !endTime) return; // Skip activities with missing times

    const durationHours = (endTime - startTime) / (60 * 60 * 1000);
    const hoursSinceStart = (timestamp - startTime) / (60 * 60 * 1000);

    // Skip if activity hasn't started yet
    if (hoursSinceStart < 0) return;

    // Get impact coefficient (how much this activity affects insulin sensitivity)
    const activityImpact = typeof activity.impact === 'number' ? activity.impact : 1.0;

    // Calculate raw effect magnitude (0 to 1 scale)
    const effectMagnitude = calculateActivityEffect(
      Math.abs(activityImpact - 1.0),  // Get absolute magnitude of deviation from neutral
      hoursSinceStart,
      durationHours
    );

    if (effectMagnitude <= 0) return;

    // Determine if this is a glucose-increasing or glucose-decreasing activity
    const isDecreasing = activityImpact < 1.0;

    // Calculate the actual effect (not just magnitude)
    // This is key for proper cancellation - we need the sign
    const actualEffect = isDecreasing ? -effectMagnitude : effectMagnitude;

    // Add to appropriate level bucket for tooltip display
    if (!effectsByLevel[activity.level]) {
      effectsByLevel[activity.level] = 0;
    }
    effectsByLevel[activity.level] += actualEffect;

    // Track individual positive and negative effects for analysis
    if (isDecreasing) {
      totalDecreaseEffect += effectMagnitude;
    } else {
      totalIncreaseEffect += effectMagnitude;
    }

    // Store details for this activity's effect
    effectDetails.push({
      activity,
      effectMagnitude,
      actualEffect,
      isDecreasing,
      hoursSinceStart,
      durationHours
    });
  });

  // Calculate the true net effect (allowing for cancellation)
  // The difference here from the original is we calculate algebraic sum
  // rather than just taking the dominant effect
  const algebraicSum = effectDetails.reduce(
    (sum, detail) => sum + (detail.isDecreasing ? -detail.effectMagnitude : detail.effectMagnitude),
    0
  );

  // Apply effect multiplier to strengthen/weaken the overall impact
  const scaledSum = algebraicSum * activityEffectMultiplier;

  // Determine final multiplier (e.g., 0.8x or 1.2x)
  const multiplier = 1.0 + scaledSum;

  return {
    netEffect: scaledSum, // This could be positive or negative
    effectMultiplier: multiplier,
    decreaseEffect: totalDecreaseEffect,
    increaseEffect: totalIncreaseEffect,
    effectsByLevel: effectsByLevel,  // Added for detailed tooltip
    details: effectDetails
  };
}, [calculateActivityEffect, activityEffectMultiplier]);

  // Get estimated blood sugar at a specific time
  const getBloodSugarEstimation = useCallback((timestamp) => {
    // Find the closest estimated or actual reading
    const reading = getBloodSugarAtTime(timestamp);

    if (reading && typeof reading.bloodSugar === 'number') {
      return reading.bloodSugar;
    }

    // Default to target glucose if no reading found
    return targetGlucose || 100;
  }, [getBloodSugarAtTime, targetGlucose]);

  // Apply activity effects to blood sugar data
  const applyActivityEffect = useCallback((activityData, bloodSugarData) => {
    if (!activityData || activityData.length === 0 || !bloodSugarData || bloodSugarData.length === 0) {
      return bloodSugarData;
    }

    // Clone the blood sugar data to avoid mutation
    const modifiedData = JSON.parse(JSON.stringify(bloodSugarData));

    // For each blood sugar reading, calculate the cumulative activity effect
    modifiedData.forEach(reading => {
      if (!reading || !reading.readingTime || (!reading.isEstimated && !reading.isInterpolated)) {
        // Don't modify actual readings or invalid entries
        return;
      }

      const readingTime = reading.readingTime;

      // Find all activities that could be affecting this reading
      const relevantActivities = activityData.filter(activity => {
        if (!activity || !activity.startTime || !activity.endTime) return false;

        const activityEnd = activity.endTime;
        const postEffectEnd = activityEnd + (activityImpactThreshold * 60 * 60 * 1000);

        // Activity is relevant if the reading is during or after the activity but before post-effect ends
        return readingTime >= activity.startTime && readingTime <= postEffectEnd;
      });

      if (relevantActivities.length === 0) {
        reading.activityAdjustedBloodSugar = reading.bloodSugar;
        reading.activityEffect = 0;
        return;
      }

      // Calculate cumulative effect
      const effectResult = calculateCumulativeEffect(relevantActivities, readingTime);

      reading.activityEffect = effectResult.netEffect;
      reading.activityEffectMultiplier = effectResult.effectMultiplier;

      // Apply effect to blood sugar
      if (typeof reading.bloodSugar === 'number') {
        const adjustmentFactor = 0.8;
        const baseAdjustment = reading.bloodSugar * Math.abs(effectResult.netEffect) *
                              adjustmentFactor * (effectResult.netEffect > 0 ? 1 : -1);

        reading.activityAdjustedBloodSugar = Math.max(70, reading.bloodSugar + baseAdjustment);
      } else {
        reading.activityAdjustedBloodSugar = reading.bloodSugar;
      }
    });

    return modifiedData;
  }, [activityImpactThreshold, calculateCumulativeEffect]);

  // Process and combine activity and blood sugar data
const processAndCombineData = useCallback((activityData, bloodSugarData) => {
  try {
    if (!activityData || !bloodSugarData || !Array.isArray(activityData) || !Array.isArray(bloodSugarData)) {
      setCombinedData([]);
      return;
    }

    // IMPORTANT FIX: Filter blood sugar data to the current time range first
    const filteredBloodSugarData = bloodSugarData.filter(reading =>
      reading && reading.readingTime &&
      reading.readingTime >= timeScale.start &&
      reading.readingTime <= timeScale.end
    );

    // Only use timestamps from filtered blood sugar data
    const allTimestamps = [
      ...activityData.map(d => d?.startTime).filter(Boolean),
      ...activityData.map(d => d?.endTime).filter(Boolean),
      ...filteredBloodSugarData.map(d => d?.readingTime).filter(Boolean)
    ];

      if (allTimestamps.length === 0) {
        setCombinedData([]);
        return;
      }

      const minTime = Math.min(...allTimestamps);
      let maxTime = Math.max(...allTimestamps);

      // Generate timeline with 15-minute intervals
      const timelineData = [];
      let currentTime = minTime;
      const interval = 15 * 60 * 1000; // 15 minutes in milliseconds

      while (currentTime <= maxTime) {
      const timePoint = {
        timestamp: currentTime,
        formattedTime: moment(currentTime).format('MM/DD/YYYY, HH:mm'),
        activeActivities: [],
        activityEffects: {},
        effectsByLevel: {}, // Add this for detailed level effects
        totalActivityImpact: 0,
        activityEffectMultiplier: 1.0,
        netActivityEffect: 0,
        decreaseActivityEffect: 0,
        increaseActivityEffect: 0,
      };

        // Find activities that are active at this time
        const activeActivities = activityData
          .filter(activity => activity && activity.startTime && activity.endTime) // Filter out undefined or incomplete activities
          .filter(activity => currentTime >= activity.startTime && currentTime <= activity.endTime);

        // Find all activities that could affect this time (including post-activity effects)
        const relevantActivities = activityData
          .filter(activity => activity && activity.startTime && activity.endTime) // Filter out undefined or incomplete activities
          .filter(activity => {
            const activityEnd = activity.endTime;
            const postEffectEnd = activityEnd + (activityImpactThreshold * 60 * 60 * 1000);
            return currentTime >= activity.startTime && currentTime <= postEffectEnd;
          });

        // Calculate cumulative activity effect at this time point
      const effectResult = calculateCumulativeEffect(relevantActivities, currentTime);

        // Store activity data
        timePoint.activeActivities = activeActivities || [];
      timePoint.activeActivityCount = activeActivities?.length || 0;
      timePoint.netActivityEffect = effectResult.netEffect;
      timePoint.activityEffectMultiplier = effectResult.effectMultiplier;
      timePoint.decreaseActivityEffect = effectResult.decreaseEffect;
      timePoint.increaseActivityEffect = effectResult.increaseEffect;
      timePoint.effectsByLevel = effectResult.effectsByLevel || {}; // Store level effects


        // Add blood sugar reading if available at this time
        const closestBloodSugar = bloodSugarData.find(bs =>
          bs && bs.readingTime && Math.abs(bs.readingTime - currentTime) < 15 * 60 * 1000 // Within 15 minutes
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes || '';
          timePoint.isActualReading = closestBloodSugar.isActualReading;
        }

        // Calculate activity-adjusted blood sugar
        const baseBloodSugar = closestBloodSugar && typeof closestBloodSugar.bloodSugar === 'number' ?
          closestBloodSugar.bloodSugar :
          getBloodSugarEstimation(currentTime);

        if (typeof baseBloodSugar === 'number' && effectResult.netEffect !== 0) {
          const adjustmentFactor = 0.8; // How strongly activity affects blood sugar

          // Apply activity effect to blood sugar
          // Positive netEffect increases blood sugar, negative decreases it
          const baseAdjustment = baseBloodSugar * Math.abs(effectResult.netEffect) *
                                adjustmentFactor * (effectResult.netEffect > 0 ? 1 : -1);

          timePoint.baseBloodSugar = baseBloodSugar;
          timePoint.adjustedBloodSugar = Math.max(70, baseBloodSugar + baseAdjustment);
        } else if (typeof baseBloodSugar === 'number') {
          timePoint.baseBloodSugar = baseBloodSugar;
          timePoint.adjustedBloodSugar = baseBloodSugar;
        }

        timelineData.push(timePoint);
        currentTime += interval;
      }

      setCombinedData(timelineData);

      // Process blood sugar data with activity effects
      if (Array.isArray(bloodSugarData) && bloodSugarData.length > 0) {
        const processedBS = applyActivityEffect(activityData, bloodSugarData);
        setProcessedBloodSugarData(processedBS);
      }
    } catch (error) {
      console.error('Error generating combined data:', error);
      setCombinedData([]);
    }
  }, [calculateCumulativeEffect, activityImpactThreshold, getBloodSugarEstimation, applyActivityEffect]);

  // Fetch activity data from API
  const fetchActivityData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Calculate the date range
      if (!dateRange || !dateRange.start || !dateRange.end) {
        throw new Error('Invalid date range');
      }

      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      // Use the correct endpoint for activity data
      const activityEndpoint = patientId
        ? `http://localhost:5000/api/patient/${patientId}/activity-history?start_date=${startDate}&end_date=${endDate}`
        : `http://localhost:5000/api/activity-history?start_date=${startDate}&end_date=${endDate}`;

      console.log('Fetching activity data from:', activityEndpoint);
      const response = await axios.get(activityEndpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Process activity data
      const processedActivityData = response.data
        .filter(Boolean) // Skip null/undefined
        .map(activity => {
          try {
            if (!activity) return null;

            // Parse timestamps
            const startTime = moment(activity.startTime || activity.expectedTime || activity.timestamp).valueOf();
            const endTime = moment(activity.endTime || activity.completedTime || activity.timestamp).valueOf();

            // Calculate impact based on level
            let level = 0;
            try {
              level = activity.level !== undefined ? parseInt(activity.level) : 0;
            } catch (e) {
              level = 0; // Default to normal activity
            }

            // Get impact - use provided impact, calculate from level, or default to 1.0
            const impact = activity.impact !== undefined ? parseFloat(activity.impact) :
                          getActivityImpact(level) !== undefined ? getActivityImpact(level) : 1.0;

            // Find matching level object or create default
            const levelObj = systemActivityLevels.find(l => l.value === level) ||
                           { label: `Level ${level}`, impact: 1.0 };

            return {
              id: activity.id || `activity-${Math.random().toString(36).substring(2, 9)}`,
              level: level,
              levelLabel: activity.levelLabel || levelObj.label || `Level ${level}`,
              startTime,
              endTime,
              formattedStartTime: moment(startTime).format('MM/DD/YYYY, HH:mm'),
              formattedEndTime: moment(endTime).format('MM/DD/YYYY, HH:mm'),
              duration: activity.duration || '00:00',
              durationMs: endTime - startTime,
              impact,
              notes: activity.notes || '',
              type: activity.type || 'unknown'
            };
          } catch (error) {
            console.error("Error processing activity:", error, activity);
            return null;
          }
        })
        .filter(Boolean); // Remove any null entries

      // Extract unique activity levels
      const levels = [...new Set(processedActivityData.map(activity => activity.level))].sort();
      setActivityLevels(levels);

      // Only set selected levels once when they're empty
      if (selectedActivityLevels.length === 0 && levels.length > 0) {
        setSelectedActivityLevels(levels);
      }

      setActivityData(processedActivityData);

      // Generate combined data with blood sugar
      processAndCombineData(processedActivityData, allBloodSugarData);

      setError('');
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError('Failed to load activity data: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [dateRange, patientId, selectedActivityLevels.length, getActivityImpact, allBloodSugarData,
      systemActivityLevels, processAndCombineData]);

  // Initialize time zone once
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Set initial activity levels only once
  useEffect(() => {
    if (!initializedRef.current && systemActivityLevels && systemActivityLevels.length > 0 && selectedActivityLevels.length === 0) {
      const levelValues = systemActivityLevels.map(level => level.value);
      setActivityLevels(levelValues);
      setSelectedActivityLevels(levelValues);
      initializedRef.current = true;
    }
  }, [systemActivityLevels, selectedActivityLevels.length]);

  // Date range change handler
  const handleDateChange = useCallback((e) => {
    const { name, value } = e.target;
    setDateRange(prev => {
      const newRange = { ...prev, [name]: value };
      return newRange;
    });
  }, [setDateRange]);

  // Quick date range presets
  const applyDatePreset = useCallback((days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');
    let end;

    if (days === 1) {
      // For "Last 24h": past day plus 12 hours
      end = moment().add(12, 'hours').format('YYYY-MM-DD');
    } else if (days === 3) {
      // For "Last 3 Days": past 3 days plus one future day
      end = moment().add(1, 'day').format('YYYY-MM-DD');
    } else if (days === 7) {
      // For "Last Week": past 7 days plus one future day
      end = moment().add(1, 'day').format('YYYY-MM-DD');
    } else {
      // Default case
      end = moment().format('YYYY-MM-DD');
    }

    setDateRange({
      start: start,
      end: end
    });
  }, [setDateRange]);

  // Activity level toggle handler
  const handleActivityLevelToggle = useCallback((level) => {
    setSelectedActivityLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level);
      } else {
        return [...prev, level];
      }
    });
  }, []);

  // Force update handler
  const handleForceUpdate = useCallback(() => {
    fetchActivityData();
  }, [fetchActivityData]);

  // Activity effect multiplier handler
  const handleEffectMultiplierChange = useCallback((e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setActivityEffectMultiplier(value);
    }
  }, []);

  // Format X-axis labels
  const formatXAxis = useCallback((tickItem) => {
    return moment(tickItem).format('MM/DD HH:mm');
  }, []);

  // Format activity impact for Y-axis labels
  const formatActivityImpactAxis = useCallback((value) => {
    if (value === undefined || value === null || isNaN(value)) return '1.0x';
    if (value === 0) return '1.0x';
    return value > 0 ? `${(1 + value).toFixed(1)}x` : `${(1 + value).toFixed(1)}x`;
  }, []);

  // Generate ticks for x-axis based on time scale
  const ticks = useMemo(() => {
    if (!timeScale || !timeScale.start || !timeScale.end) return [];

    const ticksArray = [];
    try {
      let current = moment(timeScale.start).startOf('hour');
      const end = moment(timeScale.end);
      const tickInterval = timeScale.tickInterval || 12; // Default to 12 hours if not specified

      // Align ticks to exact hour boundaries for consistent grid alignment
      while (current.isBefore(end)) {
        ticksArray.push(current.valueOf());
        current = current.add(tickInterval, 'hours');
      }
    } catch (error) {
      console.error("Error generating ticks:", error);
    }

    return ticksArray;
  }, [timeScale]);

  // Custom activity bar that renders differently based on activity level
  const CustomActivityBar = useCallback((props) => {
    const { x, y, width, height, fill, activityData, dataKey } = props;

    if (!activityData) return null;

    // Determine if this is a decreasing or increasing activity
    const isDecreasing = activityData.level > 0; // High/vigorous activities decrease blood sugar
    const isIncreasing = activityData.level < 0; // Low/very low activities increase blood sugar
    const isNeutral = activityData.level === 0; // Normal activities have minimal effect

    // Calculate the visual representation
    let barProps = {};
    const chartHeight = 360; // Assuming default chart height
    const maxBarHeight = chartHeight * (barMaxHeight / 100); // Convert percentage to pixels

    // Calculate duration-based width
    const minWidth = 5; // Minimum width in pixels
    const maxWidth = width || 10; // Max width from props or default

    // Calculate bar width based on duration
    const durationMs = activityData.durationMs || 1800000; // Default to 30 minutes if not specified
    const durationHours = durationMs / (60 * 60 * 1000);
    const calculatedWidth = Math.max(minWidth, Math.min(maxWidth, durationHours * 15)); // 15px per hour

    if (isDecreasing) {
      // Decreasing activities emerge from top
      const barHeight = maxBarHeight * (Math.abs(activityData.level) / 2); // Scale by level (1 or 2)
      barProps = {
        x: x - (calculatedWidth / 2), // Center the bar on the x point
        y: 0, // Start from the top
        width: calculatedWidth,
        height: barHeight,
        fill,
        className: 'activity-bar decreasing'
      };
    } else if (isIncreasing) {
      // Increasing activities emerge from bottom
      const barHeight = maxBarHeight * (Math.abs(activityData.level) / 2); // Scale by level (1 or 2)
      barProps = {
        x: x - (calculatedWidth / 2), // Center the bar on the x point
        y: chartHeight - barHeight, // Start from the bottom
        width: calculatedWidth,
        height: barHeight,
        fill,
        className: 'activity-bar increasing'
      };
    } else if (isNeutral) {
      // Neutral activities as thin lines in the middle
      barProps = {
        x: x - (calculatedWidth / 2), // Center the bar on the x point
        y: chartHeight / 2 - 5, // Center in the chart with small height
        width: calculatedWidth,
        height: 10,
        fill,
        className: 'activity-bar neutral'
      };
    }

    return <Rectangle {...barProps} />;
  }, [barMaxHeight]);

  // Generate activity bars for the chart
  const renderActivityBars = useCallback(() => {
    if (!activityData || !Array.isArray(activityData) || activityData.length === 0) {
      return null;
    }

    // Filter for selected activity levels
    const filteredActivities = activityData.filter(activity =>
      activity && selectedActivityLevels.includes(activity.level)
    );

    return systemActivityLevels
      .filter(level => selectedActivityLevels.includes(level.value))
      .map(level => {
        const activitiesAtLevel = filteredActivities.filter(a => a.level === level.value);

        return (
          <Bar
            key={`activity-level-${level.value}`}
            dataKey="timestamp" // Use timestamp as the x-axis value
            name={`${level.label} (${safeToFixed(level.impact)}x)`}
            data={activitiesAtLevel}
            fill={getActivityColor(level.value)}
            shape={<CustomActivityBar activityData={activitiesAtLevel[0]} />}
          />
        );
      });
  }, [activityData, selectedActivityLevels, systemActivityLevels, getActivityColor, CustomActivityBar, safeToFixed]);

  // Custom tooltip for the chart with EXTRA SAFETY CHECKS
// Enhanced CustomTooltip with detailed effect information
const CustomTooltip = useCallback(({ active, payload }) => {
  if (!active || !payload || !payload.length || !payload[0] || !payload[0].payload) return null;

  try {
    const dataPoint = payload[0].payload;

    return (
      <div className="activity-tooltip">
        <p className="tooltip-time">
          {moment(dataPoint.timestamp).format('MM/DD/YYYY, HH:mm')}
        </p>

        {/* Display active activities */}
        {dataPoint.activeActivities && dataPoint.activeActivities.length > 0 && (
          <div className="tooltip-section">
            <p className="tooltip-header">Active Activities:</p>
            {dataPoint.activeActivities
              .filter(activity => activity) // Filter out null activities
              .map((activity, idx) => (
                <p key={idx} className="tooltip-activity">
                  {activity.levelLabel || 'Unknown'} - {safeToFixed(activity.impact)}x effect
                </p>
              ))}
          </div>
        )}

        {/* Display activity effect with enhanced details */}
        {dataPoint.netActivityEffect !== 0 && (
          <div className="tooltip-section">
            <p className="tooltip-header">Activity Effect:</p>
            <p className="tooltip-effect" style={{
              color: dataPoint.netActivityEffect < 0 ? '#d32f2f' : '#388e3c'
            }}>
              {Math.abs((dataPoint.netActivityEffect || 0) * 100).toFixed(1)}%
              {(dataPoint.netActivityEffect || 0) < 0 ? ' decrease' : ' increase'}
              {' '}(Multiplier: {safeToFixed(dataPoint.activityEffectMultiplier)}x)
            </p>

            {/* Detailed breakdown by activity level - similar to old code */}
            {dataPoint.effectsByLevel && Object.entries(dataPoint.effectsByLevel).map(([level, effect], idx) => (
              effect !== 0 && (
                <p key={idx} className="tooltip-effect-detail" style={{
                  color: effect < 0 ? '#d32f2f' : '#388e3c',
                  fontSize: '0.9em',
                  margin: '3px 0 3px 10px'
                }}>
                  {systemActivityLevels.find(l => l.value === parseInt(level))?.label || `Level ${level}`}:
                  {effect > 0 ? '+' : ''}{(effect * 100).toFixed(1)}% effect
                </p>
              )
            ))}

            {/* Show counteracting information if both effects present */}
            {dataPoint.decreaseEffect > 0 && dataPoint.increaseEffect > 0 && (
              <p className="tooltip-counteracting" style={{
                color: '#555',
                fontStyle: 'italic',
                marginTop: '5px'
              }}>
                Some effects are counteracting each other
              </p>
            )}
          </div>
        )}

        {/* Display blood sugar information */}
        {dataPoint.bloodSugar !== undefined && (
          <div className="tooltip-section">
            <p className="tooltip-header">Blood Sugar:</p>
            <p className="tooltip-blood-sugar">
              {dataPoint.bloodSugar} {unit}
              {dataPoint.bloodSugarStatus && dataPoint.bloodSugarStatus.label &&
                ` (${dataPoint.bloodSugarStatus.label})`}
            </p>
            {dataPoint.adjustedBloodSugar !== undefined && dataPoint.netActivityEffect !== 0 && (
              <p className="tooltip-blood-sugar adjusted">
                With activity effect: {Math.round(dataPoint.adjustedBloodSugar)} {unit}
              </p>
            )}
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Error rendering tooltip:", error);
    return <div>Error displaying tooltip</div>;
  }
}, [unit, safeToFixed, systemActivityLevels]);

  // Check if current time is within chart range
  const currentTimeInRange = useMemo(() => {
    if (!timeScale || !timeScale.start || !timeScale.end) return false;
    try {
      const now = moment().valueOf();
      return now >= timeScale.start && now <= timeScale.end;
    } catch (error) {
      return false;
    }
  }, [timeScale]);

  // Fetch data when date range changes
  useEffect(() => {
    if (!loading && dateRange && dateRange.start && dateRange.end) {
      fetchActivityData();
    }
  }, [fetchActivityData, dateRange]);

  // Table columns with more defensive coding
  const columns = useMemo(() => [
    {
      Header: 'Time',
      accessor: 'formattedTime',
      Cell: ({ value }) => value || 'Unknown'
    },
    {
      Header: 'Activity Level',
      accessor: 'activeActivityCount',
      Cell: ({ row }) => {
        if (!row || !row.original) return 'N/A';

        const activities = row.original.activeActivities || [];
        if (activities.length === 0) return 'None';

        return activities
          .filter(activity => activity) // Filter out undefined
          .map((activity, idx) => {
            return (
              <div key={idx}>
                {activity.levelLabel || 'Unknown'} ({safeToFixed(activity.impact)}x)
              </div>
            );
          });
      }
    },
    {
      Header: 'Effect Multiplier',
      accessor: 'activityEffectMultiplier',
      Cell: ({ value }) => {
        if (value === undefined || value === null || isNaN(value)) return 'N/A';

        const color = value < 1.0 ? '#d32f2f' : value > 1.0 ? '#388e3c' : '#666666';
        return <span style={{ color }}>{safeToFixed(value)}x</span>;
      }
    },
    {
      Header: `Blood Sugar (${unit})`,
      accessor: 'bloodSugar',
      Cell: ({ value }) => (value !== undefined && value !== null) ? value : 'N/A'
    },
    {
      Header: `With Activity (${unit})`,
      accessor: 'adjustedBloodSugar',
      Cell: ({ value }) => (value !== undefined && value !== null) ? Math.round(value) : 'N/A'
    },
    {
      Header: 'Effect Direction',
      accessor: 'netActivityEffect',
      Cell: ({ value }) => {
        if (value === undefined || value === null || isNaN(value) || value === 0) return 'None';
        return value < 0 ? 'Decreases glucose' : 'Increases glucose';
      }
    }
  ], [unit, safeToFixed]);

  // Memoize table data with extra safety
  const tableData = useMemo(() => {
    if (!combinedData || !Array.isArray(combinedData)) return [];

    return combinedData
      .filter(item => item && typeof item === 'object') // Only valid objects
      .filter((_, i) => i % 4 === 0);                  // Sample every 4th point
  }, [combinedData]);

  // Set up React Table
  const tableInstance = useTable(
    {
      columns,
      data: tableData,
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

  return (
    <div className="combined-activity-blood-sugar-chart">
      <h2 className="title">Activity Impact on Blood Sugar</h2>

      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      {/* System Info with updated date/time and user */}
      <div className="system-info">
        <span className="time-label">Current: {currentDateTime} UTC | </span>
        <span className="user-label">User: {currentUserLogin}</span>
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
            className={`toggle-btn ${viewMode === 'impact' ? 'active' : ''}`}
            onClick={() => setViewMode('impact')}
          >
            Activity Impact
          </button>
        </div>
      )}

      <div className="controls">
        <div className="date-controls">
          <div className="date-input-group">
            <label htmlFor="start-date">From:</label>
            <input
              id="start-date"
              type="date"
              name="start"
              value={dateRange?.start || ''}
              onChange={handleDateChange}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="end-date">To:</label>
            <input
              id="end-date"
              type="date"
              name="end"
              value={dateRange?.end || ''}
              onChange={handleDateChange}
            />
          </div>
        </div>

        <div className="quick-ranges">
          <button onClick={() => applyDatePreset(1)}>Last 24h</button>
          <button onClick={() => applyDatePreset(3)}>Last 3 Days</button>
          <button onClick={() => applyDatePreset(7)}>Last Week</button>
        </div>

        <div className="activity-level-filters">
          <div className="filter-header">Activity Levels:</div>
          <div className="filter-options">
            {systemActivityLevels.map(level => (
              <label key={`level-${level.value}`} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedActivityLevels.includes(level.value)}
                  onChange={() => handleActivityLevelToggle(level.value)}
                />
                <span style={{ color: getActivityColor(level.value) }}>
                  {level.label} ({safeToFixed(level.impact)}x)
                </span>
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
              checked={showEstimatedBloodSugar}
              onChange={() => setShowEstimatedBloodSugar(!showEstimatedBloodSugar)}
            />
            Show Estimated Blood Sugar
          </label>
          <label className="display-option">
            <input
              type="checkbox"
              checked={showActivityImpact}
              onChange={() => setShowActivityImpact(!showActivityImpact)}
            />
            Show Activity Impact
          </label>

          <div className="threshold-input">
            <label htmlFor="activity-impact-threshold">Activity Effect Duration (hours):</label>
            <input
              id="activity-impact-threshold"
              type="number"
              min="0.5"
              max="12"
              step="0.5"
              value={activityImpactThreshold}
              onChange={(e) => setActivityImpactThreshold(parseFloat(e.target.value) || 2)}
            />
          </div>

          <div className="threshold-input">
            <label htmlFor="activity-effect-multiplier">Effect Strength Multiplier:</label>
            <input
              id="activity-effect-multiplier"
              type="number"
              min="0.1"
              max="2.0"
              step="0.1"
              value={activityEffectMultiplier}
              onChange={handleEffectMultiplierChange}
            />
          </div>

          <div className="threshold-input">
            <label htmlFor="bar-max-height">Activity Bar Height (% of chart):</label>
            <input
              id="bar-max-height"
              type="number"
              min="5"
              max="50"
              step="5"
              value={barMaxHeight}
              onChange={(e) => setBarMaxHeight(parseInt(e.target.value) || 25)}
            />
          </div>
        </div>

        <button className="update-btn" onClick={handleForceUpdate}>Update Data</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading activity and blood sugar data...</div>
      ) : !combinedData || combinedData.length === 0 ? (
        <div className="no-data">No data found for the selected date range.</div>
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
                    domain={[timeScale?.start || 0, timeScale?.end || 0]}
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
                      domain={[60, 300]} // Fixed domain
                      tickCount={9}
                      label={{ value: `Blood Sugar (${unit})`, angle: -90, position: 'insideLeft' }}
                    />
                  )}

                  {/* Y-axis for activity levels - HIDDEN, used only for positioning */}
                  {(viewMode === 'combined' || viewMode === 'activities') && (
                    <YAxis
                      yAxisId="activityLevel"
                      orientation={showActualBloodSugar ? "right" : "left"}
                      domain={[-2, 2]} // Fixed domain based on system activity scale
                      hide={true} // Hide this axis as we're using custom rendering
                    />
                  )}

                  {/* Y-axis for activity impact */}
                  {(viewMode === 'combined' || viewMode === 'impact') && showActivityImpact && (
                    <YAxis
                      yAxisId="activityImpact"
                      orientation="right"
                      domain={[-0.6, 0.6]} // Fixed domain -0.6 to 0.6
                      ticks={[-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6]}
                      tickFormatter={formatActivityImpactAxis}
                      label={{ value: 'Activity Effect (multiplier)', angle: -90, position: 'insideRight' }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Target glucose reference line */}
                  {showActualBloodSugar && targetGlucose && (
                    <ReferenceLine
                      y={targetGlucose}
                      yAxisId="bloodSugar"
                      label="Target"
                      stroke="#FF7300"
                      strokeDasharray="3 3"
                    />
                  )}

                  {/* Blood Sugar Lines */}
                  {showActualBloodSugar && (
                    <>
                      {/* Actual blood sugar line */}
                      <Line
                        yAxisId="bloodSugar"
                        type="monotone"
                        dataKey="bloodSugar"
                        name={`Blood Sugar (${unit})`}
                        stroke="#8884d8"
                        dot={{ r: 4 }}
                        activeDot={{ r: 8 }}
                        connectNulls
                      />

                      {/* Activity-adjusted blood sugar */}
                      {showActivityImpact && (
                        <Line
                          yAxisId="bloodSugar"
                          type="monotone"
                          dataKey="adjustedBloodSugar"
                          name={`With Activity Effect (${unit})`}
                          stroke="#4CAF50"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6 }}
                          connectNulls
                        />
                      )}
                    </>
                  )}

                  {/* Activity Bars - Now rendered with custom component */}
                  {(viewMode === 'combined' || viewMode === 'activities') &&
                    // Map individual activities to custom bars
                    activityData
                      .filter(activity => selectedActivityLevels.includes(activity.level))
                      .map(activity => (
                        <Bar
                          key={`activity-${activity.id}`}
                          yAxisId="activityLevel"
                          dataKey="timestamp"
                          name={activity.levelLabel}
                          fill={getActivityColor(activity.level)}
                          shape={(props) => (
                            <CustomActivityBar
                              {...props}
                              activityData={activity}
                              width={(activity.durationMs / (60 * 60 * 1000)) * 15}
                            />
                          )}
                          data={[
                            // Create a single data point at the middle of the activity
                            { timestamp: activity.startTime + (activity.durationMs / 2) }
                          ]}
                        />
                      ))
                  }

                  {/* Activity Impact Area */}
                  {(viewMode === 'combined' || viewMode === 'impact') && showActivityImpact && (
                    <>
                      <Area
                        yAxisId="activityImpact"
                        type="monotone"
                        dataKey="netActivityEffect"
                        name="Activity Effect"
                        stroke="#ff9999"
                        fill={(dataPoint) => {
                          if (!dataPoint || dataPoint.netActivityEffect === undefined) return '#cccccc';
                          return dataPoint.netActivityEffect < 0 ? '#ff9999' : '#82ca9d';
                        }}
                        fillOpacity={0.6}
                        strokeWidth={2}
                      />
                    </>
                  )}

                  {/* Current time reference line */}
                  {currentTimeInRange && (
                    <ReferenceLine
                      x={moment().valueOf()}
                      yAxisId={showActualBloodSugar ? "bloodSugar" : "activityLevel"}
                      stroke="#ff0000"
                      strokeWidth={2}
                      label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="chart-legend">
                <h4>Activity Levels & Effects</h4>
                <div className="activity-levels-grid">
                  {systemActivityLevels.map((level) => (
                    <div key={`legend-${level.value}`} className="activity-level-details">
                      <div className="activity-level-header">
                        <span
                          className="activity-color-box"
                          style={{ backgroundColor: getActivityColor(level.value) }}
                        ></span>
                        <span className="activity-level-name">
                          {level.value}: {level.label}
                        </span>
                      </div>
                      <div className="activity-impact">
                        <span style={{
                          color: level.impact < 1.0 ? '#d32f2f' : level.impact > 1.0 ? '#388e3c' : '#666666'
                        }}>
                          Impact: {safeToFixed(level.impact)}x
                          {level.impact < 1.0 ? ' (decreases blood sugar)' :
                           level.impact > 1.0 ? ' (increases blood sugar)' : ' (neutral)'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Blood sugar effect legend */}
                {showActualBloodSugar && (
                  <div className="blood-sugar-legend">
                    <h4>Blood Sugar Effects</h4>
                    <div className="legend-item">
                      <span className="legend-color" style={{
                        backgroundColor: '#8884d8',
                        height: '12px',
                        width: '12px',
                        border: '2px solid #5e52a2'
                      }}></span>
                      <span>Actual/Estimated Readings</span>
                    </div>
                    {showActivityImpact && (
                      <div className="legend-item">
                        <span className="legend-color" style={{
                          backgroundColor: '#4CAF50',
                          height: '12px',
                          width: '12px',
                          border: '2px solid #1B5E20'
                        }}></span>
                        <span>With Activity Effect</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Activity impact legend */}
                {showActivityImpact && (
                  <div className="impact-legend">
                    <h4>Activity Impact</h4>
                    <div className="legend-item">
                      <span className="legend-area" style={{
                        backgroundColor: '#82ca9d',
                        opacity: 0.6,
                        height: '20px',
                        width: '40px',
                        display: 'inline-block',
                        marginRight: '8px'
                      }}></span>
                      <span>Increasing Effect (&gt;1.0x)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-area" style={{
                        backgroundColor: '#ff9999',
                        opacity: 0.6,
                        height: '20px',
                        width: '40px',
                        display: 'inline-block',
                        marginRight: '8px'
                      }}></span>
                      <span>Decreasing Effect (&lt;1.0x)</span>
                    </div>
                  </div>
                )}

                {/* Activity bars legend */}
                <div className="activity-bars-legend">
                  <h4>Activity Bar Visualization</h4>
                  <div className="legend-item">
                    <span className="legend-bar decreasing" style={{
                      backgroundColor: '#e6550d',
                      height: '20px',
                      width: '20px',
                      display: 'inline-block',
                      marginRight: '8px',
                      verticalAlign: 'top'
                    }}></span>
                    <span>High/Vigorous Activities: Emerge from top ↓ (decrease blood sugar)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-bar increasing" style={{
                      backgroundColor: '#6baed6',
                      height: '20px',
                      width: '20px',
                      display: 'inline-block',
                      marginRight: '8px',
                      verticalAlign: 'bottom'
                    }}></span>
                    <span>Low/Very Low Activities: Emerge from bottom ↑ (increase blood sugar)</span>
                  </div>
                  <div className="legend-note">
                    <span>Bar width represents activity duration. Bar height represents activity intensity.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
            <div className="table-container">
              <table {...getTableProps()} className="activity-effect-table">
                <thead>
                  {headerGroups.map((headerGroup, i) => (
                    <tr key={`headergroup-${i}`} {...headerGroup.getHeaderGroupProps()}>
                      {headerGroup.headers.map((column, j) => (
                        <th key={`header-${j}`} {...column.getHeaderProps(column.getSortByToggleProps())}>
                          {column.render('Header')}
                          <span>
                            {column.isSorted
                              ? column.isSortedDesc
                                ? ' 🔽'
                                : ' 🔼'
                              : ''}
                          </span>
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody {...getTableBodyProps()}>
                  {page && page.length > 0 ? page.map((row, i) => {
                    prepareRow(row);
                    return (
                      <tr key={`row-${i}`} {...row.getRowProps()}>
                        {row.cells.map((cell, j) => (
                          <td key={`cell-${i}-${j}`} {...cell.getCellProps()}>
                            {cell.render('Cell')}
                          </td>
                        ))}
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={columns.length} style={{textAlign: 'center'}}>
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination">
                <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
                <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
                <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
                <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
                <span>
                  Page {' '}
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
                  {[10, 20, 30, 40, 50].map(pageSize => (
                    <option key={pageSize} value={pageSize}>
                      Show {pageSize}
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

export default ActivityBloodSugarChart;