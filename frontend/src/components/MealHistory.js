import React, { useState, useEffect } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import './MealHistory.css';


const formatDateTime = (timestamp) => {
  if (!timestamp) return 'Invalid date';
  try {
    return new Date(timestamp).toLocaleString();
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
  const [selectedMeal, setSelectedMeal] = useState(null);

  const fetchMealHistory = async () => {
    try {
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
      setData(meals);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching meal history:', err);
      setError(err.message || 'Failed to load meal history');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMealHistory();
  }, [isDoctor, patientId]);

  const columns = React.useMemo(
    () => [
      {
        Header: 'Date/Time',
        accessor: (row) => formatDateTime(row.timestamp),
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
        accessor: (row) => `${row.bloodSugar || 'N/A'} mg/dL`
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
            <h3>{meal.mealType} - {formatDateTime(meal.timestamp)}</h3>
            <button onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            <div className="meal-metrics">
              <div>Blood Sugar: {meal.bloodSugar || 'N/A'} mg/dL</div>
              <div>Suggested Insulin: {meal.suggestedInsulin || 'N/A'} units</div>
              <div>Intended Insulin: {meal.intendedInsulin || 'N/A'} units</div>
            </div>
            <h4>Food Items</h4>
            <ul>
              {meal.foodItems?.map((item, idx) => (
                <li key={idx}>{item.portion?.amount} {item.portion?.unit} {item.name}</li>
              ))}
            </ul>
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

  if (loading) return <div>Loading meal history...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <div>
      <h2>Meal History</h2>
      <div>
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
                      style={{
                        padding: '4px 8px',
                        cursor: 'pointer'
                      }}
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
      <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
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

      {selectedMeal && (
        <MealDetailsModal
          meal={selectedMeal}
          onClose={() => setSelectedMeal(null)}
        />
      )}
    </div>
  );
};

export default MealHistory;