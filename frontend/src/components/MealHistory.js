import React, { useState, useEffect, useRef } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import { FaFileImport, FaSync } from 'react-icons/fa';
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

const MealHistory = ({ isDoctor = false, patientId = null }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importStatus, setImportStatus] = useState(null);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const fetchMealHistory = async () => {
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

      console.log('Fetching from URL:', url); // Debug log

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Response data:', response.data); // Debug log

      // Ensure we're handling the response data correctly
      const meals = Array.isArray(response.data) ? response.data : response.data.meals || [];

      // Process data to enhance with additional formatting
      const processedMeals = meals.map(meal => {
        return {
          ...meal,
          formattedTimestamp: formatDateTime(meal.timestamp),
          formattedBloodSugarTimestamp: formatDateTime(meal.bloodSugarTimestamp)
        };
      });

      setData(processedMeals);
      setError('');
    } catch (err) {
      console.error('Error fetching meal history:', err);
      setError(err.message || 'Failed to load meal history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMealHistory();
  }, [isDoctor, patientId]);

  const handleRefresh = () => {
    fetchMealHistory();
  };

  // Handle import button click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Handle file upload for import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file extension
    const fileExt = file.name.split('.').pop().toLowerCase();
    if (fileExt !== 'csv' && fileExt !== 'json') {
      setImportStatus({
        type: 'error',
        message: 'Invalid file format. Please select a CSV or JSON file.'
      });
      return;
    }

    setIsImporting(true);
    setImportStatus({ type: 'info', message: 'Validating file...' });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'meals');

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // First validate the file
      const validationResponse = await axios.post(
        'http://localhost:5000/api/import/validate',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (!validationResponse.data.valid) {
        setImportStatus({
          type: 'error',
          message: 'File validation failed',
          details: validationResponse.data.errors?.join('\n')
        });
        return;
      }

      // If validation passes, proceed with import
      setImportStatus({ type: 'info', message: 'Importing data...' });

      const importResponse = await axios.post(
        'http://localhost:5000/api/import',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const results = importResponse.data.results;

      setImportStatus({
        type: 'success',
        message: `Successfully imported ${results.meals_imported || 0} meals`,
      });

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Refresh the meal history to show newly imported data
      fetchMealHistory();

    } catch (error) {
      console.error('Error importing data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to import data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsImporting(false);
    }
  };

  const columns = React.useMemo(
    () => [
      {
        Header: 'Date/Time',
        accessor: 'formattedTimestamp',
      },
      {
        Header: 'Meal Type',
        accessor: 'mealType',
        Cell: ({ value }) => value?.charAt(0).toUpperCase() + value?.slice(1).toLowerCase() || 'N/A'
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
    state: { pageIndex, pageSize },
  } = useTable(
    {
      columns,
      data,
      initialState: { pageIndex: 0, pageSize: 10 },
    },
    useSortBy,
    usePagination
  );

  // Modal Component
  const MealDetailsModal = ({ meal, onClose }) => {
    if (!meal) return null;

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3>{meal.mealType} - {meal.formattedTimestamp}</h3>
            <button onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="meal-metrics">
              <div>
                Blood Sugar: {meal.bloodSugar || 'N/A'} mg/dL
                {meal.bloodSugarTimestamp && (
                  <div className="timestamp-info">
                    Reading time: {formatDateTime(meal.bloodSugarTimestamp)}
                  </div>
                )}
              </div>
              <div>Suggested Insulin: {meal.suggestedInsulin || 'N/A'} units</div>
              <div>Intended Insulin: {meal.intendedInsulin || 'N/A'} units</div>
            </div>
            <h4>Food Items</h4>
            {meal.foodItems && meal.foodItems.length > 0 ? (
              <ul>
                {meal.foodItems.map((item, idx) => (
                  <li key={idx}>{item.portion?.amount} {item.portion?.unit} {item.name}</li>
                ))}
              </ul>
            ) : (
              <p>No food items recorded</p>
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

  return (
    <div className="meal-history-container">
      <div className="header-section">
        <h2>Meal History</h2>
        <div className="action-buttons">
          <button
            className="refresh-button"
            onClick={handleRefresh}
            title="Refresh meal history"
          >
            <FaSync className={loading ? "spin" : ""} />
          </button>
          <button
            className="import-button"
            onClick={handleImportClick}
            title="Import meals"
            disabled={isImporting}
          >
            <FaFileImport />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept=".csv,.json"
            onChange={handleFileUpload}
          />
        </div>
      </div>

      {/* Add timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      {/* Import Status Message */}
      {importStatus && (
        <div className={`import-status ${importStatus.type}`}>
          <div className="status-message">{importStatus.message}</div>
          {importStatus.details && <div className="status-details">{importStatus.details}</div>}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? <div className="loading-indicator">Loading meal history...</div> : (
        <>
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
                {page.map(row => {
                  prepareRow(row);
                  const { key: rowKey, ...rowProps } = row.getRowProps();
                  return (
                    <tr key={rowKey} {...rowProps}>
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
                })}
              </tbody>
            </table>
          </div>

          {data.length === 0 && (
            <div className="no-data-message">
              No meal records found. Add a meal or import meal data.
            </div>
          )}

          <div className="pagination-controls">
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
              {[10, 20, 30, 40, 50].map(pageSize => (
                <option key={pageSize} value={pageSize}>
                  Show {pageSize}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {selectedMeal && (
        <MealDetailsModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
        />
      )}

      <style jsx="true">{`
        .meal-history-container {
          padding: 0.5rem;
        }
        
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }
        
        .refresh-button,
        .import-button {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background-color: #f5f5f5;
          border: 1px solid #ddd;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .refresh-button:hover,
        .import-button:hover {
          background-color: #e0e0e0;
        }
        
        .refresh-button:hover {
          color: #2196F3;
        }
        
        .import-button:hover {
          color: #4CAF50;
        }
        
        .spin {
          animation: spin 1s infinite linear;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
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
        
        .import-status {
          margin: 1rem 0;
          padding: 0.75rem;
          border-radius: 4px;
        }
        
        .info {
          background-color: #e3f2fd;
          border: 1px solid #bbdefb;
          color: #0d47a1;
        }
        
        .success {
          background-color: #e8f5e9;
          border: 1px solid #c8e6c9;
          color: #1b5e20;
        }
        
        .error {
          background-color: #ffebee;
          border: 1px solid #ffcdd2;
          color: #b71c1c;
        }
        
        .status-details {
          margin-top: 0.5rem;
          font-family: monospace;
          white-space: pre-wrap;
          background-color: rgba(0,0,0,0.05);
          padding: 0.5rem;
          border-radius: 3px;
        }
        
        .error-message {
          color: #d32f2f;
          background-color: #ffebee;
          padding: 0.75rem;
          margin: 1rem 0;
          border-radius: 4px;
          border-left: 3px solid #d32f2f;
        }
        
        .loading-indicator {
          text-align: center;
          padding: 2rem;
          color: #666;
        }
        
        .no-data-message {
          text-align: center;
          padding: 2rem;
          color: #666;
          font-style: italic;
          background-color: #f5f5f5;
          border-radius: 4px;
        }
        
        .details-button {
          padding: 4px 8px;
          background-color: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .details-button:hover {
          background-color: #e0e0e0;
        }
        
        .pagination-controls {
          margin-top: 20px;
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
};

export default MealHistory;