import React, { useState, useEffect } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import { FaTrash, FaExclamationTriangle } from 'react-icons/fa';

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

// Updated entry type determination function - more flexible for activities
const determineEntryType = (meal) => {
  // First check for explicit activity-only entries
  if (meal.mealType === 'activity_only' || meal.recordingType === 'standalone_activity_recording') {
    return 'activity';
  }

  // Check for blood sugar readings
  if (meal.mealType === 'blood_sugar_only' || (meal.bloodSugar && !meal.foodItems?.length && !meal.intendedInsulin)) {
    return 'blood_sugar';
  }

  // More lenient check for activity entries
  if (meal.activity_ids?.length > 0 && (!meal.foodItems || meal.foodItems.length === 0)) {
    return 'activity';
  }

  // Check for insulin only
  if (meal.intendedInsulin && (!meal.foodItems || meal.foodItems.length === 0) && (!meal.activity_ids || meal.activity_ids.length === 0)) {
    return 'insulin';
  }

  // Default to meal (includes food items)
  return 'meal';
};

const MealHistory = ({ isDoctor = false, patientId = null }) => {
  const [allRecords, setAllRecords] = useState([]); // Store all fetched records
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [debug, setDebug] = useState({});

  // Record deletion state
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Auto-hide messages after 5 seconds
  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Function to fetch all records (or a large batch) for client-side filtering
  const fetchAllRecords = async () => {
    try {
      setLoading(true);
      setMessage({ text: '', type: '' });
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

      // Add type debugging code
      console.log("Types of records found:");
      const typeCounts = {
        meal: 0,
        activity: 0,
        blood_sugar: 0,
        insulin: 0
      };

      // Process data to enhance with additional formatting using the new structure
      const processedMeals = meals.map(meal => {
        const entryType = determineEntryType(meal);
        typeCounts[entryType]++;

        // Log activity entries for debugging
        if (entryType === 'activity' || meal.activity_ids?.length > 0) {
          console.log("Activity record:", {
            id: meal.id,
            type: entryType,
            mealType: meal.mealType,
            recordingType: meal.recordingType,
            activity_ids: meal.activity_ids,
            hasFood: meal.foodItems?.length > 0
          });
        }

        return {
          ...meal,
          formattedTimestamp: formatDateTime(meal.timestamp),
          formattedBloodSugarTimestamp: formatDateTime(meal.bloodSugarTimestamp),
          mealType: meal.mealType || 'unknown',
          foodItems: meal.foodItems || [],
          activity_ids: meal.activity_ids || [],
          nutrition: meal.nutrition || {},
          id: meal.id || `temp_${Math.random().toString(36).substr(2, 9)}`,
          suggestedInsulin: meal.suggestedInsulin !== undefined ? meal.suggestedInsulin : 0,
          intendedInsulin: meal.intendedInsulin,
          entryType: entryType
        };
      });

      console.log("Record type counts:", typeCounts);

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

  // Function to handle record deletion
  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;

    setIsDeleting(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Determine the proper endpoint based on the record type
      let endpoint = `http://localhost:5000/api/meal/${recordToDelete.id}`;

      // Make the DELETE request
      await axios.delete(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Remove the record from local state
      const updatedRecords = allRecords.filter(record => record.id !== recordToDelete.id);
      setAllRecords(updatedRecords);

      // Update filtered data
      const updatedFiltered = filteredData.filter(record => record.id !== recordToDelete.id);
      setFilteredData(updatedFiltered);

      // Update pagination info
      setPagination(prev => ({
        ...prev,
        total: Math.max(0, (prev.total || 0) - 1),
        filteredTotal: Math.max(0, (prev.filteredTotal || 0) - 1)
      }));

      setMessage({
        text: `Successfully deleted ${getRecordTypeLabel(recordToDelete.entryType)} record`,
        type: 'success'
      });
    } catch (err) {
      console.error('Error deleting record:', err);
      setMessage({
        text: `Error deleting record: ${err.response?.data?.error || err.message}`,
        type: 'error'
      });
    } finally {
      setIsDeleting(false);
      setRecordToDelete(null);
    }
  };

  // Helper function to get human-readable record type label
  const getRecordTypeLabel = (entryType) => {
    switch (entryType) {
      case 'meal': return 'meal';
      case 'blood_sugar': return 'blood sugar';
      case 'activity': return 'activity';
      case 'insulin': return 'insulin';
      default: return 'record';
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

  // Confirmation Dialog Component
  const ConfirmationDialog = ({ record, onCancel, onConfirm, isDeleting }) => {
    if (!record) return null;

    const recordType = getRecordTypeLabel(record.entryType);
    const hasRelatedData = record.activity_ids?.length > 0 || record.blood_sugar_id || record.medication_log_id;

    return (
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content confirm-dialog" onClick={e => e.stopPropagation()}>
          <div className="modal-header warning">
            <div className="warning-header">
              <FaExclamationTriangle className="warning-icon" />
              <h3>Confirm Deletion</h3>
            </div>
            <button onClick={onCancel} disabled={isDeleting}>&times;</button>
          </div>
          <div className="modal-body">
            <p className="confirm-message">
              Are you sure you want to delete this {recordType} record from {record.formattedTimestamp}?
            </p>

            {hasRelatedData && (
              <div className="warning-message">
                <FaExclamationTriangle className="warning-icon-small" />
                <span>
                  This record has linked data that will also be deleted:
                  <ul>
                    {record.activity_ids?.length > 0 && <li>{record.activity_ids.length} activity records</li>}
                    {record.blood_sugar_id && <li>Blood sugar reading</li>}
                    {record.medication_log_id && <li>Insulin/medication log</li>}
                  </ul>
                </span>
              </div>
            )}

            <p className="permanent-warning">This action cannot be undone.</p>

            <div className="confirm-buttons">
              <button
                className="cancel-button"
                onClick={onCancel}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="delete-button"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Modal Component for displaying detailed activity information
  const MealDetailsModal = ({ meal, onClose }) => {
  const [activityDetails, setActivityDetails] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // Fetch activity details when modal opens
  useEffect(() => {
    const fetchActivityDetails = async () => {
      // If this is an activity record itself, no need to fetch additional details
      if (meal.entryType === 'activity' && !meal.activity_ids?.length) {
        // This is a standalone activity record
        setActivityDetails([{
          id: meal.id,
          level: meal.level || 0,
          type: meal.type || 'unknown',
          duration: meal.duration || 'N/A',
          startTime: meal.startTime,
          endTime: meal.endTime,
          impact: meal.impact || 1.0,
          notes: meal.notes || ''
        }]);
        return;
      }

      // For records with linked activities, fetch those
      if (meal.activity_ids?.length > 0) {
        try {
          setLoadingActivities(true);
          const token = localStorage.getItem('token');

          // For each activity ID, fetch its details
          const activityPromises = meal.activity_ids.map(id =>
            axios.get(`http://localhost:5000/api/activity/${id}`, {
              headers: { Authorization: `Bearer ${token}` }
            })
          );

          // Wait for all activity requests to complete
          const responses = await Promise.all(activityPromises);
          const fetchedActivities = responses.map(res => res.data);
          setActivityDetails(fetchedActivities);
        } catch (err) {
          console.error('Error fetching activity details:', err);
        } finally {
          setLoadingActivities(false);
        }
      }
    };

    fetchActivityDetails();
  }, [meal]);

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

            {/* Activity section - handles referenced activities */}
            {(meal.activity_ids?.length > 0 || loadingActivities) && (
              <>
                <h4>Activities ({meal.activity_ids?.length || 0})</h4>
                {loadingActivities ? (
                  <div className="loading-activities">Loading activity details...</div>
                ) : activityDetails.length > 0 ? (
                  <ul>
                    {activityDetails.map((activity, idx) => (
                      <li key={idx} className="activity-item">
                        <div className="activity-header">
                          <span className="activity-level">Level: {activity.level}</span>
                          {activity.type && <span className="activity-type">Type: {activity.type}</span>}
                        </div>
                        <div className="activity-details">
                          <div className="activity-duration">Duration: {activity.duration || 'N/A'}</div>
                          {activity.startTime && (
                            <div className="activity-time">
                              Time: {formatDateTime(activity.startTime)}
                              {activity.endTime && ` - ${formatDateTime(activity.endTime)}`}
                            </div>
                          )}
                          {activity.notes && <div className="activity-notes">Notes: {activity.notes}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="activity-ids-list">
                    <p>Activity IDs: {meal.activity_ids.join(', ')}</p>
                    <div className="activity-note">
                      (Details not available - IDs only)
                    </div>
                  </div>
                )}
              </>
            )}

            {meal.notes && (
              <>
                <h4>Notes</h4>
                <p>{meal.notes}</p>
              </>
            )}

            <div className="modal-actions">
              <button
                className="delete-button-modal"
                onClick={() => {
                  onClose();
                  setRecordToDelete(meal);
                }}
              >
                <FaTrash /> Delete Record
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

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
  Header: 'Activities',
  accessor: (row) => {
    // For dedicated activity records, show the activity level
    if (row.entryType === 'activity') {
      if (row.level !== undefined) {
        return `Level ${row.level}`;
      } else if (row.activities && row.activities[0]?.level !== undefined) {
        return `Level ${row.activities[0].level}`;
      } else {
        return "Activity record";
      }
    }
    // For records with linked activities, show the count
    else if (row.activity_ids?.length) {
      return `${row.activity_ids.length} activities`;
    }
    // Otherwise show N/A
    return 'N/A';
  },
  Cell: ({ row }) => {
    const value = row.original.entryType === 'activity'
      ? (row.original.level !== undefined
         ? `Level ${row.original.level}`
         : row.original.activities && row.original.activities[0]?.level !== undefined
           ? `Level ${row.original.activities[0].level}`
           : "Activity record")
      : row.original.activity_ids?.length
        ? `${row.original.activity_ids.length} activities`
        : 'N/A';

    // Add a specific class to style activity levels differently
    const isActivityLevel = row.original.entryType === 'activity' &&
                          (row.original.level !== undefined ||
                           (row.original.activities && row.original.activities[0]?.level !== undefined));

    return (
      <span className={isActivityLevel ? 'activity-level-badge' : ''}>
        {value}
      </span>
    );
  }
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

  // Refresh data
  const handleRefresh = () => {
    fetchAllRecords();
  };

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

  if (loading && filteredData.length === 0) return <div>Loading meal history...</div>;

  return (
    <div>
      <h2>Meal History</h2>

      {/* Add timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      {/* Status message */}
      {message.text && (
        <div className={`status-message ${message.type}`}>
          {message.text}
        </div>
      )}

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
                      borderBottom: 'solid 1px #ddd',
                      whiteSpace: 'nowrap'
                    }}>
                      <div className="row-actions">
                        <button
                          onClick={() => setSelectedMeal(row.original)}
                          className="details-button"
                        >
                          Details
                        </button>
                        <button
                          onClick={() => setRecordToDelete(row.original)}
                          className="delete-button-small"
                          title={`Delete this ${getRecordTypeLabel(row.original.entryType)} record`}
                        >
                          <FaTrash />
                        </button>
                      </div>
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

      {/* Details Modal */}
      {selectedMeal && (
        <MealDetailsModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <ConfirmationDialog
          record={recordToDelete}
          onCancel={() => setRecordToDelete(null)}
          onConfirm={handleDeleteRecord}
          isDeleting={isDeleting}
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

        .activity-item {
          padding: 10px;
          border: 1px solid #eee;
          border-radius: 5px;
          margin-bottom: 10px;
        }

        .activity-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 5px;
          font-weight: bold;
        }

        .activity-details {
          padding-left: 10px;
          font-size: 0.9em;
          color: #444;
        }

        .activity-time, .activity-duration, .activity-notes {
          margin-top: 3px;
        }

        .loading-activities {
          padding: 10px;
          border: 1px solid #f0f0f0;
          border-radius: 5px;
          background-color: #fafafa;
          text-align: center;
          color: #888;
        }

        .activity-ids-list {
          padding: 10px;
          border: 1px solid #ffccc7;
          border-radius: 5px;
          background-color: #fff2f0;
          color: #cf1322;
        }

        .activity-note {
          font-size: 0.8em;
          color: #888;
          font-style: italic;
          margin-top: 5px;
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
          margin-right: 5px;
        }
        
        .details-button:hover {
          background-color: #1890ff;
          border-color: #1890ff;
          color: white;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
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

        /* Modal styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }
        
        .modal-content {
          background-color: white;
          border-radius: 8px;
          width: 90%;
          max-width: 700px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        
        .confirm-dialog {
          max-width: 500px;
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 15px 20px;
          border-bottom: 1px solid #f0f0f0;
        }

        .modal-header.warning {
          background-color: #fff2f0;
          border-bottom: 1px solid #ffccc7;
        }
        
        .warning-header {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #cf1322;
        }
        
        .warning-icon {
          color: #cf1322;
          font-size: 24px;
        }
        
        .warning-icon-small {
          color: #cf1322;
          margin-right: 5px;
        }
        
        .modal-header h3 {
          margin: 0;
        }
        
        .modal-header button {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
        }
        
        .modal-body {
          padding: 20px;
        }
        
        .meal-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          margin-bottom: 15px;
          padding: 10px;
          background-color: #fafafa;
          border-radius: 5px;
          border: 1px solid #f0f0f0;
        }
        
        .confirm-message {
          font-size: 1.1em;
          margin-bottom: 15px;
        }
        
        .warning-message {
          background-color: #fff2f0;
          border: 1px solid #ffccc7;
          border-radius: 4px;
          padding: 10px;
          margin: 15px 0;
          display: flex;
          align-items: flex-start;
        }
        
        .permanent-warning {
          font-weight: bold;
          color: #cf1322;
          margin: 15px 0;
        }
        
        .confirm-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 20px;
        }
        
        .cancel-button {
          padding: 8px 16px;
          background-color: #f0f0f0;
          border: 1px solid #d9d9d9;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .delete-button {
          padding: 8px 16px;
          background-color: #ff4d4f;
          border: 1px solid #ff4d4f;
          color: white;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .delete-button:hover:not(:disabled) {
          background-color: #ff7875;
          border-color: #ff7875;
        }
        
        .delete-button:disabled {
          background-color: #ffccc7;
          border-color: #ffccc7;
          cursor: not-allowed;
        }
        
        .delete-button-small {
          padding: 4px 8px;
          background-color: #ff4d4f;
          border: 1px solid #ff4d4f;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .delete-button-small:hover {
          background-color: #ff7875;
          border-color: #ff7875;
        }
        
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 20px;
          border-top: 1px solid #f0f0f0;
          padding-top: 15px;
        }
        
        .delete-button-modal {
          padding: 8px 16px;
          background-color: #ff4d4f;
          border: 1px solid #ff4d4f;
          color: white;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .delete-button-modal:hover {
          background-color: #ff7875;
          border-color: #ff7875;
        }
        
        .row-actions {
          display: flex;
          gap: 5px;
        }
        
        /* Status message styles */
        .status-message {
          padding: 10px;
          margin-bottom: 15px;
          border-radius: 4px;
          animation: fadeIn 0.3s ease-out;
        }
        
        .status-message.success {
          background-color: #f6ffed;
          border: 1px solid #b7eb8f;
          color: #52c41a;
        }
        
        .status-message.error {
          background-color: #fff2f0;
          border: 1px solid #ffccc7;
          color: #ff4d4f;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default MealHistory;