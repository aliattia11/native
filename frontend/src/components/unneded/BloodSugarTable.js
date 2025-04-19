import React, { useState, useEffect } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import './BloodSugarTable.css';

const BloodSugarTable = ({ isDoctor = false, patientId = null }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [isDoctor, patientId]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = 'http://localhost:5000/api/blood-sugar';
      if (isDoctor && patientId) {
        url = `http://localhost:5000/doctor/patient/${patientId}/blood-sugar`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching blood sugar data:', error);
      setError('Failed to fetch blood sugar data. Please try again.');
      setLoading(false);
    }
  };

const columns = React.useMemo(
  () => [
    {
      Header: 'Reading Date & Time',
      accessor: (row) => {
        // Try to use bloodSugarTimestamp if available, otherwise use timestamp
        const timestamp = row.bloodSugarTimestamp || row.timestamp;
        return new Date(timestamp).toLocaleString();
      },
      id: 'readingTime'
    },
    {
      Header: 'Blood Sugar Level (mmol/L)',
      accessor: 'bloodSugar',
    },
    {
      Header: 'Status',
      accessor: 'status',
      Cell: ({ value }) => (
        <span className={`status-badge ${value}`}>
          {value && value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
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

  if (loading) return <div className="loading">Loading blood sugar data...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="blood-sugar-table-container">
      <h2>Blood Sugar History</h2>
      <div className="table-responsive">
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
                        <span className="sort-indicator">
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
            })}
          </tbody>
        </table>
      </div>
      <div className="pagination">
        <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>
          {'<<'}
        </button>
        <button onClick={() => previousPage()} disabled={!canPreviousPage}>
          {'<'}
        </button>
        <button onClick={() => nextPage()} disabled={!canNextPage}>
          {'>'}
        </button>
        <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>
          {'>>'}
        </button>
        <span>
          Page{' '}
          <strong>
            {pageIndex + 1} of {pageOptions.length}
          </strong>{' '}
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
            style={{ width: '50px' }}
          />
        </span>{' '}
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
  );
};

export default BloodSugarTable;