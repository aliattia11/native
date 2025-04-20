import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScatterChart, Scatter, Rectangle, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, ZAxis
} from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import './BloodSugarVisualization.css'; // Reuse the same CSS file

const ActivityVisualization = ({ isDoctor = false, patientId = null }) => {
  // Shared state
  const [data, setData] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [timeScale, setTimeScale] = useState({
    start: moment().subtract(7, 'days').valueOf(),
    end: moment().valueOf(),
    tickInterval: 8, // in hours
    tickFormat: 'DD/MM HH:mm'
  });
  const [currentTime, setCurrentTime] = useState(moment().valueOf());
  const [userTimeZone, setUserTimeZone] = useState('');

  // Reference for chart container dimensions
  const chartRef = useRef(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 0, height: 0 });

  // Activity levels mapping for display
  const activityLevels = [
    { value: -2, label: 'Sleep', color: '#6a0dad' },
    { value: -1, label: 'Very Low Activity', color: '#4169e1' },
    { value: 0, label: 'Normal Activity', color: '#2e8b57' },
    { value: 1, label: 'High Activity', color: '#ff8c00' },
    { value: 2, label: 'Vigorous Activity', color: '#dc143c' }
  ];

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(moment().valueOf());
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Update time scale when date range changes
  const updateTimeScale = useCallback(() => {
    const startMoment = moment(dateRange.start);
    const endMoment = moment(dateRange.end);
    const diffDays = endMoment.diff(startMoment, 'days');

    let tickInterval, tickFormat;

    // Determine scaling based on the date range
    if (diffDays <= 1) {
      // Last 24 hours - 1 hour ticks
      tickInterval = 1;
      tickFormat = 'HH:mm';
    } else if (diffDays <= 7) {
      // Last week - 8 hour ticks
      tickInterval = 8;
      tickFormat = 'DD/MM HH:mm';
    } else {
      // Last month - 1 day ticks
      tickInterval = 24;
      tickFormat = 'MM/DD';
    }

    setTimeScale({
      start: startMoment.valueOf(),
      end: endMoment.valueOf(),
      tickInterval,
      tickFormat
    });
  }, [dateRange]);

  // Generate ticks for the x-axis based on time scale
  const generateTicks = useCallback(() => {
    const ticks = [];
    let current = moment(timeScale.start);
    const end = moment(timeScale.end);

    while (current.isBefore(end)) {
      ticks.push(current.valueOf());
      current = current.add(timeScale.tickInterval, 'hours');
    }

    return ticks;
  }, [timeScale]);

  // Handle window resize to update chart dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (chartRef.current) {
        const { width, height } = chartRef.current.getBoundingClientRect();
        setChartDimensions({ width, height });
      }
    };

    window.addEventListener('resize', updateDimensions);

    // Initial dimensions
    setTimeout(updateDimensions, 300);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      let url = `http://localhost:5000/api/activity-history?start_date=${startDate}&end_date=${endDate}`;
      if (isDoctor && patientId) {
        url = `http://localhost:5000/api/patient/${patientId}/activity-history?start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Process and format the activity data for time segments
      const formattedData = response.data.map(item => {
        // Get the actual start time and convert from UTC to local
        const startTime = item.startTime || item.expectedTime || item.completedTime || item.timestamp;
        const startMoment = moment.utc(startTime).local();

        // Calculate end time
        let endMoment;
        if (item.endTime) {
          endMoment = moment.utc(item.endTime).local();
        } else if (item.duration) {
          // Calculate end time based on duration
          const [hours, minutes] = item.duration.split(':').map(Number);
          endMoment = moment(startMoment).add(hours, 'hours').add(minutes, 'minutes');
        } else {
          // Default to 1 hour if no duration or end time is provided
          endMoment = moment(startMoment).add(1, 'hour');
        }

        // Calculate duration
        const durationHours = endMoment.diff(startMoment, 'minutes') / 60;

        // Find the activity level info
        const activityLevel = activityLevels.find(level => level.value === item.level) ||
                             { label: 'Unknown', color: '#999999' };

        return {
          ...item,
          id: item.id || String(Math.random()),
          start: startMoment.valueOf(), // Start time in milliseconds (local time)
          end: endMoment.valueOf(),     // End time in milliseconds (local time)
          formattedStart: startMoment.format('MM/DD/YYYY, HH:mm'),
          formattedEnd: endMoment.format('MM/DD/YYYY, HH:mm'),
          formattedRecordingTime: moment.utc(item.timestamp).local().format('MM/DD/YYYY, HH:mm'),
          durationHours,
          formattedDuration: item.duration || `${Math.floor(durationHours)}:${Math.round((durationHours % 1) * 60).toString().padStart(2, '0')}`,
          level: item.level,
          activityLevelLabel: activityLevel.label,
          activityLevelColor: activityLevel.color,
          // Position on Y-axis based on activity level + small offset for clarity when multiple activities at same level
          y: item.level + (Math.random() * 0.3 - 0.15),
        };
      });

      // Sort by start time
      formattedData.sort((a, b) => a.start - b.start);
      setData(formattedData);

      // Update time scale after fetching data
      updateTimeScale();

      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError('Failed to fetch activity data. Please try again.');
      setLoading(false);
    }
  }, [dateRange, isDoctor, patientId, updateTimeScale]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update time scale when date range changes
  useEffect(() => {
    updateTimeScale();
  }, [dateRange, updateTimeScale]);

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  // Quick date range presets with specific extensions
  const applyDatePreset = (days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');

    // Set the end date based on the preset type with specific requirements
    let end;
    if (days === 1) {
      // For "Last 24h": past day plus 12 hours
      end = moment().add(12, 'hours').format('YYYY-MM-DD HH:mm');
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

    setDateRange({
      start: start,
      end: end
    });
  };

  // Chart-specific functions
  const formatXAxis = (tickItem) => {
    return moment(tickItem).format(timeScale.tickFormat);
  };

  // Improved custom shape for activity segments with precise timing
  const renderActivitySegment = (props) => {
    const { cx, cy, payload } = props;

    if (!chartRef.current || !chartDimensions.width) {
      // Default rendering if we don't have chart dimensions yet
      return (
        <Rectangle
          x={cx - 10}
          y={cy - 10}
          width={20}
          height={20}
          fill={payload.activityLevelColor}
          stroke="#000"
          strokeWidth={1}
          rx={4}
          ry={4}
        />
      );
    }

    // Get the XAxis range in pixels
    const xAxisWidth = chartDimensions.width - 100; // Approximate margins

    // Get the time range of the chart
    const totalTimeRange = timeScale.end - timeScale.start;

    // Make sure activity is within bounds
    const activityStart = Math.max(payload.start, timeScale.start);
    const activityEnd = Math.min(payload.end, timeScale.end);

    if (activityEnd <= activityStart) return null; // Skip if not visible

    // Calculate pixel positions based on the time proportions
    const startProportion = (activityStart - timeScale.start) / totalTimeRange;
    const endProportion = (activityEnd - timeScale.start) / totalTimeRange;

    // Calculate the position and width in pixels
    const startX = 60 + (startProportion * xAxisWidth); // Left margin offset + position
    const width = ((endProportion - startProportion) * xAxisWidth);

    // Use a fixed height for the rectangle
    const height = 20;
    const yPos = cy - (height / 2);

    return (
      <Rectangle
        x={startX}
        y={yPos}
        width={width}
        height={height}
        fill={payload.activityLevelColor}
        stroke="#000"
        strokeWidth={1}
        rx={4}
        ry={4}
      />
    );
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <h4>{item.activityLevelLabel}</h4>
          <p><strong>Start:</strong> {item.formattedStart}</p>
          <p><strong>End:</strong> {item.formattedEnd}</p>
          <p><strong>Duration:</strong> {item.formattedDuration}</p>
          {item.type && <p><strong>Type:</strong> {item.type.charAt(0).toUpperCase() + item.type.slice(1)}</p>}
          {item.impact && item.impact !== 1 && (
            <p>
              <strong>Impact on insulin:</strong>{' '}
              {((item.impact - 1) * 100).toFixed(1)}%
              {item.impact > 1 ? ' increase' : ' decrease'}
            </p>
          )}
          {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
        </div>
      );
    }
    return null;
  };

  // Table-specific columns
  const columns = React.useMemo(
    () => [
      {
        Header: 'Recorded',
        accessor: 'formattedRecordingTime',
      },
      {
        Header: 'Type',
        accessor: 'type',
        Cell: ({ value }) => value ? value.charAt(0).toUpperCase() + value.slice(1) : 'N/A'
      },
      {
        Header: 'Activity Level',
        accessor: 'activityLevelLabel',
        Cell: ({ value, row }) => (
          <div className="status-indicator">
            <div
              className="status-dot"
              style={{ backgroundColor: row.original.activityLevelColor }}
            ></div>
            <span>{value}</span>
          </div>
        ),
      },
      {
        Header: 'Duration',
        accessor: 'formattedDuration',
      },
      {
        Header: 'Start Time',
        accessor: 'formattedStart',
      },
      {
        Header: 'End Time',
        accessor: 'formattedEnd',
      },
      {
        Header: 'Impact',
        accessor: 'impact',
        Cell: ({ value }) => {
          if (!value || value === 1) return '0% (None)';
          const percentage = ((value - 1) * 100).toFixed(1);
          return `${percentage}% ${value > 1 ? 'increase' : 'decrease'}`;
        }
      },
    ],
    []
  );

  const tableInstance = useTable(
    {
      columns,
      data,
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

  // Generate custom ticks based on time scale
  const ticks = generateTicks();

  // Format times for display in local time zone
  const formattedCurrentTime = moment().format('YYYY-MM-DD HH:mm:ss');
  const formattedCurrentTimeUTC = moment().utc().format('YYYY-MM-DD HH:mm:ss');

  // Get current user login
  const userLogin = localStorage.getItem('userLogin') || 'user';

  // Determine if current time is within chart range
  const currentTimeInRange = currentTime >= timeScale.start && currentTime <= timeScale.end;

  return (
    <div className="blood-sugar-visualization">
      <h2 className="title">Activity Timeline</h2>

      {/* Add timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      <div className="view-toggle">
        <button
          className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveView('chart')}
        >
          Timeline View
        </button>
        <button
          className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
          onClick={() => setActiveView('table')}
        >
          Table View
        </button>
      </div>

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

        <button className="update-btn" onClick={fetchData}>Update Data</button>
      </div>

      <div className="current-time-display">
        <div className="time-info">
          <span className="time-label">Current Time (Local):</span>
          <span className="time-value">{formattedCurrentTime}</span>
        </div>
        <div className="time-info">
          <span className="time-label">Current Time (UTC):</span>
          <span className="time-value">{formattedCurrentTimeUTC}</span>
        </div>
        <div className="user-info">
          <span className="user-label">Current User:</span>
          <span className="user-value">{userLogin}</span>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading activity data...</div>
      ) : (
        <div className="content-container">
          {activeView === 'chart' && (
            <div className="chart-container" ref={chartRef}>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart
                  margin={{ top: 20, right: 40, bottom: 30, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="start"
                    name="Time"
                    domain={[timeScale.start, timeScale.end]} // Use fixed domain from timeScale
                    ticks={ticks} // Use our generated ticks
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    allowDuplicatedCategory={false}
                    scale="time"
                    interval={0} // Show all ticks
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    domain={[-2.5, 2.5]}
                    ticks={[-2, -1, 0, 1, 2]}
                    tickFormatter={(value) => {
                      const level = activityLevels.find(l => Math.round(value) === l.value);
                      return level ? level.label : '';
                    }}
                  />
                  <ZAxis range={[50, 50]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Reference lines for activity levels */}
                  {activityLevels.map(level => (
                    <ReferenceLine
                      key={level.value}
                      y={level.value}
                      stroke={level.color}
                      strokeDasharray="3 3"
                      strokeOpacity={0.5}
                    />
                  ))}

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

                  <Scatter
                    name="Activities"
                    data={data}
                    shape={renderActivitySegment}
                  />
                </ScatterChart>
              </ResponsiveContainer>

              <div className="chart-legend">
                {activityLevels.map(level => (
                  <div key={level.value} className="legend-item">
                    <span className="legend-color" style={{ backgroundColor: level.color }}></span>
                    <span>{level.label}</span>
                  </div>
                ))}
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#ff0000' }}></span>
                  <span>Current Time</span>
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
            <div className="table-container">
              <table {...getTableProps()} className="blood-sugar-table">
                <thead>
                  {headerGroups.map(headerGroup => {
                    const { key, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
                    return (
                      <tr key={key} {...headerGroupProps}>
                        {headerGroup.headers.map(column => {
                          const { key, ...columnProps } = column.getHeaderProps(column.getSortByToggleProps());
                          return (
                            <th key={key} {...columnProps}>
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
                      return (
                        <tr
                          key={key}
                          {...rowProps}
                        >
                          {row.cells.map(cell => {
                            const { key, ...cellProps } = cell.getCellProps();
                            return (
                              <td key={key} {...cellProps}>
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
                        No activity records found for the selected date range.
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

      {/* Add CSS for the current time display */}
      <style jsx="true">{`
        .current-time-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: #f9f9f9;
          padding: 10px 15px;
          border-radius: 4px;
          margin: 10px 0;
          border-left: 4px solid #1890ff;
          flex-wrap: wrap;
        }
        
        .time-info, .user-info {
          display: flex;
          align-items: center;
          margin-right: 20px;
          margin-bottom: 5px;
        }
        
        .time-label, .user-label {
          font-weight: bold;
          margin-right: 8px;
        }
        
        .time-value, .user-value {
          font-family: monospace;
        }
        
        .timezone-info {
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 15px;
        }
        
        .timezone-note {
          font-style: italic;
        }
      `}</style>
    </div>
  );
};

export default ActivityVisualization;