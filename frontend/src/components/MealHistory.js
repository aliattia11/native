import React, { useState, useEffect } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import './MealHistory.css';

const formatDateTime = (timestamp) => {
  if (!timestamp) return 'Invalid date';
  try {
    // Parse timestamp as UTC, then format in local timezone
    return moment.utc(timestamp).local().format('MM/DD/YYYY, HH:mm:ss');
  } catch (error) {
    return 'Invalid date';
  }
};

const formatFoodItems = (foodItems) => {
  if (!Array.isArray(foodItems) || foodItems.length === 0) return "No items";
  const formattedItems = foodItems
    .map(item => {
      if (!item?.name) return null;
      const amount = item.portion?.amount || '';
      const unit = item.portion?.unit || '';
      return `${amount} ${unit} ${item.name}`.trim();
    })
    .filter(Boolean);

  return formattedItems.length ? formattedItems.join(", ") : "No items";
};

// Entry type determination function
const determineEntryType = (meal) => {
  if (meal.mealType === 'blood_sugar_only' || (meal.bloodSugar && !meal.foodItems?.length && !meal.intendedInsulin)) {
    return 'blood_sugar';
  } else if (meal.activities?.length > 0 && !meal.foodItems?.length && !meal.intendedInsulin && !meal.bloodSugar) {
    return 'activity';
  } else if (meal.intendedInsulin && !meal.foodItems?.length && !meal.activities?.length) {
    return 'insulin';
  } else {
    return 'meal'; // Default is meal (includes food)
  }
};

