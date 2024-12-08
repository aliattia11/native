import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import moment from 'moment';
import styles from './BloodSugarChart.module.css';

const BloodSugarChart = ({ isDoctor = false, patientId = null }) => {
  const [data, setData] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: moment().format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, [dateRange, isDoctor, patientId]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      let url = `http://localhost:5000/api/blood-sugar?start_date=${startDate}&end_date=${endDate}`;
      if (isDoctor && patientId) {
        url = `http://localhost:5000/doctor/patient/${patientId}/blood-sugar?start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const formattedData = response.data.map(item => ({
        ...item,
        timestamp: new Date(item.timestamp).getTime(),
      }));
      setData(formattedData);
      setError('');
    } catch (error) {
      console.error('Error fetching blood sugar data:', error);
      setError('Failed to fetch blood sugar data. Please try again.');
    }
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const formatXAxis = (tickItem) => {
    return moment(tickItem).format('DD-MM HH:mm');
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className={styles.customTooltip}>
          <p>{`Time: ${moment(label).format('DD-MM-YYYY HH:mm')}`}</p>
          <p>{`Blood Sugar: ${payload[0].value} mg/dL`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={styles.bloodSugarChart}>
      <h2 className={styles.title}>Blood Sugar Chart</h2>
      <div className={styles.dateInputs}>
        <div className={styles.inputWrapper}>
          <label htmlFor="start-date">Start Date:</label>
          <input
            id="start-date"
            type="date"
            name="start"
            value={dateRange.start}
            onChange={handleDateChange}
            className={styles.input}
          />
        </div>
        <div className={styles.inputWrapper}>
          <label htmlFor="end-date">End Date:</label>
          <input
            id="end-date"
            type="date"
            name="end"
            value={dateRange.end}
            onChange={handleDateChange}
            className={styles.input}
          />
        </div>
        <button onClick={fetchData} className={styles.button}>Update Chart</button>
      </div>
      {error && (
        <div className={styles.error}>{error}</div>
      )}
      <div className={styles.chartContainer}>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={data}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 25,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatXAxis}
              angle={-45}
              textAnchor="end"
              height={70}
              interval="preserveStartEnd"
              tickCount={8}
            />
            <YAxis />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line type="monotone" dataKey="bloodSugar" stroke="#8884d8" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default BloodSugarChart;
