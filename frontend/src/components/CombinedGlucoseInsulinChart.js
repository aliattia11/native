import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
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
import TimeManager from '../utils/TimeManager';
import TimeContext from '../contexts/TimeContext';
import TimeInput from '../components/TimeInput';
import './CombinedGlucoseInsulinChart.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Chart rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="error-boundary">
        <h3>Chart Rendering Error</h3>
        <p>There was a problem displaying the chart. Try reducing the date range or refreshing the page.</p>
        <button onClick={() => this.setState({ hasError: false })}>Try Again</button>
      </div>;
    }
    return this.props.children;
  }
}

const CombinedGlucoseInsulinChart = ({ isDoctor = false, patientId = null }) => {
  // Use TimeContext for date range management
  const timeContext = useContext(TimeContext);

  // Use constants context for patient-specific insulin parameters
  const { patientConstants } = useConstants();

  // Use blood sugar data from the shared context
  const {
    filteredData: bloodSugarData,
    combinedData: allBloodSugarData,
    filteredEstimatedReadings,
    targetGlucose,
    dateRange,
    setDateRange,
    applyInsulinEffect,
    timeScale,
    unit,
    getBloodSugarStatus,
    systemDateTime,
    currentUserLogin
  } = useBloodSugarData();

  // State management
  const [insulinData, setInsulinData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [optimizedData, setOptimizedData] = useState([]);
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showActualBloodSugar, setShowActualBloodSugar] = useState(true);
  const [showExpectedEffect, setShowExpectedEffect] = useState(true);
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [viewMode, setViewMode] = useState('combined'); // 'combined', 'doses', or 'effect'
  const [userTimeZone, setUserTimeZone] = useState('');
  const [dataFetched, setDataFetched] = useState(false);
  const [includeFutureEffect, setIncludeFutureEffect] = useState(true);
  const [futureHours, setFutureHours] = useState(7); // Hours to project into future
  const [showSystemInfo, setShowSystemInfo] = useState(true);
  const [isFetching, setIsFetching] = useState(false); // Track when update is in progress
  const [showDetailedInsulinInfo, setShowDetailedInsulinInfo] = useState(false); // For collapsible legends
  const [dataPointCount, setDataPointCount] = useState(0);

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Helper function to get insulin parameters from patient constants
  const getInsulinParameters = useCallback((insulinType) => {
    // Default parameters as fallback
    const defaultParams = {
      onset_hours: 0.5,
      peak_hours: 2,
      duration_hours: 5,
      type: 'short_acting'
    };

    // Get medication factors from patient constants
    const medicationFactors = patientConstants?.medication_factors || {};

    // Return patient-specific parameters if available, otherwise use defaults
    return medicationFactors[insulinType] || defaultParams;
  }, [patientConstants]);

  // Calculate insulin effect at a given time point
  const calculateInsulinEffect = useCallback((hoursSinceDose, dose, onsetHours, peakHours, durationHours) => {
    // Return 0 if outside the duration window
    if (hoursSinceDose < 0 || hoursSinceDose > durationHours) {
      return 0;
    }

    // For "peakless" insulins like glargine or detemir
    if (peakHours === null) {
      // Simple flat effect after onset
      if (hoursSinceDose < onsetHours) {
        return dose * (hoursSinceDose / onsetHours) * 0.5;
      } else {
        return dose * 0.5 * (1 - ((hoursSinceDose - onsetHours) / (durationHours - onsetHours)));
      }
    }

    // For insulins with a peak (calculate using a triangular model)
    let effect = 0;

    // Rising phase (onset to peak)
    if (hoursSinceDose < peakHours) {
      if (hoursSinceDose < onsetHours) {
        effect = dose * (hoursSinceDose / onsetHours) * (peakHours / durationHours);
      } else {
        effect = dose * (hoursSinceDose / peakHours);
      }
    }
    // Falling phase (peak to end)
    else {
      effect = dose * (1 - ((hoursSinceDose - peakHours) / (durationHours - peakHours)));
    }

    return Math.max(0, effect);
  }, []);

  // SIMPLIFIED function to create bidirectional values for chart
  const getBidirectionalValue = useCallback((value) => {
    if (!value || value === 0) return null;
    return -Math.abs(value); // Just make it negative for downward chart
  }, []);

  // OPTIMIZED data generation for timeline visualization
  const generateCombinedData = useCallback((insulinData, bloodGlucoseData) => {
    try {
      // Find the earliest and latest timestamps, including future projections if enabled
      let allTimestamps = [
        ...insulinData.map(d => d.administrationTime),
        ...bloodGlucoseData.map(d => d.readingTime)
      ].filter(Boolean);

      if (allTimestamps.length === 0) {
        console.log("No timestamps found in data");
        return [];
      }

      const minTime = Math.min(...allTimestamps);
      let maxTime = Math.max(...allTimestamps);

      // If including future effects, extend the timeline by the specified number of hours
      if (includeFutureEffect) {
        const futureTime = moment().add(futureHours, 'hours').valueOf();
        maxTime = Math.max(maxTime, futureTime);
      }

      console.log(`Generating data from ${new Date(minTime).toISOString()} to ${new Date(maxTime).toISOString()}`);

      // OPTIMIZATION: Choose appropriate interval based on time range
      let interval = 15 * 60 * 1000; // Default: 15 minutes
      const rangeInDays = (maxTime - minTime) / (24 * 60 * 60 * 1000);

      if (rangeInDays > 14) {
        interval = 60 * 60 * 1000; // 1 hour for more than 2 weeks
      }
      if (rangeInDays > 30) {
        interval = 3 * 60 * 60 * 1000; // 3 hours for more than a month
      }

      console.log(`Using interval of ${interval / (60 * 1000)} minutes for ${rangeInDays.toFixed(1)} day range`);

      // Generate timeline with adaptive intervals
      const timelineData = [];
      let currentTime = minTime;
      let pointCount = 0;

      // Set a reasonable maximum data points to prevent browser crashes
      const MAX_DATA_POINTS = 2000;

      while (currentTime <= maxTime && pointCount < MAX_DATA_POINTS) {
        pointCount++;
        const timePoint = {
          timestamp: currentTime,
          formattedTime: TimeManager.formatDate(currentTime, TimeManager.formats.DATETIME_DISPLAY),
          insulinDoses: {},
          insulinBars: {}, // Simplified key for bar chart
          insulinEffects: {},
          insulinEffectValues: {}, // Simplified key for effect lines
          totalInsulinEffect: 0,
          totalInsulinEffectValue: 0 // Simplified key for effect area
        };

        // Add blood sugar reading if available at this time
        const searchTime = currentTime;
        const closestBloodSugar = bloodGlucoseData.find(bs =>
          Math.abs(bs.readingTime - searchTime) < interval / 2 // Within half the interval
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.predictedBloodSugar = closestBloodSugar.predictedBloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes;
          timePoint.isActualReading = closestBloodSugar.isActualReading;
          timePoint.isEstimated = closestBloodSugar.isInterpolated || closestBloodSugar.isEstimated;
          timePoint.dataType = closestBloodSugar.dataType;
        }

        // Calculate insulin doses and effects at this time
        const thisMoment = currentTime;
        insulinData.forEach(dose => {
          // Record doses given at this time
          if (Math.abs(dose.administrationTime - thisMoment) < interval / 2) {
            const key = dose.medication;
            timePoint.insulinDoses[key] = (timePoint.insulinDoses[key] || 0) + dose.dose;

            // Create DIRECT negative value for the bar chart
            timePoint.insulinBars[key] = getBidirectionalValue((timePoint.insulinDoses[key]));

            // Debug for insulin doses
            if (timePoint.insulinDoses[key] > 0) {
              console.log(`Found insulin dose: ${timePoint.insulinDoses[key]} units of ${key} at ${timePoint.formattedTime}`);
              console.log(`Bar value: ${timePoint.insulinBars[key]}`);
            }
          }

          // Calculate expected effect from each previous dose at current time
          const hoursSinceDose = (thisMoment - dose.administrationTime) / (60 * 60 * 1000);

          // Calculate effects for all doses (past and future projections)
          if (hoursSinceDose >= 0 || includeFutureEffect) {
            // Fetch insulin parameters
            const insulinParams = getInsulinParameters(dose.medication);

            // Calculate effect using insulin action curve
            const effect = calculateInsulinEffect(
              hoursSinceDose,
              dose.dose,
              insulinParams.onset_hours,
              insulinParams.peak_hours,
              insulinParams.duration_hours
            );

            if (effect > 0) {
              const key = dose.medication;
              timePoint.insulinEffects[key] = (timePoint.insulinEffects[key] || 0) + effect;
              timePoint.totalInsulinEffect += effect;

              // Create DIRECT negative values for effect visualization
              timePoint.insulinEffectValues[key] = getBidirectionalValue(timePoint.insulinEffects[key]);
              timePoint.totalInsulinEffectValue = getBidirectionalValue(timePoint.totalInsulinEffect);
            }
          }
        });

        timelineData.push(timePoint);
        currentTime += interval;
      }

      console.log(`Generated ${timelineData.length} data points`);
      setDataPointCount(timelineData.length);

      // Find points with insulin doses for debugging
      const pointsWithDoses = timelineData.filter(point =>
        Object.values(point.insulinDoses).some(dose => dose > 0)
      );

      console.log(`Found ${pointsWithDoses.length} points with insulin doses`);
      if (pointsWithDoses.length > 0) {
        console.log("Sample point with dose:", pointsWithDoses[0]);
      }

      return timelineData;
    } catch (error) {
      console.error('Error generating combined data:', error);
      return [];
    }
  }, [calculateInsulinEffect, getInsulinParameters, includeFutureEffect, futureHours, getBidirectionalValue]);

  // Data optimization function to handle large datasets
  const optimizeDataForChart = useCallback((data) => {
    if (!data || data.length === 0) return [];

    // For very large datasets, we need to sample data
    if (data.length > 1000) {
      console.log(`Optimizing large dataset with ${data.length} points`);

      // Always include points with insulin doses
      const pointsWithDoses = data.filter(point =>
        Object.values(point.insulinDoses).some(dose => dose > 0)
      );

      // Always include actual blood sugar readings
      const actualReadings = data.filter(point =>
        point.isActualReading && !point.isEstimated
      );

      // Sample the rest based on resolution needs
      const samplingRate = Math.ceil(data.length / 800); // Aim for ~800 points

      // Get regular interval samples
      const sampledPoints = data.filter((_, index) => index % samplingRate === 0);

      // Combine all points and remove duplicates
      const uniqueTimestamps = new Set();
      const optimized = [...pointsWithDoses, ...actualReadings, ...sampledPoints]
        .filter(point => {
          if (uniqueTimestamps.has(point.timestamp)) {
            return false;
          }
          uniqueTimestamps.add(point.timestamp);
          return true;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      console.log(`Optimized to ${optimized.length} points (kept ${pointsWithDoses.length} doses)`);
      return optimized;
    }

    return data;
  }, []);

  // Fetch insulin data
  const fetchInsulinData = useCallback(async () => {
    try {
      setIsFetching(true);
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Calculate the date range including future hours
      const endDate = moment(dateRange.end).add(includeFutureEffect ? futureHours : 0, 'hours').format('YYYY-MM-DD');

      console.log(`Fetching insulin data from ${dateRange.start} to ${endDate}`);

      // Use the correct endpoint for comprehensive insulin data
      const insulinResponse = await axios.get(
        `http://localhost:5000/api/insulin-data?days=30&end_date=${endDate}${patientId ? `&patient_id=${patientId}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Process insulin data from the comprehensive endpoint
      const insulinLogs = insulinResponse.data.insulin_logs || [];
      console.log(`Received ${insulinLogs.length} insulin logs`);

      // Extract unique insulin types
      const types = [...new Set(insulinLogs.map(log => log.medication))];
      setInsulinTypes(types);
      console.log(`Found insulin types: ${types.join(', ')}`);

      // Only set selectedInsulinTypes if it's empty and we have types
      if (selectedInsulinTypes.length === 0 && types.length > 0) {
        setSelectedInsulinTypes(types);
      }

      // Process and enhance insulin data
      const processedInsulinData = insulinLogs.map(log => {
        // Parse administration time
        const adminTime = moment(log.taken_at).valueOf();

        return {
          id: log.id || `insulin-${adminTime}`,
          medication: log.medication,
          dose: log.dose,
          administrationTime: adminTime,
          formattedTime: TimeManager.formatDate(adminTime, TimeManager.formats.DATETIME_DISPLAY),
          notes: log.notes || '',
          mealType: log.meal_type || 'N/A',
          bloodSugar: log.blood_sugar,
          suggestedDose: log.suggested_dose,
          pharmacokinetics: log.pharmacokinetics || getInsulinParameters(log.medication)
        };
      });

      // Filter insulin data based on date range
      const startDate = moment(dateRange.start).startOf('day').valueOf();
      const filteredInsulinData = processedInsulinData.filter(insulin => {
        return insulin.administrationTime >= startDate;
      });

      console.log(`Filtered to ${filteredInsulinData.length} insulin records in date range`);
      setInsulinData(filteredInsulinData);

      // Generate combined data using the bloodSugarData from context with insulin effects applied
      let processedData;
      if (allBloodSugarData && allBloodSugarData.length > 0) {
        console.log("Using blood sugar data from context:", allBloodSugarData.length, "readings");
        processedData = applyInsulinEffect(filteredInsulinData, allBloodSugarData);
      } else {
        console.log("No blood sugar data available in context");
        processedData = [];
      }

      // Generate timeline data
      const combinedResult = generateCombinedData(filteredInsulinData, processedData);
      setCombinedData(combinedResult);

      // Optimize data for chart rendering
      const optimizedResult = optimizeDataForChart(combinedResult);
      setOptimizedData(optimizedResult);

      setError('');
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching insulin data:', error);
      setError('Failed to load insulin data. Please try again.');
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [dateRange, includeFutureEffect, futureHours, patientId, selectedInsulinTypes.length,
      getInsulinParameters, allBloodSugarData, applyInsulinEffect, generateCombinedData,
      optimizeDataForChart]);

  // Add this useEffect to trigger a re-render when blood sugar data changes
  useEffect(() => {
    if (dataFetched && allBloodSugarData && allBloodSugarData.length > 0) {
      // Regenerate combined data with the latest blood sugar data
      const processedData = applyInsulinEffect(insulinData, allBloodSugarData);
      const combinedResult = generateCombinedData(insulinData, processedData);
      setCombinedData(combinedResult);

      // Optimize data for chart rendering
      const optimizedResult = optimizeDataForChart(combinedResult);
      setOptimizedData(optimizedResult);
    }
  }, [allBloodSugarData, applyInsulinEffect, dataFetched, generateCombinedData, insulinData, optimizeDataForChart]);

  // Effect to fetch data when component mounts
  useEffect(() => {
    // Always fetch data on component mount or when date range changes
    fetchInsulinData();
  }, [fetchInsulinData]);

  // Filter function for insulin types
  const handleInsulinTypeToggle = useCallback((insulinType) => {
    setSelectedInsulinTypes(prev => {
      if (prev.includes(insulinType)) {
        return prev.filter(type => type !== insulinType);
      } else {
        return [...prev, insulinType];
      }
    });
  }, []);

  // Date range change handler - Uses TimeContext when available
  const handleDateRangeChange = useCallback((newRange) => {
    if (timeContext) {
      timeContext.setDateRange(newRange);
    } else {
      setDateRange(newRange);
    }
  }, [timeContext, setDateRange]);

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="insulin-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

          {/* Display insulin doses */}
          {Object.entries(data.insulinDoses || {}).length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Insulin Doses:</p>
              {Object.entries(data.insulinDoses || {}).map(([type, dose], idx) => (
                dose > 0 && (
                  <p key={idx} className="tooltip-dose">
                    {type.replace(/_/g, ' ')} - {dose} units
                  </p>
                )
              ))}
            </div>
          )}

          {/* Display insulin active effect */}
          {data.totalInsulinEffect > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Active Insulin Effect:</p>
              <p className="tooltip-effect">Total: {data.totalInsulinEffect.toFixed(2)} units</p>
              {Object.entries(data.insulinEffects || {}).map(([type, effect], idx) => (
                effect > 0 && (
                  <p key={idx} className="tooltip-effect-detail">
                    {type.replace(/_/g, ' ')}: {effect.toFixed(2)} units
                  </p>
                )
              ))}
            </div>
          )}

          {/* Display blood sugar if available */}
          {data.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar:</p>
              <p className="tooltip-blood-sugar">
                {data.bloodSugar} {unit}
                {data.bloodSugarStatus && ` (${data.bloodSugarStatus.label})`}
                {data.isEstimated && ' - Estimated'}
                {data.isActualReading && ' - Actual Reading'}
              </p>
              {data.predictedBloodSugar && (
                <p className="tooltip-blood-sugar predicted">
                  Predicted with insulin: {Math.round(data.predictedBloodSugar * 10) / 10} {unit}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  }, [unit]);

  // Table columns definition using useMemo to prevent recreating on each render
  const columns = useMemo(() => [
    {
      Header: 'Time',
      accessor: 'formattedTime',
      sortType: (a, b) => {
        return a.original.administrationTime - b.original.administrationTime;
      }
    },
    {
      Header: 'Insulin Type',
      accessor: 'medication',
      Cell: ({ value }) => value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    },
    {
      Header: 'Dose (units)',
      accessor: 'dose'
    },
    {
      Header: 'Blood Sugar',
      accessor: 'bloodSugar',
      Cell: ({ value }) => value ? `${value} ${unit}` : 'N/A'
    },
    {
      Header: 'Suggested Dose',
      accessor: 'suggestedDose',
      Cell: ({ value }) => value ? `${value} units` : 'N/A'
    },
    {
      Header: 'Meal Type',
      accessor: 'mealType',
      Cell: ({ value }) => value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    },
    {
      Header: 'Notes',
      accessor: 'notes',
      Cell: ({ value }) => value || 'No notes'
    }
  ], [unit]);

  // Filter the insulin data based on selectedInsulinTypes
  const filteredInsulinData = useMemo(() => {
    return insulinData.filter(item => selectedInsulinTypes.includes(item.medication));
  }, [insulinData, selectedInsulinTypes]);

  // Set up the table instance
  const tableInstance = useTable(
    {
      columns,
      data: filteredInsulinData,
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

  // Helper function to get consistent colors for insulin types
  const getInsulinColor = useCallback((insulinType, index, isEffect = false) => {
    const colors = [
      '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe',
      '#00C49F', '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57'
    ];

    if (isEffect) {
      // For effect lines, use a slightly different shade
      const baseColor = colors[index % colors.length];
      return adjustColorBrightness(baseColor, -20);
    }

    return colors[index % colors.length];
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

  // Toggle future effects projection
  const toggleFutureEffect = useCallback(() => {
    setIncludeFutureEffect(!includeFutureEffect);
  }, [includeFutureEffect]);

  // Toggle system info display
  const toggleSystemInfo = useCallback(() => {
    setShowSystemInfo(!showSystemInfo);
  }, [showSystemInfo]);

  // Force update the data
  const handleForceUpdate = useCallback(() => {
    fetchInsulinData();
  }, [fetchInsulinData]);

  // Determine which Y-axis ID to use for the current time reference line
  const currentTimeYAxisId = useMemo(() => {
    if (showActualBloodSugar) return "bloodSugar";
    if (viewMode === 'doses' || viewMode === 'combined') return "insulinDose";
    return "insulinEffect";
  }, [showActualBloodSugar, viewMode]);

  // Generate ticks for x-axis based on time scale using TimeManager
  const ticks = useMemo(() => {
    return TimeManager.generateTimeTicks(timeScale.start, timeScale.end, timeScale.tickInterval);
  }, [timeScale]);

  // Check if current time is within chart range
  const currentTimeInRange = TimeManager.isTimeInRange(
    new Date().getTime(),
    timeScale.start,
    timeScale.end
  );

  // Toggle detailed insulin info
  const toggleDetailedInsulinInfo = () => {
    setShowDetailedInsulinInfo(!showDetailedInsulinInfo);
  };

  return (
    <div className="insulin-visualization">
      <h2 className="title">Insulin Therapy Analysis</h2>

      <div className="super-compact-controls">
        <div className="top-info-bar">
          <span className="timezone-info">Your timezone: {userTimeZone}</span>
          {showSystemInfo && (
            <span className="system-info-inline">
              | Current: {systemDateTime} | User: {currentUserLogin}
              <button onClick={toggleSystemInfo} className="system-info-toggle">×</button>
            </span>
          )}
          {!showSystemInfo && (
            <button onClick={toggleSystemInfo} className="system-info-toggle show-btn">Info</button>
          )}
        </div>

        <div className="control-panel">
          <div className="main-controls">
            {/* Date range control */}
            <TimeInput
              mode="daterange"
              value={dateRange}
              onChange={handleDateRangeChange}
              useTimeContext={!!timeContext}
              label="Date Range"
              className="date-range-control"
              compact={true}
            />

            {/* View mode toggles in a compact group */}
            <div className="view-mode-group">
              <div className="toggle-group">
                <button className={`mini-btn ${activeView === 'chart' ? 'active' : ''}`} onClick={() => setActiveView('chart')}>
                  Chart
                </button>
                <button className={`mini-btn ${activeView === 'table' ? 'active' : ''}`} onClick={() => setActiveView('table')}>
                  Table
                </button>
              </div>

              {activeView === 'chart' && (
                <div className="toggle-group">
                  <button className={`mini-btn ${viewMode === 'combined' ? 'active' : ''}`} onClick={() => setViewMode('combined')}>
                    Combined
                  </button>
                  <button className={`mini-btn ${viewMode === 'doses' ? 'active' : ''}`} onClick={() => setViewMode('doses')}>
                    Doses
                  </button>
                  <button className={`mini-btn ${viewMode === 'effect' ? 'active' : ''}`} onClick={() => setViewMode('effect')}>
                    Effect
                  </button>
                </div>
              )}
            </div>

            {/* Update button */}
            <button
              className={`update-btn ${isFetching ? 'loading' : ''}`}
              onClick={handleForceUpdate}
              disabled={isFetching}
            >
              {isFetching ? 'Updating...' : 'Update'}
            </button>
          </div>

          <div className="secondary-controls">
            <div className="display-toggles">
              <label className="mini-toggle">
                <input type="checkbox" checked={showActualBloodSugar} onChange={() => setShowActualBloodSugar(!showActualBloodSugar)} />
                <span>BG</span>
              </label>
              <label className="mini-toggle">
                <input type="checkbox" checked={showExpectedEffect} onChange={() => setShowExpectedEffect(!showExpectedEffect)} />
                <span>Effect</span>
              </label>
              <label className="mini-toggle">
                <input type="checkbox" checked={includeFutureEffect} onChange={toggleFutureEffect} />
                <span>Future</span>
                {includeFutureEffect && (
                  <span className="future-hours">
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={futureHours}
                      onChange={(e) => setFutureHours(parseInt(e.target.value) || 7)}
                    />h
                  </span>
                )}
              </label>
            </div>

            <div className="insulin-types-mini">
              <span>Types:</span>
              <div className="mini-types">
                {insulinTypes.map((type, idx) => (
                  <label key={`${type}_${idx}`} className="type-label">
                    <input
                      type="checkbox"
                      checked={selectedInsulinTypes.includes(type)}
                      onChange={() => handleInsulinTypeToggle(type)}
                    />
                    <span style={{color: getInsulinColor(type, idx)}}>
                      {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Data point counter information */}
      <div className="data-info">
        <span>Displaying {optimizedData.length} data points</span>
        {optimizedData.length < combinedData.length &&
          <span className="optimization-note"> (optimized from {combinedData.length} total)</span>
        }
      </div>

      {loading ? (
        <div className="loading">Loading insulin data...</div>
      ) : optimizedData.length === 0 ? (
        <div className="no-data">No insulin data found for the selected date range.</div>
      ) : (
        <div className="content-container">
          {activeView === 'chart' && (
            <div className="chart-container">
              <ErrorBoundary>
                <ResponsiveContainer width="100%" height={500}>
                  <ComposedChart
                    data={optimizedData}
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
                        domain={['dataMin - 10', 'dataMax + 10']}
                        label={{ value: `Blood Sugar (${unit})`, angle: -90, position: 'insideLeft' }}
                      />
                    )}

                    {/* Y-axis for insulin doses - BIDIRECTIONAL - SIMPLIFIED */}
                    {(viewMode === 'combined' || viewMode === 'doses') && (
                      <YAxis
                        yAxisId="insulinDose"
                        orientation={showActualBloodSugar ? "right" : "left"}
                        domain={[-30, 0]} // Only negative domain for clearer bars
                        ticks={[-30, -25, -20, -15, -10, -5, 0]}
                        tickFormatter={(value) => Math.abs(value)} // Show positive values on ticks
                        label={{
                          value: 'Insulin Dose (units)',
                          angle: -90,
                          position: showActualBloodSugar ? 'insideRight' : 'insideLeft'
                        }}
                      />
                    )}

                    {/* Y-axis for insulin effect - BIDIRECTIONAL - SIMPLIFIED */}
                    {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
                      <YAxis
                        yAxisId="insulinEffect"
                        orientation="right"
                        domain={[-5, 0]} // Only negative domain for clearer visualization
                        ticks={[-5, -4, -3, -2, -1, 0]}
                        tickFormatter={(value) => Math.abs(value)} // Show positive values on ticks
                        label={{ value: 'Active Insulin (units)', angle: -90, position: 'insideRight' }}
                      />
                    )}

                    <Tooltip content={<CustomTooltip />} />
                    <Legend />

                    {/* Zero line for insulin dose axis */}
                    {(viewMode === 'combined' || viewMode === 'doses') && (
                      <ReferenceLine
                        y={0}
                        yAxisId="insulinDose"
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

                    {/* Blood Sugar Lines */}
                    {showActualBloodSugar && (
                      <>
                        {/* 1. Line for actual readings - dark blue */}
                        <Line
                          yAxisId="bloodSugar"
                          type="monotone"
                          dataKey="bloodSugar"
                          name={`Actual Blood Sugar (${unit})`}
                          data={optimizedData.filter(d => d.isActualReading && !d.isEstimated)}
                          stroke="#1a4b8c"
                          strokeWidth={2}
                          dot={{
                            r: 4,
                            fill: "#1a4b8c",
                            stroke: "#0c2c5c",
                            strokeWidth: 1
                          }}
                          activeDot={{
                            r: 6,
                            fill: "#1a4b8c",
                            stroke: "#fff",
                            strokeWidth: 1
                          }}
                          connectNulls={false}
                        />

                        {/* 2. Line for estimated readings - light blue */}
                        <Line
                          yAxisId="bloodSugar"
                          type="monotone"
                          dataKey="bloodSugar"
                          name={`Estimated Blood Sugar (${unit})`}
                          data={optimizedData.filter(d => d.isEstimated || d.dataType === 'estimated')}
                          stroke="#a5c0e6"
                          strokeWidth={1.5}
                          strokeOpacity={0.7}
                          dot={{
                            r: 2.5,
                            fill: "#a5c0e6",
                            stroke: "#8eb0e0",
                            strokeWidth: 1,
                            opacity: 0.7
                          }}
                          activeDot={{
                            r: 4,
                            fill: "#a5c0e6",
                            stroke: "#fff",
                            strokeWidth: 1
                          }}
                          connectNulls={false}
                        />

                        {/* 3. Line for predicted insulin effects - green dashed */}
                        <Line
                          yAxisId="bloodSugar"
                          type="monotone"
                          dataKey="predictedBloodSugar"
                          name={`Predicted with Insulin (${unit})`}
                          stroke="#00C853"
                          strokeWidth={1.5}
                          strokeOpacity={0.8}
                          strokeDasharray="5 2"
                          dot={{
                            r: 3,
                            fill: "#00C853",
                            stroke: "#005724",
                            strokeWidth: 1,
                            opacity: 0.7
                          }}
                          activeDot={{
                            r: 5,
                            stroke: "#ffffff",
                            strokeWidth: 1
                          }}
                          connectNulls={true}
                        />
                      </>
                    )}

                    {/* SIMPLIFIED Insulin Doses - More prominent bars */}
                    {(viewMode === 'combined' || viewMode === 'doses') && selectedInsulinTypes.map((insulinType, idx) => (
                      <Bar
                        key={`dose-${insulinType}-${idx}`}
                        yAxisId="insulinDose"
                        dataKey={`insulinBars.${insulinType}`} // Direct key to the bar value
                        name={`${insulinType.replace(/_/g, ' ')} Dose`}
                        fill={getInsulinColor(insulinType, idx)}
                        fillOpacity={0.9}
                        stroke={adjustColorBrightness(getInsulinColor(insulinType, idx), -30)}
                        strokeWidth={1}
                        barSize={50}  // Make bars wider
                        isAnimationActive={false} // Disable animation for performance
                      />
                    ))}

                    {/* SIMPLIFIED Insulin Effect Area */}
                    {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
                      <Area
                        yAxisId="insulinEffect"
                        type="monotone"
                        dataKey="totalInsulinEffectValue" // Direct key to effect value
                        name="Active Insulin Effect"
                        fill="#82ca9d"
                        stroke="#82ca9d"
                        fillOpacity={0.3}
                        isAnimationActive={false} // Disable animation for performance
                      />
                    )}

                    {/* SIMPLIFIED insulin effects lines */}
                    {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && selectedInsulinTypes.map((insulinType, idx) => (
                      <Line
                        key={`effect-${insulinType}-${idx}`}
                        yAxisId="insulinEffect"
                        type="monotone"
                        dataKey={`insulinEffectValues.${insulinType}`} // Direct key to effect value
                        name={`${insulinType.replace(/_/g, ' ')} Effect`}
                        stroke={getInsulinColor(insulinType, idx, true)}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                        dot={false}
                        isAnimationActive={false} // Disable animation for performance
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
              </ErrorBoundary>

              {/* Compact collapsible legend */}
              <div className="compact-legends">
                <div className="legend-section">
                  <div className="legend-header" onClick={toggleDetailedInsulinInfo}>
                    <h4>Insulin Types {showDetailedInsulinInfo ? '▼' : '►'}</h4>
                  </div>

                  {showDetailedInsulinInfo && (
                    <div className="insulin-types-grid">
                      {insulinTypes.filter(type => selectedInsulinTypes.includes(type)).map((type, idx) => {
                        const params = getInsulinParameters(type);
                        return (
                          <div key={`legend-${type}-${idx}`} className="insulin-type-compact">
                            <div className="insulin-type-header">
                              <span
                                className="insulin-color-box"
                                style={{ backgroundColor: getInsulinColor(type, idx) }}
                              ></span>
                              <span className="insulin-type-name">
                                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                            </div>
                            <div className="insulin-pharmacokinetics">
                              <span>Onset: {params.onset_hours}h</span>
                              {params.peak_hours && <span>Peak: {params.peak_hours}h</span>}
                              <span>Duration: {params.duration_hours}h</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Simple blood sugar effect legend */}
                {showActualBloodSugar && (
                  <div className="blood-sugar-legend">
                    <div className="compact-legend-items">
                      <div className="legend-item">
                        <span className="legend-color" style={{backgroundColor: '#1a4b8c'}}></span>
                        <span>Actual Readings</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color" style={{backgroundColor: '#a5c0e6'}}></span>
                        <span>Estimated Points</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-dash" style={{borderTop: '2px dashed #00C853'}}></span>
                        <span>Predicted with Insulin</span>
                      </div>
                      <div className="legend-item">
                        <span className="legend-color" style={{backgroundColor: '#FF7300'}}></span>
                        <span>Target: {targetGlucose} {unit}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bidirectional chart explanation */}
                <div className="chart-explanation">
                  <p className="explanation-note">
                    <strong>Note:</strong> Insulin doses and effects are shown below the zero line.
                    Higher values extend further downward on the chart.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
            <div className="table-container">
              <table {...getTableProps()} className="insulin-table">
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
                        No insulin data found for the selected date range.
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

export default CombinedGlucoseInsulinChart;