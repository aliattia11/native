import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
import { CHART_COLORS, commonOptions, timeFormats } from './chartConfig';
import './charts.css';

const API_BASE_URL = 'http://localhost:5000';

const BloodGlucoseAnalytics = ({ patientId }) => {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('week');
  const [targetRange] = useState({ min: 70, max: 180 }); // Standard target range

  useEffect(() => {
    fetchData();
  }, [patientId, dateRange]);
  const formatDateForAPI = (date) => {
    return date.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
  };

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

      // Calculate date range with proper formatting
      const endDate = new Date();
      let startDate = new Date();
      switch (dateRange) {
        case 'day':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case 'week':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case 'month':
          startDate.setDate(endDate.getDate() - 30);
          break;
        default:
          startDate.setDate(endDate.getDate() - 7);
      }

      // Format dates for API
      const formattedStartDate = formatDateForAPI(startDate);
      const formattedEndDate = formatDateForAPI(endDate);

      // Fetch blood glucose data
      const glucoseResponse = await axios.get(
        `${API_BASE_URL}/api/blood-sugar`,
        {
          headers,
          params: {
            start_date: formattedStartDate,
            end_date: formattedEndDate,
            unit: 'mg/dL',
            ...(patientId && { patient_id: patientId })
          }
        }
      );

      // Fetch meal data
      const mealResponse = await axios.get(
        `${API_BASE_URL}/api/meals`,
        {
          headers,
          params: {
            start_date: formattedStartDate,
            end_date: formattedEndDate,
            ...(patientId && { patient_id: patientId })
          }
        }
      );

      const processedData = processData(
        glucoseResponse.data || [],
        mealResponse.data?.meals || []
      );
      setChartData(processedData);
      setLoading(false);

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch data');
      setLoading(false);
    }
  };

  const processData = (glucoseData, mealsData) => {
    // Safely parse dates and ensure valid data
    const parseDate = (dateString) => {
      try {
        return new Date(dateString);
      } catch (e) {
        console.error('Invalid date:', dateString);
        return null;
      }
    };

    // Process glucose readings with safe date parsing
    const readings = (Array.isArray(glucoseData) ? glucoseData : [])
      .map(reading => {
        const date = parseDate(reading.timestamp);
        if (!date) return null;

        return {
          x: date,
          y: reading.bloodSugar,
          status: reading.status || 'unknown'
        };
      })
      .filter(reading => reading !== null)
      .sort((a, b) => a.x - b.x);

    // Process meals with safe date parsing
    const meals = (Array.isArray(mealsData) ? mealsData : [])
      .map(meal => {
        const date = parseDate(meal.timestamp);
        if (!date) return null;

        return {
          x: date,
          y: meal.bloodSugar || null,
          mealType: meal.mealType,
          insulin: meal.intendedInsulin,
          suggestedInsulin: meal.suggestedInsulin,
          foodItems: meal.foodItems
        };
      })
      .filter(meal => meal !== null)
      .sort((a, b) => a.x - b.x);

    const timePoints = [...readings.map(r => r.x)];

    return {
      labels: timePoints,
      datasets: [
        // Blood Glucose Line
        {
          label: 'Blood Glucose',
          data: readings,
          borderColor: CHART_COLORS.primary,
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          fill: false,
          tension: 0.4,
          yAxisID: 'glucose'
        },
        // Target Range - Minimum
        {
          label: 'Target Range Min',
          data: timePoints.map(x => ({ x, y: targetRange.min })),
          borderColor: CHART_COLORS.danger,
          borderDash: [5, 5],
          fill: false,
          yAxisID: 'glucose'
        },
        // Target Range - Maximum
        {
          label: 'Target Range Max',
          data: timePoints.map(x => ({ x, y: targetRange.max })),
          borderColor: CHART_COLORS.danger,
          borderDash: [5, 5],
          fill: '+1',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          yAxisID: 'glucose'
        },
        // Meal Markers
        {
          label: 'Meals',
          data: meals,
          backgroundColor: CHART_COLORS.warning,
          pointStyle: 'triangle',
          pointRadius: 8,
          showLine: false,
          yAxisID: 'glucose'
        }
      ]
    };
  };

  const chartOptions = {
    ...commonOptions,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (context) => {
            const dataset = context.dataset;
            const point = dataset.data[context.dataIndex];

            if (dataset.label === 'Meals') {
              const labels = [
                `${point.mealType}`,
                `Blood Sugar: ${point.y || 'N/A'} mg/dL`,
                `Insulin Taken: ${point.insulin || 'N/A'} units`,
                `Suggested Insulin: ${point.suggestedInsulin || 'N/A'} units`
              ];
              if (point.foodItems?.length > 0) {
                labels.push(`Foods: ${point.foodItems.map(f => f.name).join(', ')}`);
              }
              return labels;
            }
            return `${dataset.label}: ${point.y} mg/dL`;
          }
        }
      },
      legend: {
        position: 'top'
      },
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
      glucose: {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: 'Blood Glucose (mg/dL)'
        },
        suggestedMin: 40,
        suggestedMax: 250,
        grid: {
          color: 'rgba(0, 0, 0, 0.1)'
        }
      }
    }
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
        <button onClick={fetchData} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  if (!chartData || !chartData.datasets[0].data.length) {
    return (
      <div className="chart-error">
        <p>No data available for the selected time range</p>
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
            className="date-range-select"
          >
            <option value="day">Last 24 Hours</option>
            <option value="week">Last Week</option>
            <option value="month">Last Month</option>
          </select>
        </div>
      </div>

      <div className="chart-container">
        <Line data={chartData} options={chartOptions} />
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: CHART_COLORS.primary }}></span>
          <span>Blood Glucose</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: CHART_COLORS.danger }}></span>
          <span>Target Range</span>
        </div>
        <div className="legend-item">
          <span className="legend-color" style={{ backgroundColor: CHART_COLORS.warning }}></span>
          <span>Meals</span>
        </div>
      </div>
    </div>
  );
};

export default BloodGlucoseAnalytics;