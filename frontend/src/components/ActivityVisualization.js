import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { FaSync } from 'react-icons/fa';
import './ActivityVisualization.css';

// Color palette for different activity levels
const activityColors = {
  '-2': '#ff7f0e', // Sedentary (orange)
  '-1': '#ffbb78', // Light sedentary (light orange)
  '0': '#aec7e8',  // Normal (light blue)
  '1': '#1f77b4',  // Active (blue)
  '2': '#2ca02c'   // Very active (green)
};

// Activity level labels
const activityLevelLabels = {
  '-2': 'Mode 1 (Very Sedentary)',
  '-1': 'Mode 2 (Sedentary)',
  '0': 'Normal Activity',
  '1': 'High Activity',
  '2': 'Vigorous Activity'
};

const ActivityVisualization = ({ isDoctor = false, patientId = null }) => {
  // Use patient constants for activity impact parameters
  const { patientConstants, loading: constantsLoading } = useConstants();

  // State for data handling
  const [activityData, setActivityData] = useState([]);
  const [bloodSugarData, setBloodSugarData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [activityLevels, setActivityLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [futureHours, setFutureHours] = useState(8); // Default to 8 hours future projection

  // UI state
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(3, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });
  const [selectedActivityLevels, setSelectedActivityLevels] = useState([]);
  const [showActualBloodSugar, setShowActualBloodSugar] = useState(true);
  const [showExpectedEffect, setShowExpectedEffect] = useState(true);
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [viewMode, setViewMode] = useState('combined'); // 'combined', 'activities', or 'effect'
  const [userTimeZone, setUserTimeZone] = useState('');

  // Set user's timezone on mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Calculate activity effect on blood sugar based on activity parameters
  const calculateActivityEffect = useCallback((hoursSinceActivity, duration, level, bloodSugarBaseline = 100) => {
    if (!patientConstants?.activity_coefficients) {
      return 0;
    }

    // Convert duration from "HH:MM" format to hours
    let durationHours = 1; // Default to 1 hour
    if (typeof duration === 'string' && duration.includes(':')) {
      const [hours, minutes] = duration.split(':').map(Number);
      durationHours = hours + (minutes / 60);
    } else if (typeof duration === 'number') {
      durationHours = duration;
    }

    // Get activity coefficient from constants (how much it impacts blood sugar)
    const activityCoefficient = patientConstants.activity_coefficients[level] || 1.0;

    // Calculate impact multiplier (1.0 means no change, <1.0 means reduction, >1.0 means increase)
    // For activity, values <1.0 mean blood sugar reduction (e.g. 0.8 = 20% reduction)
    const impactStrength = (2 - activityCoefficient); // Convert to appropriate scale

    // Calculate activity phases
    const duringActivityPhase = 0; // Hours from start
    const peakEffectPhase = durationHours; // Hours from start
    const extendedEffectPhase = durationHours + 4; // Extended effect (up to 4 hours after activity)

    // No effect before activity started
    if (hoursSinceActivity < 0) {
      return 0;
    }
    // During activity: increasing effect
    else if (hoursSinceActivity <= durationHours) {
      // Progressive impact that builds during the activity
      const progressFactor = hoursSinceActivity / durationHours;
      // Max impact is 20-40 points depending on activity level and duration
      const maxImpact = bloodSugarBaseline * (1 - activityCoefficient) * Math.min(1.0, durationHours / 2);
      return -maxImpact * progressFactor;
    }
    // Post-activity: extended effect with gradual reduction
    else if (hoursSinceActivity <= extendedEffectPhase) {
      const remainingEffect = 1 - ((hoursSinceActivity - durationHours) / 4);
      // Extended effect is about half the intensity of during activity
      const maxImpact = bloodSugarBaseline * (1 - activityCoefficient) * 0.5 * Math.min(1.0, durationHours / 2);
      return -maxImpact * remainingEffect;
    }
    // No more effect after extended phase
    else {
      return 0;
    }
  }, [patientConstants]);

  // Handle refresh button click
  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey(prevKey => prevKey + 1);
  };

  // Apply date presets with improved 24h handling
  const applyDatePreset = useCallback((days) => {
    // For 24h filter, use exact timestamps instead of just dates
    if (days === 1) {
      const now = new Date();
      const yesterday = new Date(now.getTime() - (24 * 60 * 60 * 1000));

      setDateRange({
        start: yesterday.toISOString().split('T')[0], // YYYY-MM-DD format
        end: now.toISOString().split('T')[0],
        exactHours: true, // flag to indicate we want exact 24 hours
        startTime: yesterday.toISOString(), // full ISO timestamp
        endTime: now.toISOString()
      });
    } else {
      // For other ranges, continue using dates
      setDateRange({
        start: moment().subtract(days, 'days').format('YYYY-MM-DD'),
        end: moment().format('YYYY-MM-DD'),
        exactHours: false
      });
    }
  }, []);

  // Fetch activity and blood glucose data
useEffect(() => {
  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const headers = { Authorization: `Bearer ${token}` };

      // Prepare API parameters for time-based filtering
      let activityParams, bloodSugarParams;

      // If using exactHours (for 24h filter), pass precise timestamps
      if (dateRange.exactHours) {
        // Activity params - filter by start time
        activityParams = {
          include_details: true,
          patient_id: patientId || undefined,
          filter_by: 'start_time',  // Explicitly filter by start_time
          start_time: dateRange.startTime,
          end_time: dateRange.endTime
        };

        // Blood sugar params - use the same time window
        bloodSugarParams = {
          patient_id: patientId || undefined,
          filter_by: 'reading_time', // Use appropriate field for blood sugar
          start_time: dateRange.startTime,
          end_time: dateRange.endTime
        };

        console.log(`Fetching data with exact time range from ${dateRange.startTime} to ${dateRange.endTime}`);
      } else {
        // Activity params - filter by date with start time focus
        activityParams = {
          include_details: true,
          patient_id: patientId || undefined,
          filter_by: 'start_time',  // Explicitly filter by start_time
          start_date: dateRange.start,
          end_date: dateRange.end
        };

        // Blood sugar params - match the date range
        bloodSugarParams = {
          patient_id: patientId || undefined,
          filter_by: 'reading_time',
          start_date: dateRange.start,
          end_date: dateRange.end
        };

        console.log(`Fetching data from ${dateRange.start} to ${dateRange.end}`);
      }

      // Fetch activity data with updated params
      const activityResponse = await axios.get(
        'http://localhost:5000/api/activity-history',
        {
          params: activityParams,
          headers
        }
      );

      // Fetch blood sugar data with the matching time window
      const bloodSugarResponse = await axios.get(
        'http://localhost:5000/api/blood-sugar',
        { params: bloodSugarParams, headers }
      );

      const activityLogs = activityResponse.data || [];
      const bloodSugarReadings = bloodSugarResponse.data || [];

      console.log(`Received ${activityLogs.length} activity records`);
      console.log(`Received ${bloodSugarReadings.length} blood sugar records`);


      // Process activity data
      const processedActivityData = activityLogs.map(activity => {
        let startTime, endTime;

        // Try to get the most accurate times from the activity data
        if (activity.startTime) {
          startTime = moment.utc(activity.startTime).local();
        } else if (activity.expectedTime) {
          startTime = moment.utc(activity.expectedTime).local();
        } else if (activity.completedTime) {
          startTime = moment.utc(activity.completedTime).local();
        } else {
          startTime = moment.utc(activity.timestamp).local();
        }

        // Set end time based on duration or endTime field
        if (activity.endTime) {
          endTime = moment.utc(activity.endTime).local();
        } else if (activity.duration) {
          // Parse duration in format "HH:MM"
          const [hours, minutes] = activity.duration.split(':').map(Number);
          endTime = moment(startTime).add(hours, 'hours').add(minutes, 'minutes');
        } else {
          // Default 30 minute activity
          endTime = moment(startTime).add(30, 'minutes');
        }

        return {
          id: activity._id || `activity-${startTime.valueOf()}`,
          activityType: activity.type || 'unknown',
          level: activity.level || 0,
          startTime: startTime.valueOf(),
          endTime: endTime.valueOf(),
          duration: activity.duration || '00:30',
          formattedStartTime: startTime.format('MM/DD/YYYY, HH:mm'),
          formattedEndTime: endTime.format('MM/DD/YYYY, HH:mm'),
          impact: activity.impact || 1.0,
          notes: activity.notes || ''
        };
      });

      console.log(`Processed ${processedActivityData.length} activities`);

      // Process blood sugar data - Use bloodSugarTimestamp field when available
      const processedBloodSugarData = bloodSugarReadings.map(reading => {
        // Prefer the actual reading time over record creation time when available
        const readingTime = moment.utc(reading.bloodSugarTimestamp || reading.timestamp).local();

        return {
          id: reading._id,
          bloodSugar: reading.bloodSugar,
          readingTime: readingTime.valueOf(),
          formattedTime: readingTime.format('MM/DD/YYYY, HH:mm'),
          status: reading.status,
          notes: reading.notes || ''
        };
      });

      console.log(`Processed ${processedBloodSugarData.length} blood sugar readings`);

      // Get unique activity levels
      const levels = [...new Set(processedActivityData.map(item => String(item.level)))];
      console.log(`Found activity levels: ${levels.join(', ')}`);

      setActivityData(processedActivityData);
      setBloodSugarData(processedBloodSugarData);
      setActivityLevels(levels);

      // Initialize selected levels if needed
      if (selectedActivityLevels.length === 0 && levels.length > 0) {
        setSelectedActivityLevels(levels);
      }

    } catch (err) {
      console.error('Error fetching activity data:', err);
      setError('Failed to load activity data. Please try again.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  fetchData();
}, [dateRange, refreshKey, patientId]);

  // Generate combined timeline data whenever activity or blood sugar data changes
  useEffect(() => {
    if (constantsLoading || !patientConstants?.activity_coefficients || activityData.length === 0) {
      return;
    }

    console.log("Generating combined timeline data");

    // Find earliest and latest timestamps
    const allTimestamps = [
      ...activityData.map(d => d.startTime),
      ...activityData.map(d => d.endTime),
      ...bloodSugarData.map(d => d.readingTime)
    ];

    if (allTimestamps.length === 0) {
      setCombinedData([]);
      return;
    }

    const minTime = Math.min(...allTimestamps);
    let maxTime = Math.max(...allTimestamps);

    // Extend maxTime by adding futureHours to current time
    const now = Date.now();
    const futureTime = now + (futureHours * 60 * 60 * 1000);
    maxTime = Math.max(maxTime, futureTime); // Use whichever is later

    console.log(`Timeline from ${moment(minTime).format('MM/DD/YYYY, HH:mm')} to ${moment(maxTime).format('MM/DD/YYYY, HH:mm')}`);
    console.log(`Including future projection of ${futureHours} hours`);

    // Get the average blood sugar as a baseline
    let baselineBloodSugar = 100; // Default
    if (bloodSugarData.length > 0) {
      baselineBloodSugar = bloodSugarData.reduce((sum, reading) =>
        sum + reading.bloodSugar, 0) / bloodSugarData.length;
      console.log(`Using baseline blood sugar: ${baselineBloodSugar.toFixed(0)} mg/dL`);
    }

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
        totalActivityEffect: 0
      };

      // Add blood sugar reading if available at this time
      const closestBloodSugar = bloodSugarData.find(bs =>
        Math.abs(bs.readingTime - currentTime) < 15 * 60 * 1000 // Within 15 minutes
      );

      if (closestBloodSugar) {
        timePoint.bloodSugar = closestBloodSugar.bloodSugar;
        timePoint.bloodSugarStatus = closestBloodSugar.status;
        timePoint.bloodSugarNotes = closestBloodSugar.notes;
      }

      // Record active activities at this time
      activityData.forEach(activity => {
        // Only process activities in selected levels
        if (!selectedActivityLevels.includes(String(activity.level))) return;

        // Check if the activity is active at this time point
        if (currentTime >= activity.startTime && currentTime <= activity.endTime) {
          const levelKey = String(activity.level);
          // Record activity by level (stack similar activities)
          if (!timePoint.activeActivities[levelKey]) {
            timePoint.activeActivities[levelKey] = 0;
          }
          timePoint.activeActivities[levelKey] += 1;
        }

        // Calculate effect from this activity at the current time
        const hoursSinceStart = (currentTime - activity.startTime) / (60 * 60 * 1000);

        // Calculate expected effect on blood sugar using our model
        const effect = calculateActivityEffect(
          hoursSinceStart,
          activity.duration,
          activity.level,
          baselineBloodSugar
        );

        // Record effect by activity level
        if (effect !== 0) {
          const levelKey = String(activity.level);
          if (!timePoint.activityEffects[levelKey]) {
            timePoint.activityEffects[levelKey] = 0;
          }
          timePoint.activityEffects[levelKey] += effect;
          timePoint.totalActivityEffect += effect;
        }
      });

      // Add expected blood sugar based on activity effects
      // Find the closest actual reading before this time point
      if (showExpectedEffect) {
        const previousReadings = bloodSugarData.filter(bs => bs.readingTime <= currentTime);

        if (previousReadings.length > 0) {
          // Sort by time (descending) and get the most recent
          previousReadings.sort((a, b) => b.readingTime - a.readingTime);
          const lastReading = previousReadings[0];

          // Calculate hours since last reading
          const hoursSinceReading = (currentTime - lastReading.readingTime) / (60 * 60 * 1000);

          // Only project forward for a reasonable time (extended to match future projection)
          if (hoursSinceReading <= futureHours + 4) {
            // Start with the last actual reading and apply the activity effect
            timePoint.expectedBloodSugar = lastReading.bloodSugar + timePoint.totalActivityEffect;
          }
        }
      }

      timelineData.push(timePoint);
      currentTime += interval;
    }

    console.log(`Generated timeline with ${timelineData.length} data points`);
    setCombinedData(timelineData);

  }, [activityData, bloodSugarData, patientConstants, constantsLoading, selectedActivityLevels, showExpectedEffect, calculateActivityEffect, futureHours]);

  // Table columns definition
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
      accessor: 'duration',
      Cell: ({ value }) => value || '00:30'
    },
    {
      Header: 'Activity Type',
      accessor: 'activityType',
      Cell: ({ value }) => value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    },
    {
      Header: 'Activity Level',
      accessor: 'level',
      Cell: ({ value }) => activityLevelLabels[value] || 'Normal Activity'
    },
    {
      Header: 'Impact',
      accessor: 'impact',
      Cell: ({ value }) => {
        const percent = ((1 - value) * 100).toFixed(0);
        return percent === '0' ? 'No Impact' : `${Math.abs(percent)}% ${value < 1 ? 'Decrease' : 'Increase'}`;
      }
    },
    {
      Header: 'Notes',
      accessor: 'notes',
      Cell: ({ value }) => value || 'No notes'
    }
  ], []);

  // Filter activity data by selected levels
  const filteredActivityData = useMemo(() => {
    return activityData.filter(item => selectedActivityLevels.includes(String(item.level)));
  }, [activityData, selectedActivityLevels]);

  // Set up the table
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

  // Event handlers
  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value, exactHours: false }));
  };

  const handleActivityLevelToggle = (level) => {
    setSelectedActivityLevels(prev => {
      if (prev.includes(level)) {
        return prev.filter(l => l !== level);
      } else {
        return [...prev, level];
      }
    });
  };

  // Format X-axis labels
  const formatXAxis = useCallback((tickItem) => {
    return moment(tickItem).format('MM/DD HH:mm');
  }, []);

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="activity-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

          {/* Display active activities */}
          {Object.entries(data.activeActivities).length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Active Activities:</p>
              {Object.entries(data.activeActivities).map(([level, count], idx) => (
                <p key={idx} className="tooltip-activity">
                  {activityLevelLabels[level]}: {count} {count > 1 ? 'activities' : 'activity'}
                </p>
              ))}
            </div>
          )}

          {/* Display activity effect on blood sugar */}
          {data.totalActivityEffect !== 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar Effect:</p>
              <p className="tooltip-effect">
                Total: {data.totalActivityEffect > 0 ? '+' : ''}{data.totalActivityEffect.toFixed(1)} mg/dL
              </p>
              {Object.entries(data.activityEffects).map(([level, effect], idx) => (
                effect !== 0 && (
                  <p key={idx} className="tooltip-effect-detail">
                    {activityLevelLabels[level]}: {effect > 0 ? '+' : ''}{effect.toFixed(1)} mg/dL
                  </p>
                )
              ))}
            </div>
          )}

          {/* Display blood sugar readings */}
          {data.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar:</p>
              <p className="tooltip-blood-sugar">
                Actual: {data.bloodSugar} mg/dL
                {data.bloodSugarStatus && ` (${data.bloodSugarStatus})`}
              </p>
              {data.expectedBloodSugar && (
                <p className="tooltip-blood-sugar">
                  Expected: {data.expectedBloodSugar.toFixed(0)} mg/dL
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  }, []);

  // Current date for calendar inputs
  const currentDate = new Date();
  const maxDate = currentDate.toISOString().split('T')[0]; // Today as max date

  // Determine which Y-axis ID to use for the current time reference line
  const currentTimeYAxisId = useMemo(() => {
    if (showActualBloodSugar) return "bloodSugar";
    return "activityCount";
  }, [showActualBloodSugar]);

  return (
    <div className="activity-visualization">
      <h2 className="title">Activity Impact Analysis</h2>

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
            Blood Sugar Effect
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
                max={maxDate}
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
                max={maxDate}
            />
          </div>
          <div className="date-filter-info">
            <small>
              Date filters apply to activity start times and blood sugar reading times.
              {dateRange.exactHours
                  ? " Using precise timestamps in your local time zone."
                  : " Using full calendar days in your local time zone."}
            </small>
          </div>
          <button
              className="refresh-btn"
              onClick={handleRefresh}
              disabled={isRefreshing}
          >
            <FaSync className={isRefreshing ? "spin" : ""}/> {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="quick-ranges">
          <button onClick={() => applyDatePreset(1)}>Last 24h</button>
          <button onClick={() => applyDatePreset(3)}>Last 3 Days</button>
          <button onClick={() => applyDatePreset(7)}>Last Week</button>
          <button onClick={() => applyDatePreset(14)}>Last 2 Weeks</button>
          <button onClick={() => applyDatePreset(30)}>Last Month</button>
        </div>

        <div className="activity-level-filters">
          <div className="filter-header">Activity Levels:</div>
          <div className="filter-options">
            {Object.entries(activityLevelLabels).map(([level, label]) => (
              <label
                key={`level-${level}`}
                className="filter-option"
                style={{ borderLeft: `4px solid ${activityColors[level] || '#ccc'}`}}
              >
                <input
                  type="checkbox"
                  checked={selectedActivityLevels.includes(level)}
                  onChange={() => handleActivityLevelToggle(level)}
                />
                {label}
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
              checked={showExpectedEffect}
              onChange={() => setShowExpectedEffect(!showExpectedEffect)}
            />
            Show Expected Effect
          </label>

          {/* Future projection control */}
          <div className="future-projection">
            <label>Future Projection:</label>
            <div className="projection-control">
              <input
                type="range"
                min="0"
                max="24"
                step="1"
                value={futureHours}
                onChange={(e) => setFutureHours(parseInt(e.target.value))}
              />
              <span className="hours-display">{futureHours} hours</span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading || constantsLoading ? (
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
                    domain={['dataMin', 'dataMax']}
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
                      domain={['dataMin - 10', 'dataMax + 10']}
                      label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
                    />
                  )}

                  {/* Y-axis for activity counts */}
                  {(viewMode === 'combined' || viewMode === 'activities') && (
                    <YAxis
                      yAxisId="activityCount"
                      orientation="right"
                      allowDecimals={false}
                      domain={[0, 'auto']}
                      label={{
                        value: 'Active Activities',
                        angle: -90,
                        position: 'insideRight'
                      }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Reference line for normal blood sugar range */}
                  {showActualBloodSugar && patientConstants?.target_glucose && (
                    <ReferenceLine
                      yAxisId="bloodSugar"
                      y={patientConstants.target_glucose}
                      stroke="#666"
                      strokeDasharray="3 3"
                      label={{
                        position: 'insideBottomRight',
                        value: 'Target',
                        fill: '#666',
                        fontSize: 12
                      }}
                    />
                  )}

                  {/* Blood Sugar Line - Actual */}
                  {showActualBloodSugar && (
                    <Line
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="bloodSugar"
                      name="Actual Blood Sugar"
                      stroke="#8884d8"
                      dot={{ r: 4 }}
                      activeDot={{ r: 8 }}
                      connectNulls
                    />
                  )}

                  {/* Blood Sugar Line - Expected with activity effect */}
                  {showActualBloodSugar && showExpectedEffect && (
                    <Line
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="expectedBloodSugar"
                      name="Expected Blood Sugar"
                      stroke="#82ca9d"
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={{ r: 6 }}
                      connectNulls
                    />
                  )}

                  {/* Activity Bars */}
                  {(viewMode === 'combined' || viewMode === 'activities') && selectedActivityLevels.map((level) => (
                    <Bar
                      key={`activity-${level}`}
                      yAxisId="activityCount"
                      dataKey={`activeActivities.${level}`}
                      name={activityLevelLabels[level]}
                      fill={activityColors[level] || '#ccc'}
                      barSize={20}
                      stackId="activities"
                    />
                  ))}

                  {/* Activity Effect Area */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
                    <Area
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="totalActivityEffect"
                      name="Activity Impact on Blood Sugar"
                      fill="rgba(130, 202, 157, 0.5)"
                      stroke="none"
                      fillOpacity={0.3}
                      connectNulls
                      baseLine={0}
                    />
                  )}
{/* Activity Effect Peak Markers */}
{(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
  <Line
    yAxisId="bloodSugar"
    type="monotone"
    dataKey="totalActivityEffect"
    name="Activity Effect Peak"
    stroke="rgba(43, 150, 100, 0.9)"
    strokeWidth={2}
    dot={(props) => {
      const { cx, cy, payload } = props;
      // Only show dots for significant effects (>5 points)
      return Math.abs(payload.totalActivityEffect) > 5 ? (
        <circle
          cx={cx}
          cy={cy}
          r={4}
          fill="rgba(43, 150, 100, 0.9)"
          stroke="#fff"
          strokeWidth={1}
        />
      ) : null;
    }}
    activeDot={{ r: 8, fill: "rgba(43, 150, 100, 0.9)", stroke: "#fff", strokeWidth: 2 }}
    isAnimationActive={false}
  />
)}
                  {/* Reference line for current time - FIXED with yAxisId */}
                  <ReferenceLine
                    x={Date.now()}
                    yAxisId={currentTimeYAxisId}
                    stroke="#ff0000"
                    label={{
                      value: "Now",
                      position: "top",
                      fill: "#ff0000"
                    }}
                    strokeWidth={2}
                  />
                </ComposedChart>
              </ResponsiveContainer>

              <div className="chart-legend">
                <h4>Activity Level Impact on Blood Sugar</h4>
                <div className="activity-levels-grid">
                  {Object.entries(activityLevelLabels).map(([level, label]) => {
                    if (!patientConstants?.activity_coefficients?.[level]) return null;

                    // Calculate effect for this activity level
                    const coefficient = patientConstants.activity_coefficients[level];
                    const percentChange = ((1 - coefficient) * 100).toFixed(0);
                    const effect = coefficient < 1 ? "Decreases" : coefficient > 1 ? "Increases" : "No effect on";

                    return (
                        <div key={`legend-${level}`} className="activity-level-details">
                          <div className="activity-level-header">
                          <span
                              className="activity-color-box"
                              style={{backgroundColor: activityColors[level] || '#ccc'}}
                          ></span>
                            <span className="activity-level-name">{label}</span>
                          </div>
                          <div className="activity-impact">
                            <span>{effect} blood sugar by {Math.abs(percentChange)}%</span>
                            <span>Coefficient: {coefficient}</span>
                          </div>
                        </div>
                    );
                  })}
                </div>

                <div className="impact-explanation">
                  <h5>How Activity Affects Blood Sugar</h5>
                  <ul>
                    <li><strong>During activity:</strong> Blood sugar decreases as muscles use glucose for energy</li>
                    <li><strong>After activity:</strong> Enhanced insulin sensitivity can continue to lower blood sugar
                      for hours
                    </li>
                    <li><strong>Effect intensity:</strong> Higher activity levels cause greater blood sugar reduction
                    </li>
                    <li><strong>Duration impact:</strong> Longer activities have more pronounced and lasting effects
                    </li>
                  </ul>
                </div>
                <div className="impact-accumulation-explanation">
                  <h5>Activity Impact Accumulation</h5>
                  <p>
                    Multiple activities can have a compound effect on blood sugar levels. The system calculates:
                  </p>
                  <ul>
                    <li><strong>Simultaneous activities:</strong> Effects stack with diminishing returns (prevents
                      unrealistic predictions)
                    </li>
                    <li><strong>Sequential activities:</strong> Extended impact from earlier activities combines with
                      new ones
                    </li>
                    <li><strong>Recovery periods:</strong> Blood sugar gradually returns to baseline after activities
                    </li>
                  </ul>
                  {bloodSugarData.length > 0 && (
                      <div className="baseline-info">
                        <strong>Your baseline blood sugar:</strong> {
                        (bloodSugarData.reduce((sum, r) => sum + r.bloodSugar, 0) / bloodSugarData.length).toFixed(0)
                      } mg/dL (average during selected period)
                      </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
              <div className="table-container">
                <table {...getTableProps()} className="activity-table">
                  <thead>
                  {headerGroups.map((headerGroup, i) => (
                      <tr key={`header-group-${i}`} {...headerGroup.getHeaderGroupProps()}>
                        {headerGroup.headers.map((column, j) => (
                            <th key={`header-${i}-${j}`} {...column.getHeaderProps(column.getSortByToggleProps())}>
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
                  {page.map((row, i) => {
                    prepareRow(row);
                    return (
                      <tr
                        key={`row-${i}`}
                        {...row.getRowProps()}
                        style={{
                          borderLeft: `4px solid ${activityColors[row.original.level] || '#ccc'}`
                        }}
                      >
                        {row.cells.map((cell, j) => (
                          <td key={`cell-${i}-${j}`} {...cell.getCellProps()}>
                            {cell.render('Cell')}
                          </td>
                        ))}
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