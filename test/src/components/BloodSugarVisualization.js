import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import './BloodSugarVisualization.css';

const BloodSugarVisualization = ({ isDoctor = false, patientId = null }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('chart'); // 'chart' or 'table'
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });
  const [selectedReading, setSelectedReading] = useState(null);

  const fetchCombinedData = async () => {
    try {
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      // Construct the base URL based on whether it's a doctor viewing a patient's data
      const baseUrl = isDoctor && patientId
        ? `http://localhost:5000/api/doctor/patient/${patientId}`
        : 'http://localhost:5000/api';

      // Fetch both meal-related and standalone blood sugar readings
      const [mealsResponse, bloodSugarResponse] = await Promise.all([
        axios.get(`${baseUrl}/meals?start_date=${startDate}&end_date=${endDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${baseUrl}/blood-sugar?start_date=${startDate}&end_date=${endDate}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      // Process meals data to extract blood sugar readings
      const mealReadings = mealsResponse.data.meals
        .filter(meal => meal.bloodSugar)
        .map(meal => ({
          timestamp: new Date(meal.timestamp).getTime(),
          bloodSugar: meal.bloodSugar,
          type: 'meal',
          mealType: meal.mealType,
          notes: meal.notes,
          foodItems: meal.foodItems,
          id: meal._id
        }));

      // Process standalone blood sugar readings
      const standaloneReadings = bloodSugarResponse.data
        .map(reading => ({
          timestamp: new Date(reading.timestamp).getTime(),
          bloodSugar: reading.bloodSugar,
          type: 'standalone',
          notes: reading.notes,
          id: reading._id
        }));

      // Combine and sort all readings
      const combinedData = [...mealReadings, ...standaloneReadings]
        .sort((a, b) => b.timestamp - a.timestamp);

      setData(combinedData);
      setLoading(false);
      setError('');
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch blood sugar data. Please try again.');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCombinedData();
  }, [dateRange, isDoctor, patientId]);

  const columns = React.useMemo(
    () => [
      {
        Header: 'Date/Time',
        accessor: row => moment(row.timestamp).format('DD-MM-YYYY HH:mm'),
        sortType: 'datetime'
      },
      {
        Header: 'Blood Sugar (mg/dL)',
        accessor: 'bloodSugar'
      },
      {
        Header: 'Type',
        accessor: row => row.type === 'meal' ? `Meal (${row.mealType})` : 'Standalone'
      },
      {
        Header: 'Notes',
        accessor: 'notes',
        Cell: ({ value }) => value || '-'
      }
    ],
    []
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
    state: { pageIndex, pageSize }
  } = useTable(
    {
      columns,
      data,
      initialState: { pageIndex: 0, pageSize: 10 }
    },
    useSortBy,
    usePagination
  );

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const reading = data.find(d => d.timestamp === label);
      return (
        <div className="custom-tooltip">
          <p className="time">{moment(label).format('DD-MM-YYYY HH:mm')}</p>
          <p className="blood-sugar">Blood Sugar: {payload[0].value} mg/dL</p>
          <p className="type">{reading?.type === 'meal' ? `Meal (${reading.mealType})` : 'Standalone'}</p>
          {reading?.notes && <p className="notes">Notes: {reading.notes}</p>}
        </div>
      );
    }
    return null;
  };

  // Reading Details Modal
  const ReadingDetailsModal = ({ reading, onClose }) => {
    if (!reading) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Blood Sugar Reading Details</h3>
            <button onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <p><strong>Date/Time:</strong> {moment(reading.timestamp).format('DD-MM-YYYY HH:mm')}</p>
            <p><strong>Blood Sugar:</strong> {reading.bloodSugar} mg/dL</p>
            <p><strong>Type:</strong> {reading.type === 'meal' ? `Meal (${reading.mealType})` : 'Standalone'}</p>

            {reading.type === 'meal' && reading.foodItems && reading.foodItems.length > 0 && (
              <>
                <h4>Food Items:</h4>
                <ul>
                  {reading.foodItems.map((item, index) => (
                    <li key={index}>
                      {item.portion?.amount} {item.portion?.unit} {item.name}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {reading.notes && (
              <>
                <h4>Notes:</h4>
                <p>{reading.notes}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="blood-sugar-visualization">
      <div className="header">
        <h2>Blood Sugar History</h2>
        <div className="view-controls">
          <button
            className={viewMode === 'chart' ? 'active' : ''}
            onClick={() => setViewMode('chart')}
          >
            Chart View
          </button>
          <button
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
          >
            Table View
          </button>
        </div>
      </div>

      <div className="date-range">
        <div className="input-group">
          <label>Start Date:</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          />
        </div>
        <div className="input-group">
          <label>End Date:</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          />
        </div>
        <button onClick={fetchCombinedData}>Update</button>
      </div>

      {loading && <div className="loading">Loading data...</div>}
      {error && <div className="error">{error}</div>}

      {!loading && !error && (
        <div className="content">
          {viewMode === 'chart' ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  data={data}
                  margin={{ top: 5, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={['dataMin', 'dataMax']}
                    tickFormatter={tick => moment(tick).format('DD-MM HH:mm')}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="bloodSugar"
                    stroke="#8884d8"
                    dot={{ onClick: (_, data) => setSelectedReading(data.payload) }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="table-container">
              <table {...getTableProps()} className="blood-sugar-table">
                <thead>
                  {headerGroups.map(headerGroup => (
                    <tr {...headerGroup.getHeaderGroupProps()}>
                      {headerGroup.headers.map(column => (
                        <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                          {column.render('Header')}
                          <span>
                            {column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}
                          </span>
                        </th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  ))}
                </thead>
                <tbody {...getTableBodyProps()}>
                  {page.map(row => {
                    prepareRow(row);
                    return (
                      <tr {...row.getRowProps()}>
                        {row.cells.map(cell => (
                          <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                        ))}
                        <td>
                          <button onClick={() => setSelectedReading(row.original)}>
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="pagination">
                <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
                <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
                <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
                <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
                <span>
                  Page {pageIndex + 1} of {pageOptions.length}
                </span>
                <select
                  value={pageSize}
                  onChange={e => setPageSize(Number(e.target.value))}
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

      {selectedReading && (
        <ReadingDetailsModal
          reading={selectedReading}
          onClose={() => setSelectedReading(null)}
        />
      )}
    </div>
  );
};

export default BloodSugarVisualization;