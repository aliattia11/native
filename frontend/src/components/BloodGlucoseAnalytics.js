import React, { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { Line, Scatter } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import regression from 'regression';
import axios from 'axios';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

const BloodGlucoseAnalytics = ({ patientId }) => {
  const [bloodGlucoseData, setBloodGlucoseData] = useState([]);
  const [mealData, setMealData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState('week'); // 'day', 'week', 'month'
  const [targetRange] = useState({ min: 70, max: 180 }); // Configurable target range

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        // Fetch blood glucose data
        const glucoseResponse = await axios.get(
          `http://localhost:5000/api/blood-sugar/${patientId}?range=${dateRange}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        // Fetch meal data
        const mealResponse = await axios.get(
          `http://localhost:5000/api/meals/${patientId}?range=${dateRange}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setBloodGlucoseData(glucoseResponse.data);
        setMealData(mealResponse.data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchData();
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
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      },
      // Target range lines
      {
        label: 'Target Range Min',
        data: bloodGlucoseData.map(d => ({
          x: new Date(d.timestamp),
          y: targetRange.min
        })),
        borderColor: 'rgba(255, 99, 132, 0.2)',
        borderDash: [5, 5],
      },
      {
        label: 'Target Range Max',
        data: bloodGlucoseData.map(d => ({
          x: new Date(d.timestamp),
          y: targetRange.max
        })),
        borderColor: 'rgba(255, 99, 132, 0.2)',
        borderDash: [5, 5],
      }
    ]
  };

  const timeSeriesOptions = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Blood Glucose Trends'
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const value = context.parsed.y;
            const time = new Date(context.parsed.x).toLocaleString();
            return `${value} mg/dL at ${time}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: dateRange === 'day' ? 'hour' : 'day'
        },
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
        meal.mealType === 'breakfast' ? 'rgba(255, 99, 132, 0.5)' :
        meal.mealType === 'lunch' ? 'rgba(54, 162, 235, 0.5)' :
        'rgba(75, 192, 192, 0.5)'
    }))
  };

  if (loading) return <div>Loading analytics...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="analytics-container">
      <div className="date-range-selector">
        <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
          <option value="day">Last 24 Hours</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
        </select>
      </div>

      <div className="chart-container">
        <Line data={timeSeriesData} options={timeSeriesOptions} />
      </div>

      <div className="chart-container">
        <Scatter 
          data={mealImpactData}
          options={{
            responsive: true,
            plugins: {
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
          }}
        />
      </div>
    </div>
  );
};

export default BloodGlucoseAnalytics;