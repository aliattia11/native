import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import './BaseTimeSeriesVisualization.css';

/**
 * BaseTimeSeriesVisualization - A reusable component for time series data visualization
 *
 * This component provides the foundation for various time-based visualizations
 * across the application. It handles common functionality like time range selection,
 * chart rendering, and table views.
 */
const BaseTimeSeriesVisualization = ({
  title = 'Time Series Data',
  apiEndpoint,
  dataKey = 'value',
  dateKey = 'timestamp',
  lineColor = '#8884d8',
  lineWidth = 2,
  referenceLines = [],
  showControls = true,
  height = '400px',
  onDataLoaded = null,
  dateRange: initialDateRange = null,
  defaultView = 'chart',
  embedded = false,
  customApiEndpoint = null,
  chartConfig = {},
  // Data transformation functions (can be overridden by extending components)
  transformApiData = null,
  renderTooltipContent = null,
  renderDot = null,
  renderCustomLegend = null,
  additionalQueryParams = {},
  tableColumns = [],
  // Allow extending components to add custom line configurations
  additionalLines = [],
  // Flags for common features
  showCurrentTimeLine = true,
  // Additional elements to be rendered
  additionalControls = null,
  additionalChartElements = null,
  dataFetchDeps = [], // Dependencies for data fetching
}) => {
  // State for shared functionality
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [dateRange, setDateRange] = useState(initialDateRange || {
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState(defaultView);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [timeScale, setTimeScale] = useState({
    start: moment().subtract(7, 'days').valueOf(),
    end: moment().valueOf(),
    tickInterval: 12, // in hours
    tickFormat: 'DD/MM HH:mm'
  });
  const [currentTime, setCurrentTime] = useState(moment().valueOf());
  const [currentDateTime, setCurrentDateTime] = useState(moment().format("YYYY-MM-DD HH:mm:ss"));

  // Reference for chart container
  const chartRef = useRef(null);

  // Get user's time zone info on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Filter data based on timeScale
  useEffect(() => {
    // Only keep data points that fall within the time scale
    if (data.length > 0) {
      const filtered = data.filter(item => {
        const itemTime = item[dateKey] || item.readingTime || item.timestamp;
        return itemTime >= timeScale.start && itemTime <= timeScale.end;
      });
      setFilteredData(filtered);
    } else {
      setFilteredData([]);
    }
  }, [data, timeScale, dateKey]);

  // Process filtered data (can be extended by child components)
  useEffect(() => {
    setProcessedData(filteredData);
  }, [filteredData]);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = moment();
      setCurrentTime(now.valueOf());
      setCurrentDateTime(now.format("YYYY-MM-DD HH:mm:ss"));
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Update time scale when date range changes
  const updateTimeScale = useCallback(() => {
    const startMoment = moment(dateRange.start).startOf('day');
    const endMoment = moment(dateRange.end).endOf('day');
    const diffDays = endMoment.diff(startMoment, 'days');

    let tickInterval, tickFormat;

    // Determine scaling based on the date range
    if (diffDays <= 1) {
      // Last 24 hours - 2 hour ticks
      tickInterval = 2;
      tickFormat = 'HH:mm';
    } else if (diffDays <= 7) {
      // Last week - 12 hour ticks
      tickInterval = 12;
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
    let current = moment(timeScale.start).startOf('hour');
    const end = moment(timeScale.end);

    // Align ticks to exact hour boundaries for consistent grid alignment
    while (current.isBefore(end)) {
      ticks.push(current.valueOf());
      current = current.add(timeScale.tickInterval, 'hours');
    }

    return ticks;
  }, [timeScale]);

  // Generic data fetching function
  const fetchData = useCallback(async () => {
    if (!apiEndpoint && !customApiEndpoint) {
      console.error("No API endpoint provided for data fetching");
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      // Use custom endpoint if provided, otherwise use default endpoint
      let url = customApiEndpoint || apiEndpoint;

      // Add query parameters
      const separator = url.includes('?') ? '&' : '?';
      const queryParams = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        ...additionalQueryParams
      }).toString();

      url = `${url}${separator}${queryParams}`;

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Process the response data
      let formattedData = response.data;

      // Use custom transform function if provided
      if (transformApiData) {
        formattedData = transformApiData(response.data);
      }

      setData(formattedData);

      // Update time scale after fetching data
      updateTimeScale();

      if (onDataLoaded) {
        onDataLoaded(formattedData);
      }

      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(`Failed to fetch data: ${error.message || 'Unknown error'}`);
      setLoading(false);
    }
  }, [apiEndpoint, customApiEndpoint, dateRange, updateTimeScale, transformApiData, onDataLoaded, additionalQueryParams, ...dataFetchDeps]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    updateTimeScale();
  }, [dateRange, updateTimeScale]);

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  // Quick date range presets
  const applyDatePreset = (days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');

    // Set the end date based on the preset type
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

    setDateRange({
      start: start,
      end: end
    });
  };

  // Chart-specific functions
  const formatXAxis = (tickItem) => {
    // Format the timestamp using the user's local timezone
    return moment(tickItem).format(timeScale.tickFormat);
  };

  // Generate custom ticks based on time scale
  const ticks = generateTicks();

  // Determine if current time is within chart range
  const currentTimeInRange = currentTime >= timeScale.start && currentTime <= timeScale.end;

  // Default tooltip if not overridden
  const DefaultTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dataItem = payload[0]?.payload;
      if (!dataItem) return null;

      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{`Time: ${moment(dataItem[dateKey]).format('MM/DD/YYYY, HH:mm')}`}</p>
          <p className="tooltip-value">{`${dataKey}: ${dataItem[dataKey]}`}</p>
        </div>
      );
    }
    return null;
  };

  // Default dot renderer
  const DefaultDot = (props) => {
    const { cx, cy, stroke } = props;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        stroke={stroke}
        strokeWidth={2}
        fill="#ffffff"
      />
    );
  };

  // Use the table instance with the provided columns
  const defaultColumns = [
    {
      Header: 'Time',
      accessor: row => moment(row[dateKey]).format('MM/DD/YYYY, HH:mm'),
    },
    {
      Header: dataKey,
      accessor: dataKey,
    }
  ];

  const tableInstance = useTable(
    {
      columns: tableColumns.length > 0 ? tableColumns : defaultColumns,
      data: processedData,
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

  return (
    <div className={`time-series-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">{title}</h2>}

      {/* Display current date and time info */}
      <div className="time-info">
        <span className="time-label">Current: {currentDateTime} | </span>
        <span className="timezone-label">Timezone: {userTimeZone}</span>
      </div>

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

          {additionalControls}

          <button className="update-btn" onClick={fetchData}>Update Data</button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading data...</div>
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
                    dataKey={dateKey}
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
                  <YAxis />
                  <Tooltip content={renderTooltipContent || <DefaultTooltip />} />
                  <Legend content={renderCustomLegend} />

                  {/* Reference lines if provided */}
                  {referenceLines.map((line, index) => (
                    <ReferenceLine
                      key={`ref-line-${index}`}
                      y={line.value}
                      label={{ value: line.label, position: 'right' }}
                      stroke={line.color}
                      strokeDasharray={line.strokeDasharray || "3 3"}
                    />
                  ))}

                  {/* Current time reference line if enabled */}
                  {showCurrentTimeLine && currentTimeInRange && (
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

                  {/* Main data line */}
                  <Line
                    dataKey={dataKey}
                    name={dataKey}
                    data={processedData}
                    stroke={lineColor}
                    strokeWidth={lineWidth}
                    isAnimationActive={false}
                    dot={renderDot || <DefaultDot />}
                    connectNulls={false}
                  />

                  {/* Additional lines if provided */}
                  {additionalLines.map((line, index) => (
                    <Line
                      key={`line-${index}`}
                      {...line}
                      isAnimationActive={false}
                    />
                  ))}

                  {/* Additional chart elements if any */}
                  {additionalChartElements}
                </LineChart>
              </ResponsiveContainer>

              {renderCustomLegend && renderCustomLegend({
                payload: [
                  { value: dataKey, color: lineColor },
                  ...additionalLines.map(line => ({
                    value: line.name || line.dataKey,
                    color: line.stroke || '#000'
                  }))
                ]
              })}

              {/* Display message if no data points are in the current range */}
              {processedData.length === 0 && (
                <div className="no-data-overlay">
                  No data found in the selected date range
                </div>
              )}
            </div>
          )}

          {activeView === 'table' && !embedded && (
            <div className="table-container">
              <table {...getTableProps()} className="data-table">
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
                        <tr key={key} {...rowProps}>
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
                      <td colSpan={tableColumns.length || defaultColumns.length} className="no-data">
                        No data found for the selected date range.
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

export default BaseTimeSeriesVisualization;