const MealHistory = ({ isDoctor = false, patientId = null }) => {
  const [allRecords, setAllRecords] = useState([]); // Store all fetched records
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [debug, setDebug] = useState({});

  // Filter state
  const [activeFilter, setActiveFilter] = useState('all');

  // Pagination state
  const [pagination, setPagination] = useState({
    total: 0,  // Total records in the database
    filteredTotal: 0,  // Total records after filtering
    limit: 20, // Records per page
    fetchLimit: 200 // For initial large fetch when filtering
  });

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Function to fetch all records (or a large batch) for client-side filtering
  const fetchAllRecords = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      let url = 'http://localhost:5000/api/meals';
      if (isDoctor && patientId) {
        url = `http://localhost:5000/api/doctor/meal-history/${patientId}`;
      }

      console.log(`Fetching larger batch of records for filtering from URL: ${url} with limit=${pagination.fetchLimit}`);

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          skip: 0,
          limit: pagination.fetchLimit
        }
      });

      console.log('Response data:', response.data);
      setDebug(response.data);

      // Get total count from pagination info
      if (response.data.pagination) {
        setPagination(prev => ({
          ...prev,
          total: response.data.pagination.total
        }));
        console.log(`Total records in database: ${response.data.pagination.total}`);
      }

      // Process all fetched records
      const meals = Array.isArray(response.data) ? response.data : response.data.meals || [];
      console.log(`Fetched ${meals.length} meals for filtering`);

      // Process data to enhance with additional formatting
      const processedMeals = meals.map(meal => {
        const entryType = determineEntryType(meal);

        return {
          ...meal,
          formattedTimestamp: formatDateTime(meal.timestamp),
          formattedBloodSugarTimestamp: formatDateTime(meal.bloodSugarTimestamp),
          mealType: meal.mealType || 'unknown',
          foodItems: meal.foodItems || [],
          activities: meal.activities || [],
          nutrition: meal.nutrition || {},
          id: meal.id || `temp_${Math.random().toString(36).substr(2, 9)}`,
          suggestedInsulin: meal.suggestedInsulin !== undefined ? meal.suggestedInsulin : 0,
          intendedInsulin: meal.intendedInsulin,
          entryType: entryType
        };
      });

      // Store all records and apply filtering
      setAllRecords(processedMeals);

      // Initial filtering based on active filter
      applyFilter(activeFilter, processedMeals);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching meal history:', err);
      setError(err.message || 'Failed to load meal history');
      setLoading(false);
    }
  };

  // Function to apply filter to records
  const applyFilter = (filterType, records = allRecords) => {
    let filtered;

    if (filterType === 'all') {
      filtered = records;
    } else {
      filtered = records.filter(record => record.entryType === filterType);
    }

    // Update filtered data and pagination information
    setFilteredData(filtered);
    setPagination(prev => ({
      ...prev,
      filteredTotal: filtered.length
    }));

    console.log(`Applied filter '${filterType}': ${filtered.length} records match`);
  };

  // Initial data fetching on component mount
  useEffect(() => {
    fetchAllRecords();
  }, [isDoctor, patientId]);

  // Handle filter changes
  const handleFilterChange = (newFilter) => {
    setActiveFilter(newFilter);
    applyFilter(newFilter);

    // Reset current page when filter changes
    if (tableInstance.current) {
      tableInstance.current.gotoPage(0);
    }
  };

  // Create a ref to access table instance methods
  const tableInstance = React.useRef(null);

  // Table columns definition
  const columns = React.useMemo(
    () => [
      {
        Header: 'Date/Time',
        accessor: 'formattedTimestamp',
      },
      {
        Header: 'Type',
        accessor: (row) => {
          switch(row.entryType) {
            case 'blood_sugar': return 'Blood Sugar';
            case 'activity': return 'Activity';
            case 'insulin': return 'Insulin';
            case 'meal': return row.mealType?.charAt(0).toUpperCase() + row.mealType?.slice(1).toLowerCase() || 'Meal';
            default: return row.mealType?.charAt(0).toUpperCase() + row.mealType?.slice(1).toLowerCase() || 'N/A';
          }
        }
      },
      {
        Header: 'Food Items',
        accessor: (row) => formatFoodItems(row.foodItems),
      },
      {
        Header: 'Blood Sugar',
        accessor: (row) => row.bloodSugar ? `${row.bloodSugar} mg/dL` : 'N/A',
        Cell: ({ row }) => {
          const value = row.original.bloodSugar;
          if (!value) return <span>N/A</span>;

          return (
            <span title={row.original.formattedBloodSugarTimestamp || 'No timestamp'}>
              {value} mg/dL
            </span>
          );
        }
      },
      {
        Header: 'Insulin (S/I)',
        accessor: (row) => `${row.suggestedInsulin || 'N/A'}/${row.intendedInsulin || 'N/A'}`
      },
      {
        // Add new column to show if record is imported
        Header: 'Source',
        accessor: (row) => row.imported_at ? 'Imported' : 'Direct',
        Cell: ({ value }) => (
          <span className={value === 'Imported' ? 'imported-badge' : ''}>
            {value}
          </span>
        )
      }
    ],
    []
  );

  // Table instance
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
  } = useTable(
    {
      columns,
      data: filteredData,
      initialState: {
        pageIndex: 0,
        pageSize: pagination.limit,
        sortBy: [{ id: 'formattedTimestamp', desc: true }] // Default sort by timestamp descending
      }
    },
    useSortBy,
    usePagination
  );

  // Assign table instance to ref
  React.useEffect(() => {
    tableInstance.current = {
      gotoPage,
      nextPage,
      previousPage,
      setPageSize,
      pageCount,
      pageIndex
    };
  }, [gotoPage, nextPage, previousPage, setPageSize, pageCount, pageIndex]);

  // Modal Component
  const MealDetailsModal = ({ meal, onClose }) => {
    if (!meal) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>
              {meal.entryType === 'blood_sugar' ? 'Blood Sugar Reading' :
               meal.entryType === 'activity' ? 'Activity Record' :
               meal.entryType === 'insulin' ? 'Insulin Record' :
               `${meal.mealType} - ${meal.formattedTimestamp}`}
            </h3>
            <button onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="meal-metrics">
              {meal.bloodSugar && (
                <div>
                  Blood Sugar: {meal.bloodSugar || 'N/A'} mg/dL
                  {meal.bloodSugarTimestamp && (
                    <div className="timestamp-info">
                      Reading time: {formatDateTime(meal.bloodSugarTimestamp)}
                    </div>
                  )}
                </div>
              )}
              {meal.suggestedInsulin && <div>Suggested Insulin: {meal.suggestedInsulin || 'N/A'} units</div>}
              {meal.intendedInsulin && <div>Intended Insulin: {meal.intendedInsulin || 'N/A'} units</div>}
              {meal.imported_at && (
                <div className="imported-info">
                  Imported on: {formatDateTime(meal.imported_at)}
                </div>
              )}
            </div>

            {meal.foodItems && meal.foodItems.length > 0 && (
              <>
                <h4>Food Items</h4>
                <ul>
                  {meal.foodItems.map((item, idx) => (
                    <li key={idx}>{item.portion?.amount} {item.portion?.unit} {item.name}</li>
                  ))}
                </ul>
              </>
            )}

            {meal.activities && meal.activities.length > 0 && (
              <>
                <h4>Activities</h4>
                <ul>
                  {meal.activities.map((activity, idx) => (
                    <li key={idx}>
                      Level: {activity.level}, Duration: {activity.duration}
                      {activity.type && `, Type: ${activity.type}`}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {meal.notes && (
              <>
                <h4>Notes</h4>
                <p>{meal.notes}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Refresh data
  const handleRefresh = () => {
    fetchAllRecords();
  };

  if (loading && filteredData.length === 0) return <div>Loading meal history...</div>;

  return (
    <div>
      <h2>Meal History</h2>

      {/* Add timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      <div className="action-row">
        <div className="filter-controls">
          <span className="filter-label">Filter by: </span>
          <div className="filter-buttons">
            <button
              className={`filter-button ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => handleFilterChange('all')}
            >
              All Records
            </button>
            <button
              className={`filter-button ${activeFilter === 'meal' ? 'active' : ''}`}
              onClick={() => handleFilterChange('meal')}
            >
              Meals
            </button>
            <button
              className={`filter-button ${activeFilter === 'blood_sugar' ? 'active' : ''}`}
              onClick={() => handleFilterChange('blood_sugar')}
            >
              Blood Sugar
            </button>
            <button
              className={`filter-button ${activeFilter === 'activity' ? 'active' : ''}`}
              onClick={() => handleFilterChange('activity')}
            >
              Activity
            </button>
            <button
              className={`filter-button ${activeFilter === 'insulin' ? 'active' : ''}`}
              onClick={() => handleFilterChange('insulin')}
            >
              Insulin
            </button>
          </div>
        </div>

        <div className="action-buttons">
          <button onClick={handleRefresh} className="refresh-button" disabled={loading}>
            {loading ? "Loading..." : "Refresh Data"}
          </button>
        </div>
      </div>

      {/* Add counter for total records */}
      <div className="records-info">
        <span>
          {loading
            ? "Loading records..."
            : `Showing ${filteredData.length} ${activeFilter !== 'all' ? activeFilter : ''} records`}
        </span>
        <span> (Total in database: {pagination.total})</span>
        {pagination.filteredTotal < pagination.total && activeFilter !== 'all' && (
          <span className="filter-info">
            {` — ${pagination.filteredTotal} match your filter`}
          </span>
        )}
        {pagination.filteredTotal >= pagination.fetchLimit && (
          <span className="warning-info">
            {` — showing first ${pagination.fetchLimit} records only`}
          </span>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="table-container">
        <table {...getTableProps()} style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            {headerGroups.map(headerGroup => {
              const { key: headerGroupKey, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
              return (
                <tr key={headerGroupKey} {...headerGroupProps}>
                  {headerGroup.headers.map(column => {
                    const { key, ...headerProps } = column.getHeaderProps(column.getSortByToggleProps());
                    return (
                      <th
                        key={key}
                        {...headerProps}
                        style={{
                          borderBottom: 'solid 3px #ddd',
                          background: '#f0f0f0',
                          padding: '8px',
                          textAlign: 'left'
                        }}
                      >
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
                  <th style={{
                    borderBottom: 'solid 3px #ddd',
                    background: '#f0f0f0',
                    padding: '8px',
                    textAlign: 'left'
                  }}>
                    Actions
                  </th>
                </tr>
              );
            })}
          </thead>
          <tbody {...getTableBodyProps()}>
            {page.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '20px' }}>
                  {loading ?
                    "Loading records..." :
                    `No records found ${activeFilter !== 'all' ? `for filter: ${activeFilter}` : ''}`
                  }
                </td>
              </tr>
            ) : (
              page.map(row => {
                prepareRow(row);
                const { key: rowKey, ...rowProps } = row.getRowProps();
                const entryTypeClass = `entry-${row.original.entryType.replace('_', '-')}`;

                return (
                  <tr
                    key={rowKey}
                    {...rowProps}
                    className={`${row.original.imported_at ? 'imported-row' : ''} ${entryTypeClass}`}
                  >
                    {row.cells.map(cell => {
                      const { key, ...cellProps } = cell.getCellProps();
                      return (
                        <td
                          key={key}
                          {...cellProps}
                          style={{
                            padding: '8px',
                            borderBottom: 'solid 1px #ddd'
                          }}
                        >
                          {cell.render('Cell')}
                        </td>
                      );
                    })}
                    <td style={{
                      padding: '8px',
                      borderBottom: 'solid 1px #ddd'
                    }}>
                      <button
                        onClick={() => setSelectedMeal(row.original)}
                        className="details-button"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Enhanced pagination controls */}
      <div className="pagination-controls">
        <div>
          <button onClick={() => gotoPage(0)} disabled={!canPreviousPage || loading}>
            {'<<'}
          </button>
          <button onClick={() => previousPage()} disabled={!canPreviousPage || loading}>
            {'<'}
          </button>
          <button onClick={() => nextPage()} disabled={!canNextPage || loading}>
            {'>'}
          </button>
          <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage || loading}>
            {'>>'}
          </button>
          <span>
            Page{' '}
            <strong>
              {pageIndex + 1} of {pageOptions.length || 1}
            </strong>
          </span>
        </div>
        <div className="page-size-selector">
          <span>Show </span>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            disabled={loading}
          >
            {[10, 20, 50, 100].map(size => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span> records per page</span>
        </div>
      </div>

      {selectedMeal && (
        <MealDetailsModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
        />
      )}

      <style jsx="true">{`
        .timestamp-info {
          font-size: 0.85em;
          color: #666;
          margin-top: 3px;
          font-style: italic;
        }
        
        .timezone-info {
          font-size: 0.9rem;
          color: #666;
          margin-bottom: 15px;
        }
        
        .timezone-note {
          font-style: italic;
        }

        .imported-row {
          background-color: #f9f9f9;
        }

        .imported-badge {
          background-color: #e6f7ff;
          border: 1px solid #91d5ff;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 0.8em;
        }

        .imported-info {
          font-size: 0.85em;
          color: #1890ff;
          margin-top: 3px;
        }

        .action-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          flex-wrap: wrap;
        }

        .filter-controls {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 10px;
        }

        .filter-label {
          margin-right: 10px;
          font-weight: bold;
        }

        .filter-buttons {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }

        .filter-button {
          padding: 6px 12px;
          background-color: #f0f0f0;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9em;
          transition: all 0.2s;
        }

        .filter-button:hover {
          background-color: #e6f7ff;
          border-color: #91d5ff;
        }

        .filter-button.active {
          background-color: #1890ff;
          border-color: #1890ff;
          color: white;
        }

        .action-buttons {
          margin-bottom: 15px;
        }

        .refresh-button {
          background-color: #1890ff;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 6px 12px;
          cursor: pointer;
        }

        .refresh-button:hover:not(:disabled) {
          background-color: #40a9ff;
        }
        
        .refresh-button:disabled {
          background-color: #bfbfbf;
          cursor: not-allowed;
        }

        .error-message {
          color: #ff4d4f;
          padding: 10px;
          margin-bottom: 15px;
          border: 1px solid #ffccc7;
          border-radius: 4px;
          background-color: #fff2f0;
        }

        .records-info {
          margin-bottom: 10px;
          font-size: 0.9em;
          color: #666;
        }
        
        .filter-info {
          color: #1890ff;
        }
        
        .warning-info {
          color: #fa8c16;
        }
        
        .details-button {
          padding: 4px 8px;
          background-color: #f0f0f0;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .details-button:hover {
          background-color: #1890ff;
          border-color: #1890ff;
          color: white;
        }
        
        /* Table container with potential horizontal scroll */
        .table-container {
          overflow-x: auto;
        }
        
        /* Pagination controls styling */
        .pagination-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          flex-wrap: wrap;
        }
        
        .pagination-controls button {
          margin: 0 5px;
          padding: 5px 10px;
          border: 1px solid #d9d9d9;
          background-color: white;
          cursor: pointer;
          border-radius: 4px;
        }
        
        .pagination-controls button:disabled {
          color: #d9d9d9;
          cursor: not-allowed;
        }
        
        .pagination-controls button:not(:disabled):hover {
          background-color: #e6f7ff;
          border-color: #1890ff;
        }
        
        .page-size-selector {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        
        .page-size-selector select {
          padding: 5px;
          border-radius: 4px;
          border: 1px solid #d9d9d9;
        }
        
        /* Entry type color indicators */
        .entry-meal {
          border-left: 4px solid #52c41a;
        }
        
        .entry-blood-sugar {
          border-left: 4px solid #faad14;
        }
        
        .entry-activity {
          border-left: 4px solid #1890ff;
        }
        
        .entry-insulin {
          border-left: 4px solid #f5222d;
        }
      `}</style>
    </div>
  );
};

export default MealHistory;