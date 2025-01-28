// frontend/src/components/Charts/BloodGlucoseCorrelationChart.js
import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import axios from 'axios';
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
import 'chartjs-adapter-date-fns';
import styles from './BloodGlucoseCorrelationChart.module.css';

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

const BloodGlucoseCorrelationChart = ({ patientId, timeRange = '7d' }) => {
  const [chartData, setChartData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get token from localStorage
        const token = localStorage.getItem('token');

        // Fetch all required data in parallel
        const [mealsResponse, medicationsResponse] = await Promise.all([
          axios.get(`http://localhost:5000/api/doctor/meal-history/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          axios.get(`http://localhost:5000/api/medication-schedule/${patientId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        const processedData = processChartData(mealsResponse.data.meals, medicationsResponse.data.schedules);
        setChartData(processedData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.response?.data?.message || 'Error fetching data');
      } finally {
        setIsLoading(false);
      }
    };

    if (patientId) {
      fetchData();
    }
  }, [patientId, timeRange]);

  const processChartData = (meals, medications) => {
    // Sort meals by timestamp
    const sortedMeals = [...meals].sort((a, b) =>
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    return {
      datasets: [
        // Blood Glucose Line
        {
          label: 'Blood Glucose',
          data: sortedMeals.map(meal => ({
            x: new Date(meal.timestamp),
            y: meal.bloodSugar || null,
            mealType: meal.mealType,
            foodItems: meal.foodItems
          })).filter(point => point.y !== null),
          borderColor: 'rgb(255, 99, 132)',
          backgroundColor: 'rgba(255, 99, 132, 0.5)',
          yAxisID: 'glucoseAxis',
          order: 1
        },
        // Insulin Doses
        {
          label: 'Insulin Doses',
          data: sortedMeals
            .filter(meal => meal.intendedInsulin)
            .map(meal => ({
              x: new Date(meal.timestamp),
              y: meal.intendedInsulin,
              type: meal.intendedInsulinType,
              mealType: meal.mealType,
              foodItems: meal.foodItems
            })),
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          yAxisID: 'insulinAxis',
          order: 2
        },
        // Activity Impact
        {
          label: 'Activity Impact',
          data: sortedMeals
            .filter(meal => meal.activities?.length > 0)
            .map(meal => ({
              x: new Date(meal.timestamp),
              y: calculateActivityImpact(meal.activities),
              activities: meal.activities
            })),
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.5)',
          yAxisID: 'impactAxis',
          order: 3
        }
      ]
    };
  };

  const calculateActivityImpact = (activities) => {
    return activities.reduce((total, activity) => {
      const impact = parseFloat(activity.impact) || 1;
      const duration = activity.duration?.split(':')[0] || 0;
      return total * (1 + ((impact - 1) * Math.min(duration / 2, 1)));
    }, 1);
  };

  const chartOptions = {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'hour',
          displayFormats: {
            hour: 'MMM d, HH:mm'
          }
        },
        title: {
          display: true,
          text: 'Time'
        }
      },
      glucoseAxis: {
        type: 'linear',
        position: 'left',
        title: {
          display: true,
          text: 'Blood Glucose (mg/dL)'
        },
        grid: {
          display: true
        }
      },
      insulinAxis: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: 'Insulin Units'
        },
        grid: {
          display: false
        }
      },
      impactAxis: {
        type: 'linear',
        position: 'right',
        title: {
          display: true,
          text: 'Activity Impact'
        },
        grid: {
          display: false
        }
      }
    },
    plugins: {
      tooltip: {
        callbacks: {
          afterBody: (tooltipItems) => {
            const dataPoint = tooltipItems[0];
            const dataset = chartData.datasets[dataPoint.datasetIndex];
            const point = dataset.data[dataPoint.dataIndex];

            if (point.mealType) {
              return [
                `Meal Type: ${point.mealType}`,
                'Foods:',
                ...point.foodItems.map(f => `- ${f.name} (${f.portion?.amount} ${f.portion?.unit})`)
              ];
            }
            if (point.activities) {
              return [
                'Activities:',
                ...point.activities.map(a =>
                  `- Level ${a.level}: ${a.duration} (Impact: ${((a.impact - 1) * 100).toFixed(1)}%)`
                )
              ];
            }
            return [];
          }
        }
      },
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Blood Glucose Management Overview'
      }
    }
  };

  if (isLoading) {
    return <div className={styles.loading}>Loading patient data...</div>;
  }

  if (error) {
    return <div className={styles.error}>Error: {error}</div>;
  }

  if (!chartData) {
    return <div className={styles.noData}>No data available</div>;
  }

  return (
    <div className={styles.chartContainer}>
      <Line data={chartData} options={chartOptions} />
      <div className={styles.legend}>
        <h4>Chart Interpretation Guide</h4>
        <ul>
          <li>
            <span className={styles.glucoseLine}>Red line</span>: Blood glucose trend
            <p>Shows how blood sugar levels change over time</p>
          </li>
          <li>
            <span className={styles.insulinLine}>Blue line</span>: Insulin doses
            <p>Displays timing and amount of insulin taken</p>
          </li>
          <li>
            <span className={styles.activityLine}>Green line</span>: Activity impact
            <p>Shows how physical activity affects insulin sensitivity</p>
          </li>
        </ul>
        <div className={styles.interactions}>
          <p>💡 Hover over any point to see detailed information about meals, insulin doses, and activities.</p>
        </div>
      </div>
    </div>
  );
};

export default BloodGlucoseCorrelationChart;