import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import './BloodSugarVisualization.css';

const BloodSugarVisualization = ({ isDoctor = false, patientId = null }) => {
  // Shared state
  const [data, setData] = useState([]);
  const [targetGlucose, setTargetGlucose] = useState(100);
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('mg/dL');
  const [activeView, setActiveView] = useState('chart'); // 'chart' or 'table'
  const [userTimeZone, setUserTimeZone] = useState('');

  // Get user's time zone info on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      let url = `http://localhost:5000/api/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`;
      if (isDoctor && patientId) {
        url = `http://localhost:5000/doctor/patient/${patientId}/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Process the data to use bloodSugarTimestamp instead of timestamp
      const formattedData = response.data.map(item => {
        // Use reading time (bloodSugarTimestamp) if available, otherwise use recording time (timestamp)
        const readingTime = item.bloodSugarTimestamp || item.timestamp;

        // Parse the UTC timestamps explicitly to ensure correct timezone handling
        const localReadingTime = moment.utc(readingTime).local();
        const localRecordingTime = moment.utc(item.timestamp).local();

        return {
          ...item,
          // Convert to timestamp for chart (in local time)
          readingTime: localReadingTime.valueOf(),
          // Format for display in local time
          formattedReadingTime: localReadingTime.format('MM/DD/YYYY, HH:mm'),
          formattedRecordingTime: localRecordingTime.format('MM/DD/YYYY, HH:mm'),
          // Status based on target glucose
          status: getBloodSugarStatus(item.bloodSugar, item.target || targetGlucose)
        };
      });

      // Sort by reading time
      formattedData.sort((a, b) => a.readingTime - b.readingTime);
      setData(formattedData);

      // Update target glucose if available from the first reading
      if (formattedData.length > 0 && formattedData[0].target) {
        setTargetGlucose(formattedData[0].target);
      }

      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching blood sugar data:', error);
      setError('Failed to fetch blood sugar data. Please try again.');
      setLoading(false);
    }
  }, [dateRange, isDoctor, patientId, unit, targetGlucose]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getBloodSugarStatus = (bloodSugar, target) => {
    const statusMap = {
      'low': { color: '#ff4444', label: 'Low' },
      'normal': { color: '#00C851', label: 'Normal' },
      'high': { color: '#ff8800', label: 'High' }
    };

    if (bloodSugar < target * 0.7) return statusMap.low;
    if (bloodSugar > target * 1.3) return statusMap.high;
    return statusMap.normal;
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const handleUnitChange = (e) => {
    setUnit(e.target.value);
  };

  // Quick date range presets
  const applyDatePreset = (days) => {
    setDateRange({
      start: moment().subtract(days, 'days').format('YYYY-MM-DD'),
      end: moment().format('YYYY-MM-DD')
    });
  };

  // Chart-specific functions
  const formatXAxis = (tickItem) => {
    // Format the timestamp using the user's local timezone
    return moment(tickItem).format('DD/MM HH:mm');
  };

  const formatYAxis = (value) => {
    return `${value} ${unit}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{`Reading Time: ${moment(label).format('MM/DD/YYYY, HH:mm')}`}</p>
          <p className="tooltip-value" style={{ color: item.status.color }}>
            {`Blood Sugar: ${payload[0].value} ${unit}`}
          </p>
          <p className="tooltip-status">Status: {item.status.label}</p>
          {item.notes && <p className="tooltip-notes">Notes: {item.notes}</p>}
        </div>
      );
    }
    return null;
  };

  // Table-specific functions
  const columns = React.useMemo(
    () => [
      {
        Header: 'Reading Time',
        accessor: 'formattedReadingTime',
      },
      {
        Header: 'Recording Time',
        accessor: 'formattedRecordingTime',
      },
      {
        Header: `Blood Sugar (${unit})`,
        accessor: 'bloodSugar',
        Cell: ({ value, row }) => (
          <span style={{ color: row.original.status.color, fontWeight: 500 }}>
            {value !== undefined && value !== null ? value : 'N/A'} {unit}
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
            <div className="status-dot" style={{ backgroundColor: row.original.status.color }}></div>
            <span>{row.original.status.label}</span>
          </div>
        ),
      },
      {
        Header: 'Notes',
        accessor: 'notes',
        Cell: ({ value }) => (
          <div className="notes-cell">{value || 'No notes'}</div>
        ),
      },
    ],
    [unit, targetGlucose]
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

  return (
    <div className="blood-sugar-visualization">
      <h2 className="title">Blood Sugar Data</h2>

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
          Chart View
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

        <div className="unit-selector">
          <label htmlFor="unit-select">Unit:</label>
          <select id="unit-select" value={unit} onChange={handleUnitChange}>
            <option value="mg/dL">mg/dL</option>
            <option value="mmol/L">mmol/L</option>
          </select>
        </div>

        <button className="update-btn" onClick={fetchData}>Update Data</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading blood sugar data...</div>
      ) : data.length === 0 ? (
        <div className="no-data">No blood sugar readings found for the selected date range.</div>
      ) : (
        <div className="content-container">
          {activeView === 'chart' && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={data}
                  margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="readingTime"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    interval="preserveStartEnd"
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

                  <Line
                    type="monotone"
                    dataKey="bloodSugar"
                    name={`Blood Sugar (${unit})`}
                    stroke="#8884d8"
                    activeDot={{ r: 8 }}
                    dot={{
                      stroke: (datum) => datum.status.color,
                      strokeWidth: 2,
                      r: 4,
                      fill: '#fff'
                    }}
                  />
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
                  {page.map(row => {
                    prepareRow(row);
                    const { key, ...rowProps } = row.getRowProps();
                    return (
                      <tr
                        key={key}
                        {...rowProps}
                        className={`status-${row.original.status.label.toLowerCase()}`}
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
                  Page {' '}
                  <strong>
                    {pageIndex + 1} of {pageOptions.length}
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