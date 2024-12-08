import React, { useState, useEffect } from 'react';
import { Line, Scatter } from 'react-chartjs-2';
import axios from 'axios';
import { CHART_COLORS, commonOptions, timeFormats } from './chartConfig';
import './charts.css';

const API_BASE_URL = 'http://localhost:5000';

// Chart options configurations
const getTimeSeriesOptions = (dateRange) => ({
  ...commonOptions,
  plugins: {
    ...commonOptions.plugins,
    title: {
      display: true,
      text: 'Blood Glucose Trends'
    }
  },
  scales: {
    x: {
      type: 'time',
      time: timeFormats[dateRange],
      title: {
        display: true,
        text: 'Time'
      }
    },
    y: {
      title: {
        display: true,
        text: 'Blood Glucose (mg/dL)'
      }
    }
  }
});

const scatterOptions = {
  ...commonOptions,
  plugins: {
    ...commonOptions.plugins,
    title: {
      display: true,
      text: 'Meal Impact Analysis'
    }
  },
  scales: {
    x: {
      title: {
        display: true,
        text: 'Pre-meal Glucose (mg/dL)'
      }
    },
    y: {
      title: {
        display: true,
        text: 'Post-meal Glucose (mg/dL)'
      }
    }
  }
};

const BloodGlucoseAnalytics = ({ patientId }) => {
  const [bloodGlucoseData, setBloodGlucoseData] = useState([]);
  const [mealData, setMealData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('week');
  const [targetRange] = useState({ min: 70, max: 180 });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('No authentication token found');
        }

        const headers = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        };

        // Fetch blood glucose data
        const glucoseResponse = await axios.get(
          `${API_BASE_URL}/api/blood-sugar/${patientId}`,
          {
            headers,
            params: { range: dateRange },
            timeout: 5000
          }
        );

        // Fetch meal data
        const mealResponse = await axios.get(
          `${API_BASE_URL}/api/meals/${patientId}`,
          {
            headers,
            params: { range: dateRange },
            timeout: 5000
          }
        );

        setBloodGlucoseData(glucoseResponse.data);
        setMealData(mealResponse.data);
        setLoading(false);

      } catch (err) {
        console.error('Error fetching data:', err);
        setError(
          err.response?.data?.error ||
          err.message ||
          'An error occurred while fetching data'
        );
        setLoading(false);
      }
    };

    if (patientId) {
      fetchData();
    }
  }, [patientId, dateRange]);

  // Prepare time series data
  const timeSeriesData = {
    labels: bloodGlucoseData.map(d => new Date(d.timestamp)),
    datasets: [
      {
        label: 'Blood Glucose',
        data: bloodGlucoseData.map(d => ({
          x: new Date(d.timestamp),
          y: d.bloodSugar
        })),
        borderColor: CHART_COLORS.primary,
        tension: 0.1
      },
      // Target range lines
      {
        label: 'Target Range Min',
        data: bloodGlucoseData.map(d => ({
          x: new Date(d.timestamp),
          y: targetRange.min
        })),
        borderColor: CHART_COLORS.danger,
        borderDash: [5, 5],
        fill: false
      },
      {
        label: 'Target Range Max',
        data: bloodGlucoseData.map(d => ({
          x: new Date(d.timestamp),
          y: targetRange.max
        })),
        borderColor: CHART_COLORS.danger,
        borderDash: [5, 5],
        fill: false
      }
    ]
  };

  // Prepare meal impact data
  const mealImpactData = {
    datasets: mealData.map(meal => ({
      label: meal.mealType,
      data: [{
        x: meal.preMealGlucose,
        y: meal.postMealGlucose,
        r: meal.totalCarbs / 10 // Size based on carb intake
      }],
      backgroundColor:
        meal.mealType === 'breakfast' ? CHART_COLORS.danger :
        meal.mealType === 'lunch' ? CHART_COLORS.secondary :
        CHART_COLORS.primary
    }))
  };

  if (loading) {
    return (
      <div className="chart-loading">
        <p>Loading analytics data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="chart-error">
        <p>Error: {error}</p>
        <button
          onClick={() => setDateRange(dateRange)}
          className="refresh-button"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="analytics-container">
      <div className="chart-header">
        <h2 className="chart-title">Blood Glucose Analytics</h2>
        <div className="date-range-selector">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
          >
            <option value="day">Last 24 Hours</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
          </select>
        </div>
      </div>

      {bloodGlucoseData.length === 0 ? (
        <div className="no-data-message">
          No blood glucose data available for the selected time range
        </div>
      ) : (
        <div className="chart-grid">
          <div className="chart-container">
            <Line data={timeSeriesData} options={getTimeSeriesOptions(dateRange)} />
          </div>
          {mealData.length > 0 && (
            <div className="chart-container">
              <Scatter data={mealImpactData} options={scatterOptions} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BloodGlucoseAnalytics;