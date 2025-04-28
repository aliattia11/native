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
import './InsulinVisualization.css';

const InsulinVisualization = ({ isDoctor = false, patientId = null }) => {
  // Use TimeContext for date range management
  const timeContext = useContext(TimeContext);

  // Use contexts for patient constants and blood sugar data
  const { patientConstants } = useConstants();
  const {
    combinedData: contextBloodSugarData,
    timeScale,
    getFilteredData,
    systemDateTime,
    currentUserLogin
  } = useBloodSugarData();

  // State management
  const [insulinData, setInsulinData] = useState([]);
  const [bloodSugarData, setBloodSugarData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [localDateRange, setLocalDateRange] = useState({
    start: moment().subtract(3, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });
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

  // Use TimeContext values if available, otherwise use local state
  const dateRange = timeContext ? timeContext.dateRange : localDateRange;

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
    const medicationFactors = patientConstants.medication_factors || {};

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
          formattedTime: TimeManager.formatDate(currentTime, TimeManager.formats.DATETIME_DISPLAY),
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
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes;
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

  // Fetch insulin and blood sugar data
  const fetchData = useCallback(async () => {
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

      // Fetch blood sugar data - Use context data if available, otherwise fetch from API
      let processedBloodSugarData = [];
      if (contextBloodSugarData && contextBloodSugarData.length > 0) {
        // Use filtered data from context if available
        processedBloodSugarData = getFilteredData(contextBloodSugarData);
      } else {
        // Fallback to API if context data isn't available
        const bloodSugarResponse = await axios.get(
          `http://localhost:5000/api/blood-sugar?start_date=${dateRange.start}&end_date=${endDate}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Process blood sugar data from API
        processedBloodSugarData = bloodSugarResponse.data.map(reading => {
          // Use reading time if available, otherwise use recording time
          const readingTime = moment(reading.blood_sugar_timestamp || reading.timestamp);

          return {
            id: reading._id,
            bloodSugar: reading.bloodSugar,
            readingTime: readingTime.valueOf(),
            formattedTime: TimeManager.formatDate(readingTime, TimeManager.formats.DATETIME_DISPLAY),
            status: reading.status,
            notes: reading.notes || ''
          };
        });
      }

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
          formattedTime: TimeManager.formatDate(adminTime, TimeManager.formats.DATETIME_DISPLAY),
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
      setBloodSugarData(processedBloodSugarData);

      // Generate combined data
      const combinedResult = generateCombinedData(filteredInsulinData, processedBloodSugarData);
      setCombinedData(combinedResult);

      setError('');
      setDataFetched(true);
    } catch (error) {
      console.error('Error fetching insulin data:', error);
      setError('Failed to load insulin data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, generateCombinedData, patientId, selectedInsulinTypes.length, getInsulinParameters,
      includeFutureEffect, futureHours, contextBloodSugarData, getFilteredData]);

  // Effect to fetch data once when component mounts and when necessary params change
  useEffect(() => {
    // Only fetch if we haven't fetched yet or if date range changes
    if (!dataFetched || dateRange) {
      fetchData();
    }
  }, [fetchData, dataFetched, dateRange]);

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
      setLocalDateRange(newRange);
    }
  }, [timeContext]);

  // Toggle system info display
  const toggleSystemInfo = useCallback(() => {
    setShowSystemInfo(!showSystemInfo);
  }, [showSystemInfo]);

  // Toggle future effects projection
  const toggleFutureEffect = useCallback(() => {
    setIncludeFutureEffect(!includeFutureEffect);
  }, [includeFutureEffect]);

  // Force update the data
  const handleForceUpdate = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Custom tooltip for the chart
  const CustomTooltip = useCallback(({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="insulin-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

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
                {data.bloodSugar} mg/dL
                {data.bloodSugarStatus && ` (${data.bloodSugarStatus.label || data.bloodSugarStatus})`}
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  }, []);

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
      Cell: ({ value }) => value ? `${value} mg/dL` : 'N/A'
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
  ], []);

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

  // Generate ticks for x-axis based on time scale using TimeManager
  const ticks = useMemo(() => {
    return TimeManager.generateTimeTicks(
      timeScale.start || moment(dateRange.start).startOf('day').valueOf(),
      timeScale.end || moment(dateRange.end).endOf('day').valueOf(),
      timeScale.tickInterval || 12
    );
  }, [timeScale, dateRange]);

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

  // Get the target blood sugar from patient constants
  const targetGlucose = useMemo(() => {
    return patientConstants.target_glucose || 100;
  }, [patientConstants]);

  // Determine which Y-axis ID to use for the current time reference line
  const currentTimeYAxisId = useMemo(() => {
    if (showActualBloodSugar) return "bloodSugar";
    if (viewMode === 'doses' || viewMode === 'combined') return "insulinDose";
    return "insulinEffect";
  }, [showActualBloodSugar, viewMode]);

  // Check if current time is within chart range
  const currentTimeInRange = TimeManager.isTimeInRange(
    new Date().getTime(),
    timeScale.start || moment(dateRange.start).startOf('day').valueOf(),
    timeScale.end || moment(dateRange.end).endOf('day').valueOf()
  );

  return (
    <div className="insulin-visualization">
      <h2 className="title">Insulin Therapy Analysis</h2>

      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      {showSystemInfo && (
        <div className="system-info">
          <span className="time-label">Current Date and Time (UTC): {systemDateTime} | </span>
          <span className="user-label">User: {currentUserLogin}</span>
          <button
            onClick={toggleSystemInfo}
            className="system-info-toggle"
            aria-label="Hide system information"
          >
            Hide
          </button>
        </div>
      )}

      {!showSystemInfo && (
        <button
          onClick={toggleSystemInfo}
          className="system-info-toggle show-btn"
          aria-label="Show system information"
        >
          Show System Info
        </button>
      )}

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
        {/* Use TimeInput component in daterange mode */}
        <TimeInput
          mode="daterange"
          value={dateRange}
          onChange={handleDateRangeChange}
          useTimeContext={!!timeContext}
          label="Date Range"
          className="date-range-control"
        />

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
                    domain={[
                      timeScale.start || moment(dateRange.start).startOf('day').valueOf(),
                      timeScale.end || moment(dateRange.end).endOf('day').valueOf()
                    ]}
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
                      label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
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

                  {/* Blood Sugar Line */}
                  {showActualBloodSugar && (
                    <Line
                      yAxisId="bloodSugar"
                      type="monotone"
                      dataKey="bloodSugar"
                      name="Blood Sugar"
                      stroke="#8884d8"
                      dot={{ r: 4 }}
                      activeDot={{ r: 8 }}
                      connectNulls
                    />
                  )}

                  {/* Insulin Doses */}
                  {(viewMode === 'combined' || viewMode === 'doses') && selectedInsulinTypes.map((insulinType, idx) => (
                    <Bar
                      key={`dose-${insulinType}-${idx}`}
                      yAxisId="insulinDose"
                      dataKey={`insulinDoses.${insulinType}`}
                      name={`${insulinType.replace(/_/g, ' ')} Dose`}
                      fill={getInsulinColor(insulinType, idx)}
                      barSize={20}
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
                      x={new Date().getTime()}
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

export default InsulinVisualization;