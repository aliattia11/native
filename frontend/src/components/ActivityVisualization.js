import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  ReferenceLine
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import './ActivityVisualization.css';

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
    unit
  } = useBloodSugarData();

  // Local state
  const [activityData, setActivityData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [activityLevels, setActivityLevels] = useState([]);
  const [selectedActivityLevels, setSelectedActivityLevels] = useState([]);
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
  const [processedBloodSugarData, setProcessedBloodSugarData] = useState([]);

  // Fixed current date and time as specified
  const currentDateTime = "2025-04-22 23:57:10";
  const currentUserLogin = "aliattia02";

  // Define activity levels for the range 0-8
  const ACTIVITY_LEVELS = useMemo(() => [
    { value: 0, label: "None", description: "No physical activity" },
    { value: 1, label: "Very Light", description: "Standing, casual walking" },
    { value: 2, label: "Light", description: "Walking leisurely, light housework" },
    { value: 3, label: "Light Plus", description: "Brisk walking, gardening" },
    { value: 4, label: "Moderate", description: "Cycling, swimming leisurely" },
    { value: 5, label: "Moderate Plus", description: "Light aerobics, dancing" },
    { value: 6, label: "Vigorous", description: "Running, intense cycling" },
    { value: 7, label: "Very Vigorous", description: "Fast running, HIIT workout" },
    { value: 8, label: "Extreme", description: "Competition-level exertion" }
  ], []);

  // Impact ticks for Y-axis
  const activityImpactTicks = useMemo(() => [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], []);

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Helper function to get activity impact coefficient from patient constants
  const getActivityImpact = useCallback((level) => {
    if (!patientConstants || !patientConstants.activity_coefficients) return 1.0;
    return patientConstants.activity_coefficients[level] || 1.0;
  }, [patientConstants]);

  // Calculate activity effect on blood glucose at a given time point
  const calculateActivityEffect = useCallback((activityImpact, hoursSinceStart, hoursDuration) => {
    // Effect is strongest during the activity
    if (hoursSinceStart < 0) return 0;

    // During activity
    if (hoursSinceStart <= hoursDuration) {
      return activityImpact; // Full impact during activity
    }

    // After activity, effect gradually diminishes over activityImpactThreshold hours
    const hoursAfterActivity = hoursSinceStart - hoursDuration;
    if (hoursAfterActivity <= activityImpactThreshold) {
      // Using a curve function that starts at full impact and smoothly decreases to zero
      // This creates a more natural curve instead of a linear decline
      const normalizedTime = hoursAfterActivity / activityImpactThreshold;
      const curveEffect = Math.cos(normalizedTime * Math.PI / 2); // Cosine curve from 1 to 0
      return activityImpact * curveEffect;
    }

    // After threshold hours, no effect
    return 0;
  }, [activityImpactThreshold]);

  // Helper function to get consistent colors for activity levels - MOVED UP to fix hoisting issue
  const getActivityColor = useCallback((level) => {
    // Define colors for activity levels 0-8
    const colors = [
      '#cccccc', // Level 0 - None (gray)
      '#a5d6a7', // Level 1 - Very Light (light green)
      '#66bb6a', // Level 2 - Light (medium green)
      '#43a047', // Level 3 - Light Plus (green)
      '#4fc3f7', // Level 4 - Moderate (light blue)
      '#29b6f6', // Level 5 - Moderate Plus (medium blue)
      '#ffa726', // Level 6 - Vigorous (orange)
      '#ff7043', // Level 7 - Very Vigorous (deep orange)
      '#f44336'  // Level 8 - Extreme (red)
    ];

    // Map level to color, ensuring it's within range
    const safeLevel = Math.max(0, Math.min(level, colors.length - 1));
    return colors[safeLevel];
  }, []);

  // Generate combined data for timeline visualization
  const generateCombinedData = useCallback((activityData, bloodGlucoseData) => {
    try {
      // Find the earliest and latest timestamps
      let allTimestamps = [
        ...activityData.map(d => d.startTime),
        ...activityData.map(d => d.endTime),
        ...bloodGlucoseData.map(d => d.readingTime)
      ];

      if (allTimestamps.length === 0) {
        return [];
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
          activeActivities: {},
          activityEffects: {},
          activityEffectByLevel: {},
          cumulativeActivityEffect: 1.0, // Start with neutral effect
          totalActivityImpact: 0,        // For visualization
          decreaseActivityImpact: 0,     // For decreasing impacts
          increaseActivityImpact: 0      // For increasing impacts
        };

        // Add blood sugar reading if available at this time
        const closestBloodSugar = bloodGlucoseData.find(bs =>
          Math.abs(bs.readingTime - currentTime) < 15 * 60 * 1000 // Within 15 minutes
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes;
          timePoint.isActualReading = closestBloodSugar.isActualReading;
        }

        // Calculate active activities and their effects at this time
        const thisMoment = currentTime;

        // Track effects by level for stacking in visualization
        const effectsByLevel = {};
        for (let i = 0; i <= 8; i++) {
          effectsByLevel[i] = 0;
        }

        let overlappingActivities = [];

        // First identify all activities that are active at this point
        activityData.forEach(activity => {
          const activityStart = activity.startTime;
          const activityEnd = activity.endTime;

          // Check if this activity is active or still having an effect at current time
          const isActive = thisMoment >= activityStart &&
                          (thisMoment <= activityEnd ||
                           thisMoment <= activityEnd + (activityImpactThreshold * 60 * 60 * 1000));

          if (isActive) {
            overlappingActivities.push(activity);

            // Record active activity for the bar chart
            if (thisMoment >= activityStart && thisMoment <= activityEnd) {
              const level = activity.level;
              timePoint.activeActivities[level] = (timePoint.activeActivities[level] || 0) + 1;
            }
          }
        });

        // Calculate the cumulative effect of all active activities
        let decreaseImpact = 0;
        let increaseImpact = 0;

        overlappingActivities.forEach(activity => {
          const activityStart = activity.startTime;
          const activityEnd = activity.endTime;

          // Calculate time since activity started in hours
          const hoursSinceStart = (thisMoment - activityStart) / (60 * 60 * 1000);

          // Calculate activity duration in hours
          const durationHours = (activityEnd - activityStart) / (60 * 60 * 1000);

          // Get impact coefficient for this activity
          const activityImpact = getActivityImpact(activity.level);

          // Calculate effect - use absolute value of impact difference to display magnitude
          const impactDifference = activityImpact - 1.0;
          const effect = calculateActivityEffect(Math.abs(impactDifference), hoursSinceStart, durationHours);

          if (effect > 0) {
            // Track by level for visualization
            effectsByLevel[activity.level] += effect;

            // Update cumulative effect
            timePoint.activityEffects[activity.level] =
              (timePoint.activityEffects[activity.level] || 0) + effect;

            // Track direction of impact
            if (activityImpact < 1.0) {
              decreaseImpact += effect;
            } else if (activityImpact > 1.0) {
              increaseImpact += effect;
            }
          }
        });

        // Store the impact values for visualization
        timePoint.decreaseActivityImpact = Math.min(0.6, decreaseImpact);
        timePoint.increaseActivityImpact = Math.min(0.6, increaseImpact);

        // Determine which effect is stronger
        if (decreaseImpact > increaseImpact) {
          // More decreasing effect
          timePoint.totalActivityImpact = Math.min(0.6, decreaseImpact);
          timePoint.impactDirection = 'decrease';
          timePoint.cumulativeActivityEffect = 1.0 - decreaseImpact;
        } else {
          // More increasing effect or neutral
          timePoint.totalActivityImpact = Math.min(0.6, increaseImpact);
          timePoint.impactDirection = 'increase';
          timePoint.cumulativeActivityEffect = 1.0 + increaseImpact;
        }

        // Store effect by level for stacked area chart
        for (let i = 0; i <= 8; i++) {
          if (effectsByLevel[i] > 0) {
            timePoint.activityEffectByLevel[i] = effectsByLevel[i];
          }
        }

        // Calculate adjusted blood sugar based on activity effect
        if (timePoint.bloodSugar && timePoint.totalActivityImpact > 0) {
          // Activity tends to lower blood sugar if impact < 1.0 (decreasing effect)
          // Otherwise increases blood sugar
          const adjustmentFactor = 0.5; // How strongly activity affects blood sugar
          const baseAdjustment = timePoint.bloodSugar * timePoint.totalActivityImpact *
                                (timePoint.impactDirection === 'decrease' ? -1 : 1) * adjustmentFactor;
          timePoint.adjustedBloodSugar = Math.max(70, timePoint.bloodSugar + baseAdjustment);
        }

        timelineData.push(timePoint);
        currentTime += interval;
      }

      return timelineData;
    } catch (error) {
      console.error('Error generating combined data:', error);
      return [];
    }
  }, [calculateActivityEffect, getActivityImpact, activityImpactThreshold]);

  // Apply activity effect to blood sugar data
  const applyActivityEffect = useCallback((activityData, bloodSugarData) => {
    if (!activityData || activityData.length === 0 || !bloodSugarData || bloodSugarData.length === 0) {
      return bloodSugarData;
    }

    // Clone the blood sugar data to avoid mutation
    const modifiedData = JSON.parse(JSON.stringify(bloodSugarData));

    // For each blood sugar reading, calculate the cumulative activity effect
    modifiedData.forEach(reading => {
      if (!reading.isEstimated && !reading.isInterpolated) {
        // Don't modify actual readings
        return;
      }

      const readingTime = reading.readingTime;

      // Find all activities that could be affecting this reading
      const relevantActivities = activityData.filter(activity => {
        const activityEnd = activity.endTime;
        const postEffectEnd = activityEnd + (activityImpactThreshold * 60 * 60 * 1000);

        // Activity is relevant if the reading is after start and before post-effect end
        return readingTime >= activity.startTime && readingTime <= postEffectEnd;
      });

      if (relevantActivities.length === 0) {
        reading.activityAdjustedBloodSugar = reading.bloodSugar;
        reading.activityEffect = 0;
        return;
      }

      // Calculate effects separately for decreasing and increasing impacts
      let decreaseImpact = 0;
      let increaseImpact = 0;

      relevantActivities.forEach(activity => {
        const hoursSinceStart = (readingTime - activity.startTime) / (60 * 60 * 1000);
        const durationHours = (activity.endTime - activity.startTime) / (60 * 60 * 1000);

        // Get activity impact coefficient
        const activityImpact = activity.impact;

        // Calculate effect
        const impactDifference = activityImpact - 1.0;
        const effect = calculateActivityEffect(Math.abs(impactDifference), hoursSinceStart, durationHours);

        if (effect > 0) {
          // Track direction of impact
          if (activityImpact < 1.0) {
            decreaseImpact += effect;
          } else if (activityImpact > 1.0) {
            increaseImpact += effect;
          }
        }
      });

      // Determine the dominant effect
      if (decreaseImpact > increaseImpact) {
        reading.activityEffect = Math.min(0.6, decreaseImpact);
        reading.impactDirection = 'decrease';
        reading.activityEffectMultiplier = 1.0 - decreaseImpact;

        // Apply decreasing effect to blood sugar
        const adjustmentFactor = 0.5;
        const baseAdjustment = reading.bloodSugar * reading.activityEffect * -adjustmentFactor;
        reading.activityAdjustedBloodSugar = Math.max(70, reading.bloodSugar + baseAdjustment);
      } else {
        reading.activityEffect = Math.min(0.6, increaseImpact);
        reading.impactDirection = 'increase';
        reading.activityEffectMultiplier = 1.0 + increaseImpact;

        // Apply increasing effect to blood sugar
        const adjustmentFactor = 0.5;
        const baseAdjustment = reading.bloodSugar * reading.activityEffect * adjustmentFactor;
        reading.activityAdjustedBloodSugar = reading.bloodSugar + baseAdjustment;
      }
    });

    return modifiedData;
  }, [activityImpactThreshold, calculateActivityEffect]);

  // Fetch activity data from API
  const fetchActivityData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Calculate the date range
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
      const processedActivityData = response.data.map(activity => {
        // Use the appropriate time fields, convert to milliseconds for processing
        const startTime = moment(activity.startTime || activity.expectedTime || activity.timestamp).valueOf();
        const endTime = moment(activity.endTime || activity.completedTime || activity.timestamp).valueOf();

        // Calculate impact based on level
        const impact = activity.impact || getActivityImpact(activity.level);

        // Get activity level label
        const levelObj = ACTIVITY_LEVELS.find(l => l.value === parseInt(activity.level)) ||
                         { label: `Level ${activity.level}`, description: "" };

        return {
          id: activity.id,
          level: parseInt(activity.level), // Ensure level is a number
          levelLabel: activity.levelLabel || levelObj.label,
          levelDescription: levelObj.description,
          startTime,
          endTime,
          formattedStartTime: moment(startTime).format('MM/DD/YYYY, HH:mm'),
          formattedEndTime: moment(endTime).format('MM/DD/YYYY, HH:mm'),
          duration: activity.duration || '00:00',
          impact,
          notes: activity.notes || '',
          type: activity.type || 'unknown'
        };
      });

      // Extract unique activity levels
      const levels = [...new Set(processedActivityData.map(activity => activity.level))];
      levels.sort((a, b) => a - b); // Sort levels numerically
      setActivityLevels(levels);

      // Only set selected levels if it's empty and we have levels
      if (selectedActivityLevels.length === 0 && levels.length > 0) {
        setSelectedActivityLevels(levels);
      }

      setActivityData(processedActivityData);

      // Generate combined data with blood sugar
      const combinedResult = generateCombinedData(processedActivityData, allBloodSugarData);
      setCombinedData(combinedResult);

      // Process blood sugar data with activity effects
      const processed = applyActivityEffect(processedActivityData, allBloodSugarData);
      setProcessedBloodSugarData(processed);

      setError('');
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError('Failed to load activity data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, patientId, selectedActivityLevels.length, getActivityImpact, allBloodSugarData, generateCombinedData, ACTIVITY_LEVELS, applyActivityEffect]);

  // Table columns definition - MOVED after getActivityColor to fix hoisting issue
  const columns = useMemo(() => [
    {
      Header: 'Start Time',
      accessor: 'formattedStartTime',
      sortType: (a, b) => a.original.startTime - b.original.startTime
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
      accessor: 'levelLabel',
      Cell: ({ row }) => {
        const color = getActivityColor(row.original.level);
        return (
          <span style={{ color, fontWeight: 'bold' }}>
            {row.original.levelLabel}
          </span>
        );
      }
    },
    {
      Header: 'Impact',
      accessor: 'impact',
      Cell: ({ value }) => {
        const formattedValue = value.toFixed(2) + 'x';
        const color = value < 1.0 ? '#d32f2f' : value > 1.0 ? '#388e3c' : '#666666';
        return <span style={{ color }}>{formattedValue}</span>;
      }
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
  ], [getActivityColor]);

  // Filter function for activity levels
  const handleActivityLevelToggle = useCallback((level) => {
    setSelectedActivityLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level);
      } else {
        return [...prev, level];
      }
    });
  }, []);

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

  // Format activity impact for Y-axis labels
  const formatActivityImpactAxis = useCallback((value) => {
    return value.toFixed(1);
  }, []);

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;

      return (
        <div className="activity-tooltip">
          <p className="tooltip-time">{moment(dataPoint.timestamp).format('MM/DD/YYYY, HH:mm')}</p>

          {/* Display active activities */}
          {Object.entries(dataPoint.activeActivities).length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Active Activities:</p>
              {Object.entries(dataPoint.activeActivities).map(([level, count], idx) => {
                const levelObj = ACTIVITY_LEVELS.find(l => l.value === parseInt(level)) ||
                             { label: `Level ${level}`, description: "" };
                return (
                  <p key={idx} className="tooltip-activity">
                    {levelObj.label} - {count} {count === 1 ? 'activity' : 'activities'}
                  </p>
                );
              })}
            </div>
          )}

          {/* Display activity effect */}
          {dataPoint.totalActivityImpact > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Activity Effect:</p>
              <p className="tooltip-effect" style={{
                color: dataPoint.impactDirection === 'decrease' ? '#d32f2f' : '#388e3c'
              }}>
                {(dataPoint.totalActivityImpact * 100).toFixed(1)}%
                {dataPoint.impactDirection === 'decrease' ? ' decrease' : ' increase'}
                {' '}(Multiplier: {dataPoint.cumulativeActivityEffect.toFixed(2)}x)
              </p>
              {Object.entries(dataPoint.activityEffects).map(([level, effect], idx) => {
                if (effect <= 0) return null;
                const levelObj = ACTIVITY_LEVELS.find(l => l.value === parseInt(level)) ||
                             { label: `Level ${level}` };
                return (
                  <p key={idx} className="tooltip-effect-detail">
                    {levelObj.label}: {effect.toFixed(2)}
                  </p>
                );
              })}
            </div>
          )}

          {/* Display blood sugar if available */}
          {dataPoint.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar:</p>
              <p className="tooltip-blood-sugar">
                {dataPoint.bloodSugar} {unit}
                {dataPoint.bloodSugarStatus && ` (${dataPoint.bloodSugarStatus.label})`}
              </p>
              {dataPoint.adjustedBloodSugar && (
                <p className="tooltip-blood-sugar adjusted">
                  With activity effect: {Math.round(dataPoint.adjustedBloodSugar * 10) / 10} {unit}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  }, [unit, ACTIVITY_LEVELS]);

  // Filter the activity data based on selectedActivityLevels
  const filteredActivityData = useMemo(() => {
    return activityData.filter(item => selectedActivityLevels.includes(item.level));
  }, [activityData, selectedActivityLevels]);

  // Table instance
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

  // Format X-axis labels
  const formatXAxis = useCallback((tickItem) => {
    return moment(tickItem).format('MM/DD HH:mm');
  }, []);

  // Force update the data
  const handleForceUpdate = useCallback(() => {
    fetchActivityData();
  }, [fetchActivityData]);

  // Generate ticks for x-axis based on time scale
  const ticks = useMemo(() => {
    const ticksArray = [];
    let current = moment(timeScale.start).startOf('hour');
    const end = moment(timeScale.end);
    const tickInterval = timeScale.tickInterval || 12; // Default to 12 hours if not specified

    // Align ticks to exact hour boundaries for consistent grid alignment
    while (current.isBefore(end)) {
      ticksArray.push(current.valueOf());
      current = current.add(tickInterval, 'hours');
    }

    return ticksArray;
  }, [timeScale]);

  // Check if current time is within chart range
  const currentTimeInRange = moment().valueOf() >= timeScale.start && moment().valueOf() <= timeScale.end;

  // Helper to get color based on impact direction
  const getImpactColor = useCallback((direction) => {
    return direction === 'decrease' ? '#ff9999' : '#82ca9d';
  }, []);

  return (
    <div className="activity-visualization">
      <h2 className="title">Activity and Blood Sugar Analysis</h2>

      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      {/* System Info with current date/time and user */}
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
              value={dateRange.start}
              onChange={handleDateChange}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="end-date">To:</label>
            <input
              id="end-date"
              type="date"
              name="end"
              value={dateRange.end}
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
            {activityLevels.map(level => {
              const levelObj = ACTIVITY_LEVELS.find(l => l.value === level) ||
                            { label: `Level ${level}`, description: "" };
              return (
                <label key={`level-${level}`} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedActivityLevels.includes(level)}
                    onChange={() => handleActivityLevelToggle(level)}
                  />
                  <span style={{ color: getActivityColor(level) }}>
                    {levelObj.label}
                  </span>
                </label>
              );
            })}
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

                  {/* Y-axis for blood sugar - FIXED DOMAIN 60-300 */}
                  {showActualBloodSugar && (
                    <YAxis
                      yAxisId="bloodSugar"
                      orientation="left"
                      domain={[60, 300]} // Fixed domain as requested
                      tickCount={9} // More ticks for better resolution
                      label={{ value: `Blood Sugar (${unit})`, angle: -90, position: 'insideLeft' }}
                    />
                  )}

                  {/* Y-axis for activity levels - FIXED DOMAIN 0-10 */}
                  {(viewMode === 'combined' || viewMode === 'activities') && (
                    <YAxis
                      yAxisId="activityLevel"
                      orientation={showActualBloodSugar ? "right" : "left"}
                      domain={[0, 10]} // Fixed domain as requested
                      label={{
                        value: 'Activity Level (0-10)',
                        angle: -90,
                        position: showActualBloodSugar ? 'insideRight' : 'insideLeft'
                      }}
                    />
                  )}

                  {/* Y-axis for activity impact - FIXED DOMAIN 0-0.6 with ticks at 0.1 intervals */}
                  {(viewMode === 'combined' || viewMode === 'impact') && showActivityImpact && (
                    <YAxis
                      yAxisId="activityImpact"
                      orientation="right"
                      domain={[0, 0.6]} // Fixed domain as requested
                      ticks={activityImpactTicks} // Ticks at 0.1 intervals
                      tickFormatter={formatActivityImpactAxis}
                      label={{ value: 'Activity Effect (absolute)', angle: -90, position: 'insideRight' }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

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

                  {/* Blood Sugar Lines */}
                  {showActualBloodSugar && (
                    <>
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

                      {/* Adjusted Blood Sugar with Activity Effect */}
                      {showActivityImpact && (
                        <Line
                          yAxisId="bloodSugar"
                          type="monotone"
                          dataKey="adjustedBloodSugar"
                          name={`With Activity Effect (${unit})`}
                          stroke="#4CAF50"
                          strokeWidth={2.5}
                          dot={{
                            r: 4,
                            fill: "#4CAF50",
                            stroke: "#1B5E20",
                            strokeWidth: 1.5
                          }}
                          activeDot={{
                            r: 8,
                            stroke: "#ffffff",
                            strokeWidth: 2
                          }}
                          connectNulls
                        />
                      )}
                    </>
                  )}

                  {/* Activity Level Bars */}
                  {(viewMode === 'combined' || viewMode === 'activities') &&
                    ACTIVITY_LEVELS
                      .filter(level => selectedActivityLevels.includes(level.value))
                      .map((level) => (
                        <Bar
                          key={`activity-level-${level.value}`}
                          yAxisId="activityLevel"
                          dataKey={`activeActivities.${level.value}`}
                          name={`${level.label}`}
                          fill={getActivityColor(level.value)}
                          barSize={40}
                          stackId="activities"
                        />
                      ))
                  }

                  {/* Activity Impact Area - Using two separate areas for decrease and increase */}
                  {(viewMode === 'combined' || viewMode === 'impact') && showActivityImpact && (
                    <>
                      {/* Decreasing impact (activities with impact < 1.0) */}
                      <Area
                        yAxisId="activityImpact"
                        type="monotone"
                        dataKey="decreaseActivityImpact"
                        name="Decreasing Effect"
                        fill="#ff9999"
                        stroke="#ff9999"
                        fillOpacity={0.6}
                        strokeWidth={2}
                      />

                      {/* Increasing impact (activities with impact > 1.0) */}
                      <Area
                        yAxisId="activityImpact"
                        type="monotone"
                        dataKey="increaseActivityImpact"
                        name="Increasing Effect"
                        fill="#82ca9d"
                        stroke="#82ca9d"
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
                <h4>Activity Levels Legend</h4>
                <div className="activity-levels-grid">
                  {ACTIVITY_LEVELS.map((level) => {
                    const impact = getActivityImpact(level.value);
                    return (
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
                            color: impact < 1.0 ? '#d32f2f' : impact > 1.0 ? '#388e3c' : '#666666'
                          }}>
                            Impact: {impact.toFixed(2)}x
                          </span>
                          <br/>
                          <small>{level.description}</small>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Blood sugar effect legend */}
                {showActualBloodSugar && processedBloodSugarData.some(d => d.activityAdjustedBloodSugar) && (
                  <div className="blood-sugar-legend">
                    <h4>Blood Sugar Effects</h4>
                    <div className="legend-item" style={{ marginTop: '10px', fontWeight: 'bold' }}>
                      <span className="legend-color" style={{
                        backgroundColor: '#8884d8',
                        height: '12px',
                        width: '12px',
                        border: '2px solid #5e52a2'
                      }}></span>
                      <span>Actual/Estimated Readings</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-color" style={{
                        backgroundColor: '#4CAF50',
                        height: '12px',
                        width: '12px',
                        border: '2px solid #1B5E20'
                      }}></span>
                      <span>With Activity Effect</span>
                    </div>
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
                      <span>Increasing Effect (impact &gt; 1.0)</span>
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
                      <span>Decreasing Effect (impact &lt; 1.0)</span>
                    </div>
                  </div>
                )}

                {/* Scale information */}
                <div className="scale-info">
                  <h4>Fixed Scales</h4>
                  <ul>
                    <li>Blood Sugar: 60-300 {unit}</li>
                    <li>Activity Level: 0-10</li>
                    <li>Activity Impact: 0.0-0.6 in 0.1 increments</li>
                  </ul>
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
                  {page.length > 0 ? (
                    page.map((row, i) => {
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="no-data">
                        No activity data found for the selected date range.
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

export default ActivityBloodSugarChart;