import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import moment from 'moment';
import { useConstants } from '../contexts/ConstantsContext';
import { useBloodSugarData } from '../contexts/BloodSugarDataContext';
import './BloodSugarVisualization.css';

/**
 * Enhanced Blood Sugar Visualization Component
 *
 * Features:
 * - Two distinct lines: actual readings and estimated values
 * - Actual readings only connect when less than 20 minutes apart
 * - Estimated line returns to target after readings (no increase without meals)
 * - Fills entire graph with target-based estimates
 */
const BloodSugarVisualization = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  fillGaps = true,
  gapThresholdHours = 3,
  height = '400px',
  onDataLoaded = null,
  dateRange: initialDateRange = null,
  defaultView = 'chart',
  embedded = false,
  customApiEndpoint = null,
  chartConfig = {}
}) => {
  // Access patient constants from context
  const { patientConstants, loading: constantsLoading } = useConstants();

  // Use the shared blood sugar data context
  const {
    bloodSugarData,
    filteredData,
    estimatedBloodSugarData,
    combinedData,
    loading,
    error,
    targetGlucose,
    dateRange,
    timeScale,
    unit,
    estimationSettings,
    fetchBloodSugarData,
    filteredEstimatedReadings,
    setDateRange,
    setUnit,
    setTargetGlucose,
    setEstimationSettings,
    getBloodSugarStatus,
    currentDateTime,
    currentUserLogin
  } = useBloodSugarData();

  // Local state for UI
  const [activeView, setActiveView] = useState(defaultView);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [currentTime, setCurrentTime] = useState(moment().valueOf());

  // Reference for chart container and tracking fetch state
  const chartRef = useRef(null);
  const didFetchRef = useRef(false);

  // Process readings for connection logic based on maxConnectGapMinutes
  const processedReadings = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];

    return filteredData.map((reading, index, array) => {
      // Check if this reading should connect to the previous one
      const connectToPrevious = index > 0 &&
        (array[index].readingTime - array[index-1].readingTime <= estimationSettings.maxConnectGapMinutes * 60 * 1000);

      return {
        ...reading,
        connectToPrevious
      };
    });
  }, [filteredData, estimationSettings.maxConnectGapMinutes]);

  // Handle visibility of the individual dots representing actual readings
  const dottedActualReadings = useMemo(() => {
    return processedReadings.map(reading => ({
      ...reading,
      connectToPrevious: false // Override to ensure all dots are rendered
    }));
  }, [processedReadings]);

  // Update target glucose when patient constants change
  useEffect(() => {
    if (patientConstants && patientConstants.target_glucose) {
      setTargetGlucose(patientConstants.target_glucose);
    }
  }, [patientConstants, setTargetGlucose]);

  // Get user's time zone info on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = moment();
      setCurrentTime(now.valueOf());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Fetch data when component mounts or when date range changes
  useEffect(() => {
    // Only run once on mount or when dependencies change meaningfully
    const shouldFetch = !loading && (
      !didFetchRef.current ||
      (initialDateRange && initialDateRange !== dateRange)
    );

    if (shouldFetch) {
      didFetchRef.current = true;

      if (initialDateRange) {
        setDateRange(initialDateRange);
      }

      // Don't fetch immediately if we just changed the date range
      if (!initialDateRange || didFetchRef.current) {
        // If custom endpoint is provided, we need a different approach
        if (customApiEndpoint) {
          // Custom endpoint handling would go here
        } else {
          fetchBloodSugarData(patientId);
        }
      }
    }

    // Call the onDataLoaded callback if provided and we have data
    if (onDataLoaded && combinedData.length > 0 && !loading) {
      onDataLoaded(combinedData);
    }
  }, [fetchBloodSugarData, initialDateRange, patientId, customApiEndpoint,
      setDateRange, onDataLoaded, combinedData, loading, dateRange]);

  // Sync local gap fill settings with the context
  useEffect(() => {
    setEstimationSettings(prev => ({
      ...prev,
      enabled: fillGaps,
      thresholdHours: gapThresholdHours
    }));
  }, [fillGaps, gapThresholdHours, setEstimationSettings]);

  // Date range change handler
  const handleDateChange = (e) => {
    const { name, value } = e.target;
    // Update date range and trigger a refetch when date changes
    setDateRange(prev => {
      const newRange = { ...prev, [name]: value };
      // Refetch data with the new date range after state is updated
      setTimeout(() => fetchBloodSugarData(patientId), 0);
      return newRange;
    });
  };

  // Unit change handler
  const handleUnitChange = (e) => {
    setUnit(e.target.value);
  };

  // Gap fill toggle handler
  const handleGapFillToggle = () => {
    setEstimationSettings(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };

  // Connection time gap handler
  const handleConnectMaxTimeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setEstimationSettings(prev => ({
        ...prev,
        maxConnectGapMinutes: value
      }));
    }
  };

  // Stabilization hours handler
  const handleStabilizationHoursChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setEstimationSettings(prev => ({
        ...prev,
        stabilizationHours: value
      }));
    }
  };

  // Fill from start toggle handler
  const handleFillFromStartToggle = () => {
    setEstimationSettings(prev => ({
      ...prev,
      fillFromStart: !prev.fillFromStart
    }));
  };

  // Extend to current toggle handler
  const handleExtendToCurrentToggle = () => {
    setEstimationSettings(prev => ({
      ...prev,
      extendToCurrent: !prev.extendToCurrent
    }));
  };

  // Fill entire graph toggle handler
  const handleFillEntireGraphToggle = () => {
    setEstimationSettings(prev => ({
      ...prev,
      fillEntireGraph: !prev.fillEntireGraph
    }));
  };

  // Return to target toggle handler
  const handleReturnToTargetToggle = () => {
    setEstimationSettings(prev => ({
      ...prev,
      returnToTarget: !prev.returnToTarget
    }));
  };

  // Quick date range presets
  const applyDatePreset = (days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');

    // Set the end date based on the preset type with specific requirements
    let end;
    if (days === 1) {
      // For "Last 24h": past day plus 12 hours
      end = moment().add(12, 'hours').format('YYYY-MM-DD');
    } else if (days === 7) {
      // For "Last Week": past 7 days plus one future day
      end = moment().add(1, 'day').format('YYYY-MM-DD');
    } else if (days === 30) {
      // For "Last Month": past 30 days plus 4 future days
      end = moment().add(4, 'days').format('YYYY-MM-DD');
    } else {
      // Default case
      end = moment().format('YYYY-MM-DD');
    }

    // Set the new date range
    setDateRange({
      start: start,
      end: end
    });

    // Fetch data with the new range
    setTimeout(() => fetchBloodSugarData(patientId), 0);
  };

  // Format X-axis labels
  const formatXAxis = (tickItem) => {
    // Format the timestamp using the user's local timezone
    return moment(tickItem).format(timeScale.tickFormat || 'MM/DD HH:mm');
  };

  // Format Y-axis labels
  const formatYAxis = (value) => {
    return `${value} ${unit}`;
  };

  // Check if current time is within chart range
  const currentTimeInRange = currentTime >= timeScale.start && currentTime <= timeScale.end;

  // Generate ticks for the x-axis based on time scale
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

  // Custom dot renderer that changes appearance based on data type
  const CustomActualDot = useCallback((props) => {
    const { cx, cy, stroke, payload } = props;

    // Only render visible dots for actual readings
    if (!payload.isActualReading) return null;

    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        stroke={payload.status.color}
        strokeWidth={2}
        fill="#ffffff"
      />
    );
  }, []);

  // Custom dot renderer for estimated line
  const CustomEstimatedDot = useCallback((props) => {
    const { cx, cy, stroke, payload } = props;

    // Don't render dots for estimated points to reduce clutter
    if (payload.isInterpolated && !payload.isEstimatedLine) {
      return null;
    }

    // Only show dots at anchor points (where estimated line meets actual readings)
    if (payload.isEstimatedLine) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={3}
          stroke="#6a5acd"
          strokeWidth={1}
          fill="#f9f9f9"
          strokeDasharray="2,2"
        />
      );
    }

    return null;
  }, []);

  const CustomTooltip = useCallback(({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // Find the actual data point from the payload
      const dataItem = payload[0]?.payload;
      if (!dataItem) return null;

      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{`Reading Time: ${moment(dataItem.readingTime).format('MM/DD/YYYY, HH:mm')}`}</p>
          <p className="tooltip-value" style={{ color: dataItem.status.color }}>
            {`Blood Sugar: ${Math.round(dataItem.bloodSugar * 10) / 10} ${unit}`}
          </p>
          <p className="tooltip-target">
            {`Target: ${targetGlucose} ${unit}`}
          </p>
          <p className="tooltip-status">
            {dataItem.isInterpolated
              ? `Type: ${dataItem.dataType === 'estimated' 
                ? 'Estimated' 
                : 'Target'}`
              : `Status: ${dataItem.status.label}`}
          </p>
          {dataItem.notes && <p className="tooltip-notes">Notes: {dataItem.notes}</p>}
          {dataItem.isInterpolated && (
            <p className="tooltip-interpolated">
              {dataItem.dataType === 'estimated'
                ? `Estimated value (returns to target in ${estimationSettings.stabilizationHours}h)`
                : `Target glucose value (${targetGlucose} ${unit})`}
            </p>
          )}
          {dataItem.predictedBloodSugar && (
            <p className="tooltip-predicted" style={{ color: '#82ca9d' }}>
              {`With Insulin: ${Math.round(dataItem.predictedBloodSugar * 10) / 10} ${unit}`}
            </p>
          )}
        </div>
      );
    }
    return null;
  }, [estimationSettings.stabilizationHours, targetGlucose, unit]);

  // Table columns definition
  const columns = useMemo(
    () => [
      {
        Header: 'Reading Time',
        accessor: 'formattedReadingTime',
        Cell: ({ value, row }) => (
          <span style={{
            color: row.original.isInterpolated ? '#888888' : 'inherit',
            fontStyle: row.original.isInterpolated ? 'italic' : 'normal'
          }}>
            {value}
            {row.original.isInterpolated && (
              row.original.dataType === 'estimated' ? ' (estimated)' : ' (target)'
            )}
          </span>
        ),
      },
      {
        Header: 'Recording Time',
        accessor: 'formattedRecordingTime',
        Cell: ({ value, row }) => (
          <span style={{
            color: row.original.isInterpolated ? '#888888' : 'inherit',
            fontStyle: row.original.isInterpolated ? 'italic' : 'normal'
          }}>
            {row.original.isInterpolated ? 'N/A' : value}
          </span>
        ),
      },
      {
        Header: `Blood Sugar (${unit})`,
        accessor: 'bloodSugar',
        Cell: ({ value, row }) => (
          <span style={{
            color: row.original.dataType === 'estimated' ? '#6a5acd' :
                  row.original.isInterpolated ? '#888888' : row.original.status.color,
            fontWeight: row.original.isInterpolated ? 'normal' : 500,
            fontStyle: row.original.isInterpolated ? 'italic' : 'normal'
          }}>
            {value !== undefined && value !== null ? Math.round(value * 10) / 10 : 'N/A'} {unit}
            {row.original.isInterpolated && (
              row.original.dataType === 'estimated' ? ' (estimated)' : ' (target)'
            )}
          </span>
        ),
      },
      {
        Header: `Target (${unit})`,
        accessor: 'target',
        Cell: ({ value }) => (
          <span>
            {value !== undefined && value !== null ? value : targetGlucose} {unit}
          </span>
        ),
      },
      {
        Header: 'Status',
        accessor: row => row.status.label,
        Cell: ({ row }) => (
          <div className="status-indicator">
            <div
              className="status-dot"
              style={{
                backgroundColor: row.original.dataType === 'estimated' ? '#6a5acd' :
                               row.original.isInterpolated ? '#aaaaaa' : row.original.status.color,
                opacity: row.original.isInterpolated ? 0.7 : 1
              }}
            ></div>
            <span style={{
              fontStyle: row.original.isInterpolated ? 'italic' : 'normal',
              color: row.original.isInterpolated ? '#888888' : 'inherit'
            }}>
              {row.original.isInterpolated
                ? (row.original.dataType === 'estimated' ? 'Estimated' : 'Target')
                : row.original.status.label}
            </span>
          </div>
        ),
      },
      {
        Header: 'Data Type',
        accessor: row => row.dataType,
        Cell: ({ value }) => {
          let color, text;
          switch(value) {
            case 'actual':
              color = '#00C851';
              text = 'Actual';
              break;
            case 'estimated':
              color = '#6a5acd';
              text = 'Estimated';
              break;
            case 'target':
              color = '#888888';
              text = 'Target';
              break;
            default:
              color = '#333333';
              text = value;
          }

          return (
            <span style={{
              color: color,
              fontWeight: value === 'actual' ? 'bold' : 'normal'
            }}>
              {text}
            </span>
          );
        },
      },
    ],
    [unit, targetGlucose]
  );

  // Set up React Table
  const tableInstance = useTable(
    {
      columns,
      data: combinedData,
      initialState: { pageIndex: 0, pageSize: 10 },
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
    pageOptions,
    pageCount,
    gotoPage,
    nextPage,
    previousPage,
    setPageSize,
    state: { pageIndex, pageSize },
  } = tableInstance;

  // Apply any custom chart configuration
  const chartSettings = {
    width: '100%',
    height: embedded ? height : 400,
    ...chartConfig
  };

  // Show loading if we're waiting for constants
  if (constantsLoading) return <div className="loading">Loading patient data...</div>;

  return (
    <div className={`blood-sugar-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Blood Sugar Data</h2>}

      {/* Patient Target Info */}
      <div className="target-info">
        <span className="target-label">Patient Target Blood Glucose: </span>
        <span className="target-value">{targetGlucose} {unit}</span>
        {/* Display current date and login info */}
        <div className="system-info">
          <span className="time-label">Current: {currentDateTime} UTC | </span>
          <span className="user-label">User: {currentUserLogin}</span>
        </div>
      </div>

      {/* Add timezone info display */}
      {!embedded && (
        <div className="timezone-info">
          Your timezone: {userTimeZone}
          <span className="timezone-note"> (all times displayed in your local timezone)</span>
        </div>
      )}

      {!embedded && (
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
      )}

      {showControls && (
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
            <button onClick={() => applyDatePreset(7)}>Last Week</button>
            <button onClick={() => applyDatePreset(30)}>Last Month</button>
          </div>

          <div className="unit-selector">
            <label htmlFor="unit-select">Unit:</label>
            <select id="unit-select" value={unit} onChange={handleUnitChange}>
              <option value="mg/dL">mg/dL</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>

          <div className="gap-fill-controls">
            <label>
              <input
                type="checkbox"
                checked={estimationSettings.enabled}
                onChange={handleGapFillToggle}
              />
              Show estimated line
            </label>

            <div className="threshold-input">
              <label htmlFor="connect-max-time">Connect readings within (min):</label>
              <input
                id="connect-max-time"
                type="number"
                min="1"
                max="60"
                value={estimationSettings.maxConnectGapMinutes}
                onChange={handleConnectMaxTimeChange}
              />
            </div>

            {estimationSettings.enabled && (
              <>
                <div className="threshold-input">
                  <label htmlFor="stabilization-hours">Return to target in (hours):</label>
                  <input
                    id="stabilization-hours"
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={estimationSettings.stabilizationHours}
                    onChange={handleStabilizationHoursChange}
                  />
                </div>

                <label>
                  <input
                    type="checkbox"
                    checked={estimationSettings.fillEntireGraph}
                    onChange={handleFillEntireGraphToggle}
                  />
                  Fill entire graph
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={estimationSettings.fillFromStart}
                    onChange={handleFillFromStartToggle}
                  />
                  Fill from range start
                </label>
              </>
            )}
          </div>

          <button className="update-btn" onClick={() => fetchBloodSugarData(patientId)}>Update Data</button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading blood sugar data...</div>
      ) : (
        <div className="content-container">
          {(activeView === 'chart' || embedded) && (
            <div className="chart-container" ref={chartRef}>
              <ResponsiveContainer width={chartSettings.width} height={chartSettings.height}>
                <LineChart
                  margin={{ top: 20, right: 40, bottom: 30, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="readingTime"
                    name="Time"
                    domain={[timeScale.start, timeScale.end]} // Use fixed domain from timeScale
                    ticks={ticks} // Use our generated ticks
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    allowDuplicatedCategory={false}
                    scale="time"
                    interval={0}
                  />
                  <YAxis tickFormatter={formatYAxis} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Target glucose reference lines */}
                  <ReferenceLine
                    y={targetGlucose}
                    label={{ value: 'Target', position: 'right' }}
                    stroke="#666"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={targetGlucose * 0.7}
                    label={{ value: 'Low', position: 'right' }}
                    stroke="#ff4444"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={targetGlucose * 1.3}
                    label={{ value: 'High', position: 'right' }}
                    stroke="#ff8800"
                    strokeDasharray="3 3"
                  />

                  {/* Current time reference line */}
                  {currentTimeInRange && (
                    <ReferenceLine
                      x={currentTime}
                      stroke="#ff0000"
                      strokeWidth={2}
                      label={{
                        value: 'Now',
                        position: 'top',
                        fill: '#ff0000',
                        fontSize: 12
                      }}
                    />
                  )}

                  {/* Generate a disconnected line with only dots for all actual readings */}
                  <Line
                    key="actual-dots"
                    dataKey="bloodSugar"
                    name={`Actual Readings (${unit})`}
                    data={processedReadings}
                    stroke="none"
                    isAnimationActive={false}
                    dot={CustomActualDot}
                  />

                  {/* Connected line only for points within maxConnectGapMinutes of each other */}
                  <Line
                    key="actual-line"
                    dataKey="bloodSugar"
                    name={`Actual Readings (${unit})`}
                    data={processedReadings.filter(r => r.connectToPrevious)}
                    stroke="#8884d8"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={false}
                    connectNulls={false}
                  />

                  {/* Estimated line showing target-returning pattern */}
                  {estimationSettings.enabled && (
                    <Line
                      key="estimated-line"
                      dataKey="bloodSugar"
                      name={`Estimated Pattern (${unit})`}
                      data={estimatedBloodSugarData}
                      stroke="#6a5acd"
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                      strokeDasharray="4 4"
                      isAnimationActive={false}
                      dot={CustomEstimatedDot}
                      connectNulls={true}
                    />
                  )}

                  {/* Show predicted blood sugar (if available from insulin effects) */}
                  {combinedData.some(d => d.predictedBloodSugar) && (
                    <Line
                      key="predicted-line"
                      dataKey="predictedBloodSugar"
                      name={`Predicted with Insulin (${unit})`}
                      data={combinedData.filter(d => d.isInterpolated && d.predictedBloodSugar)}
                      stroke="#82ca9d"
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                      strokeDasharray="3 3"
                      isAnimationActive={false}
                      dot={false}
                      connectNulls={true}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>

              <div className="chart-legend">
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#00C851' }}></span>
                  <span>Normal: {targetGlucose * 0.7} - {targetGlucose * 1.3} {unit}</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#ff4444' }}></span>
                  <span>Low: Below {targetGlucose * 0.7} {unit}</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#ff8800' }}></span>
                  <span>High: Above {targetGlucose * 1.3} {unit}</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#8884d8' }}></span>
                  <span>Actual Readings (connected when &lt;{estimationSettings.maxConnectGapMinutes}min apart)</span>
                </div>
                {estimationSettings.enabled && (
                  <div className="legend-item">
                    <span className="legend-dash" style={{ borderTop: '2px dashed #6a5acd' }}></span>
                    <span>Estimated (returns to target in {estimationSettings.stabilizationHours}h)</span>
                  </div>
                )}
                {combinedData.some(d => d.predictedBloodSugar) && (
                  <div className="legend-item">
                    <span className="legend-dash" style={{ borderTop: '2px dashed #82ca9d' }}></span>
                    <span>Predicted with Insulin Effects</span>
                  </div>
                )}
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#ff0000' }}></span>
                  <span>Current Time</span>
                </div>
              </div>

              {/* Display message if no data points are in the current range */}
              {combinedData.length === 0 && (
                <div className="no-data-overlay">
                  No blood sugar readings found in the selected date range
                </div>
              )}
            </div>
          )}

          {activeView === 'table' && !embedded && (
            <div className="table-container">
              <table {...getTableProps()} className="blood-sugar-table">
                <thead>
                  {headerGroups.map(headerGroup => {
                    const { key, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
                    return (
                      <tr key={key || Math.random()} {...headerGroupProps}>
                        {headerGroup.headers.map(column => {
                          const { key, ...columnProps } = column.getHeaderProps(column.getSortByToggleProps());
                          return (
                            <th key={key || Math.random()} {...columnProps}>
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
                    page.map(row => {
                      prepareRow(row);
                      const { key, ...rowProps } = row.getRowProps();

                      // Define row class based on data type
                      let rowClass = '';
                      if (row.original.dataType === 'actual') {
                        rowClass = `status-${row.original.status?.label?.toLowerCase() || 'normal'}`;
                      } else if (row.original.dataType === 'estimated') {
                        rowClass = 'estimated';
                      } else {
                        rowClass = 'interpolated';
                      }

                      return (
                        <tr
                          key={key || Math.random()}
                          {...rowProps}
                          className={rowClass}
                        >
                          {row.cells.map(cell => {
                            const { key, ...cellProps } = cell.getCellProps();
                            return (
                              <td key={key || Math.random()} {...cellProps}>
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
                        No blood sugar readings found for the selected date range.
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
                    {pageIndex + 1} of {pageOptions.length || 1}
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

export default BloodSugarVisualization;