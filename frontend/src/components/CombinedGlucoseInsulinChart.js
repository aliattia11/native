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
import './InsulinVisualization.css';

const CombinedGlucoseInsulinChart = ({ isDoctor = false, patientId = null }) => {
  // Use constants context for patient-specific insulin parameters
  const { patientConstants } = useConstants();

  // Use blood sugar data from the shared context
  const {
    filteredData: bloodSugarData,
    combinedData: allBloodSugarData,
        filteredEstimatedReadings,  // Add this line
    targetGlucose,
    dateRange,
    setDateRange,
    applyInsulinEffect,
    timeScale,
    unit
  } = useBloodSugarData();

  // State management
  const [insulinData, setInsulinData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
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
  const [processedBloodSugarData, setProcessedBloodSugarData] = useState([]);

  // Fixed current date and time as specified
  const currentDateTime = "2025-04-22 19:22:24";
  const currentUserLogin = "aliattia02";

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

  // Generate combined data for timeline visualization
  const generateCombinedData = useCallback((insulinData, bloodGlucoseData) => {
    try {
      // Find the earliest and latest timestamps, including future projections if enabled
      let allTimestamps = [
        ...insulinData.map(d => d.administrationTime),
        ...bloodGlucoseData.map(d => d.readingTime)
      ];

      if (allTimestamps.length === 0) {
        return [];
      }

      const minTime = Math.min(...allTimestamps);
      let maxTime = Math.max(...allTimestamps);

      // If including future effects, extend the timeline by the specified number of hours
      if (includeFutureEffect) {
        const futureTime = moment().add(futureHours, 'hours').valueOf();
        maxTime = Math.max(maxTime, futureTime);
      }

      // Generate timeline with 15-minute intervals
      const timelineData = [];
      let currentTime = minTime;
      const interval = 15 * 60 * 1000; // 15 minutes in milliseconds

      while (currentTime <= maxTime) {
        const timePoint = {
          timestamp: currentTime,
          formattedTime: moment(currentTime).format('MM/DD/YYYY, HH:mm'),
          insulinDoses: {},
          insulinEffects: {},
          totalInsulinEffect: 0
        };

        // Add blood sugar reading if available at this time
        const searchTime = currentTime;
        const closestBloodSugar = bloodGlucoseData.find(bs =>
          Math.abs(bs.readingTime - searchTime) < 15 * 60 * 1000 // Within 15 minutes
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.predictedBloodSugar = closestBloodSugar.predictedBloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes;
          timePoint.isActualReading = closestBloodSugar.isActualReading;
        }

        // Calculate insulin doses and effects at this time
        const thisMoment = currentTime;
        insulinData.forEach(dose => {
          // Record doses given at this time
          if (Math.abs(dose.administrationTime - thisMoment) < 15 * 60 * 1000) { // Within 15 minutes
            timePoint.insulinDoses[dose.medication] = (timePoint.insulinDoses[dose.medication] || 0) + dose.dose;
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
              timePoint.insulinEffects[dose.medication] =
                (timePoint.insulinEffects[dose.medication] || 0) + effect;
              timePoint.totalInsulinEffect += effect;
            }
          }
        });

        timelineData.push(timePoint);
        currentTime += interval;
      }

      return timelineData;
    } catch (error) {
      console.error('Error generating combined data:', error);
      return [];
    }
  }, [calculateInsulinEffect, getInsulinParameters, includeFutureEffect, futureHours]);

  // Fetch insulin data
  const fetchInsulinData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Calculate the date range including future hours
      const endDate = moment(dateRange.end).add(includeFutureEffect ? futureHours : 0, 'hours').format('YYYY-MM-DD');

      // Use the correct endpoint for comprehensive insulin data
      const insulinResponse = await axios.get(
        `http://localhost:5000/api/insulin-data?days=30&end_date=${endDate}${patientId ? `&patient_id=${patientId}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Process insulin data from the comprehensive endpoint
      const insulinLogs = insulinResponse.data.insulin_logs || [];

      // Extract unique insulin types
      const types = [...new Set(insulinLogs.map(log => log.medication))];
      setInsulinTypes(types);

      // Only set selectedInsulinTypes if it's empty and we have types
      if (selectedInsulinTypes.length === 0 && types.length > 0) {
        setSelectedInsulinTypes(types);
      }

      // Process and enhance insulin data
      const processedInsulinData = insulinLogs.map(log => {
        // Parse administration time
        const adminTime = moment(log.taken_at);

        return {
          id: log.id || `insulin-${adminTime.valueOf()}`,
          medication: log.medication,
          dose: log.dose,
          administrationTime: adminTime.valueOf(),
          formattedTime: adminTime.format('MM/DD/YYYY, HH:mm'),
          notes: log.notes || '',
          mealType: log.meal_type || 'N/A',
          bloodSugar: log.blood_sugar,
          suggestedDose: log.suggested_dose,
          // Include pharmacokinetics from the API
          pharmacokinetics: log.pharmacokinetics || getInsulinParameters(log.medication)
        };
      });

      // Filter insulin data based on date range
      const startDate = moment(dateRange.start).startOf('day').valueOf();
      const filteredInsulinData = processedInsulinData.filter(insulin => {
        return insulin.administrationTime >= startDate;
      });

      // Save the processed data
      setInsulinData(filteredInsulinData);

      // Now apply insulin effects to the blood sugar data
      const processedData = applyInsulinEffect(filteredInsulinData, allBloodSugarData);
      setProcessedBloodSugarData(processedData);

      // Generate combined data using the bloodSugarData from context
      const combinedResult = generateCombinedData(filteredInsulinData, processedData);
      setCombinedData(combinedResult);

      setError('');
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching insulin data:', error);
      setError('Failed to load insulin data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, includeFutureEffect, futureHours, patientId, selectedInsulinTypes.length, getInsulinParameters, allBloodSugarData, applyInsulinEffect, generateCombinedData]);

  // Effect to fetch data once when component mounts and when necessary params change
  useEffect(() => {
    // Only fetch if we haven't fetched yet or if date range changes
    if (!dataFetched || dateRange) {
      fetchInsulinData();
    }
  }, [fetchInsulinData, dataFetched, dateRange]);

  // Re-fetch data when blood sugar data changes significantly
  useEffect(() => {
    if (dataFetched && bloodSugarData.length > 0) {
      fetchInsulinData();
    }
  }, [bloodSugarData, fetchInsulinData, dataFetched]);

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

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="insulin-tooltip">
          <p className="tooltip-time">{moment(data.timestamp).format('MM/DD/YYYY, HH:mm')}</p>

          {/* Display insulin doses */}
          {Object.entries(data.insulinDoses).length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Insulin Doses:</p>
              {Object.entries(data.insulinDoses).map(([type, dose], idx) => (
                <p key={idx} className="tooltip-dose">
                  {type.replace(/_/g, ' ')} - {dose} units
                </p>
              ))}
            </div>
          )}

          {/* Display insulin active effect */}
          {data.totalInsulinEffect > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Active Insulin Effect:</p>
              <p className="tooltip-effect">Total: {data.totalInsulinEffect.toFixed(2)} units</p>
              {Object.entries(data.insulinEffects).map(([type, effect], idx) => (
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

  // Format the X-axis labels
  const formatXAxis = useCallback((tickItem) => {
    return moment(tickItem).format('MM/DD HH:mm');
  }, []);

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

  return (
    <div className="insulin-visualization">
      <h2 className="title">Insulin Therapy Analysis</h2>

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
            className={`toggle-btn ${viewMode === 'doses' ? 'active' : ''}`}
            onClick={() => setViewMode('doses')}
          >
            Doses
          </button>
          <button
            className={`toggle-btn ${viewMode === 'effect' ? 'active' : ''}`}
            onClick={() => setViewMode('effect')}
          >
            Insulin Effect
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

        <div className="insulin-type-filters">
          <div className="filter-header">Insulin Types:</div>
          <div className="filter-options">
            {insulinTypes.map((type, idx) => (
              <label key={`${type}_${idx}`} className="filter-option">
                <input
                  type="checkbox"
                  checked={selectedInsulinTypes.includes(type)}
                  onChange={() => handleInsulinTypeToggle(type)}
                />
                {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
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
            Show Insulin Effect
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
        </div>

        <button className="update-btn" onClick={handleForceUpdate}>Update Data</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading insulin data...</div>
      ) : combinedData.length === 0 ? (
        <div className="no-data">No insulin data found for the selected date range.</div>
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
                      domain={['dataMin - 10', 'dataMax + 10']}
                      label={{ value: `Blood Sugar (${unit})`, angle: -90, position: 'insideLeft' }}
                    />
                  )}

                  {/* Y-axis for insulin doses */}
                  {(viewMode === 'combined' || viewMode === 'doses') && (
                    <YAxis
                      yAxisId="insulinDose"
                      orientation={showActualBloodSugar ? "right" : "left"}
                      domain={[0, 'dataMax + 2']}
                      label={{
                        value: 'Insulin Dose (units)',
                        angle: -90,
                        position: showActualBloodSugar ? 'insideRight' : 'insideLeft'
                      }}
                    />
                  )}

                  {/* Y-axis for insulin effect */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
                    <YAxis
                      yAxisId="insulinEffect"
                      orientation="right"
                      domain={[0, 'dataMax + 1']}
                      label={{ value: 'Active Insulin (units)', angle: -90, position: 'insideRight' }}
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

    {/* Enhanced "Predicted with Insulin" line */}
    <Line
      yAxisId="bloodSugar"
      type="monotone"
      dataKey="predictedBloodSugar"
      name={`Predicted with Insulin (${unit})`}
      stroke="#00C853"  // Bright green color
      strokeWidth={2.5} // Thicker line
      dot={{
        r: 5,           // Larger dots
        fill: "#00C853",
        stroke: "#005724",
        strokeWidth: 1.5
      }}
      activeDot={{
        r: 8,
        stroke: "#ffffff",
        strokeWidth: 2
      }}
      connectNulls
    />
  </>
    )}


                  {/* Insulin Doses */}
                  {(viewMode === 'combined' || viewMode === 'doses') && selectedInsulinTypes.map((insulinType, idx) => (
                    <Bar
                      key={`dose-${insulinType}-${idx}`}
                      yAxisId="insulinDose"
                      dataKey={`insulinDoses.${insulinType}`}
                      name={`${insulinType.replace(/_/g, ' ')} Dose`}
                      fill={getInsulinColor(insulinType, idx)}
                      barSize={40}
                      stackId="doses"
                    />
                  ))}

                  {/* Insulin Effect Area */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && (
                    <Area
                      yAxisId="insulinEffect"
                      type="monotone"
                      dataKey="totalInsulinEffect"
                      name="Active Insulin Effect"
                      fill="#82ca9d"
                      stroke="#82ca9d"
                      fillOpacity={0.3}
                    />
                  )}

                  {/* Reference lines for individual insulin effects */}
                  {(viewMode === 'combined' || viewMode === 'effect') && showExpectedEffect && selectedInsulinTypes.map((insulinType, idx) => (
                    <Line
                      key={`effect-${insulinType}-${idx}`}
                      yAxisId="insulinEffect"
                      type="monotone"
                      dataKey={`insulinEffects.${insulinType}`}
                      name={`${insulinType.replace(/_/g, ' ')} Effect`}
                      stroke={getInsulinColor(insulinType, idx, true)}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                  ))}

                  {/* Current time reference line */}
                  {currentTimeInRange && (
                    <ReferenceLine
                      x={moment().valueOf()}
                      yAxisId={currentTimeYAxisId}
                      stroke="#ff0000"
                      strokeWidth={2}
                      label={{ value: 'Now', position: 'top', fill: '#ff0000' }}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>

              <div className="chart-legend">
                <h4>Insulin Type Details</h4>
                <div className="insulin-types-grid">
                  {insulinTypes.filter(type => selectedInsulinTypes.includes(type)).map((type, idx) => {
                    const params = getInsulinParameters(type);
                    return (
                      <div key={`legend-${type}-${idx}`} className="insulin-type-details">
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
                          <span>Onset: {params.onset_hours} hrs</span>
                          {params.peak_hours && <span>Peak: {params.peak_hours} hrs</span>}
                          <span>Duration: {params.duration_hours} hrs</span>
                          <span>Type: {params.type.replace(/_/g, ' ')}</span>
                        </div>
                        {params.brand_names && (
                          <div className="insulin-brands">
                            <small>Brands: {params.brand_names.join(', ')}</small>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

{/* Blood sugar effect legend */}
{showActualBloodSugar && processedBloodSugarData.some(d => d.predictedBloodSugar) && (
  <div className="blood-sugar-legend">
    <h4>Blood Sugar Effects</h4>
    <div className="legend-item" style={{ marginTop: '10px', fontWeight: 'bold' }}>
      <span className="legend-color" style={{
        backgroundColor: '#5677cc',
        height: '12px',
        width: '12px',
        border: '2px solid #2e4a8f'
      }}></span>
      <span>Actual Readings</span>
    </div>
    <div className="legend-item">
      <span className="legend-color" style={{
        backgroundColor: '#a5a0d8',
        height: '8px',
        width: '8px',
        opacity: 0.8
      }}></span>
      <span className="legend-dash" style={{ borderTop: '1px dashed #a5a0d8', marginLeft: '5px' }}></span>
      <span>Estimated (30-min intervals)</span>
    </div>
    <div className="legend-item" style={{ marginTop: '10px', fontWeight: 'bold' }}>
      <span className="legend-color" style={{
        backgroundColor: '#00C853',
        height: '12px',
        width: '12px',
        border: '1px solid #005724'
      }}></span>
      <span>Predicted with Insulin</span>
    </div>
  </div>
)}
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