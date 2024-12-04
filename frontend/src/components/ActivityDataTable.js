import React, { useState, useEffect } from 'react';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import './ActivityDataTable.css';

const ActivityDataTable = ({ isDoctor = false, patientId = null }) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [isDoctor, patientId]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      let url = 'http://localhost:5000/api/activity-history';
      if (isDoctor && patientId) {
        url = `http://localhost:5000/api/patient/${patientId}/activity-history`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching activity data:', error);
      setError('Failed to fetch activity data. Please try again.');
      setLoading(false);
    }
  };

  const parseDuration = (duration) => {
    if (typeof duration === 'string') {
      const [hours, minutes] = duration.split(':').map(Number);
      return hours + minutes / 60;
    } else if (typeof duration === 'number') {
      return duration;
    }
    return 0;
  };

 const calculateFinishTime = (startTime, duration, type) => {
    if (!startTime || duration === undefined) return 'N/A';
    const start = new Date(startTime);
    if (isNaN(start.getTime())) return 'N/A';

    const durationInHours = parseDuration(duration);
    start.setHours(start.getHours() + Math.floor(durationInHours));
    start.setMinutes(start.getMinutes() + Math.round((durationInHours % 1) * 60));

    return start.toLocaleString();
  };

  const columns = React.useMemo(
    () => [
      {
        Header: 'Date',
        accessor: 'timestamp',
        Cell: ({ value }) => new Date(value).toLocaleString(),
      },
      {
        Header: 'Type',
        accessor: 'type',
      },
      {
        Header: 'Activity Level',
        accessor: 'level',
        Cell: ({ value }) => {
          const activityLevel = [
            'Sleep',
            'Very Low Activity',
            'Normal Activity',
            'High Activity',
            'Vigorous Activity'
          ][value + 2];
          return activityLevel || 'Unknown';
        }
      },
      {
        Header: 'Duration',
        accessor: 'duration',
      },
      {
        Header: 'Start Time',
        accessor: (row) => row.type === 'expected' ? row.expectedTime : row.completedTime,
        Cell: ({ value }) => value ? new Date(value).toLocaleString() : 'N/A',
      },
      {
        Header: 'Finish Time',
        accessor: (row) => calculateFinishTime(row.type === 'expected' ? row.expectedTime : row.completedTime, row.duration, row.type),
      },
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

  if (loading) return <div className="loading">Loading activity data...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="activity-data-table-container">
      <h2>Activity History</h2>
      <div className="table-responsive">
        <table {...getTableProps()} className="activity-data-table">
          <thead>
            {headerGroups.map(headerGroup => (
              <tr {...headerGroup.getHeaderGroupProps()}>
                {headerGroup.headers.map(column => (
                  <th {...column.getHeaderProps(column.getSortByToggleProps())}>
                    {column.render('Header')}
                    <span className="sort-indicator">
                      {column.isSorted
                        ? column.isSortedDesc
                          ? ' 🔽'
                          : ' 🔼'
                        : ''}
                    </span>
                  </th>
                ))}
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

export default ActivityDataTable;