import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { useTable, useSortBy, usePagination } from 'react-table';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import moment from 'moment';
import { FaSync, FaChartBar, FaTable, FaList, FaFilter, FaCalendarAlt } from 'react-icons/fa';

import { useConstants } from '../contexts/ConstantsContext';
import { useTime } from '../contexts/TimeContext';
import TimeManager from '../utils/TimeManager';
import TimeInput from './TimeInput';
import './MealVisualization.css';

const MealVisualization = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  height = '500px',
  embedded = false,
  onDataLoaded = null,
  defaultView = 'chart'
}) => {
  // Access context providers
  const timeContext = useTime();
  const { patientConstants, loading: constantsLoading } = useConstants();

  // Local state
  const [meals, setMeals] = useState([]);
  const [filteredMeals, setFilteredMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState(defaultView);
  const [chartType, setChartType] = useState('nutrition');
  const [mealTypeFilter, setMealTypeFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [userTimeZone, setUserTimeZone] = useState('');
  const [detailView, setDetailView] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  // For custom date range when not using TimeContext
  const [localDateRange, setLocalDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });

  // Reference for tracking if we've done an initial fetch
  const didFetchRef = useRef(false);
  const chartRef = useRef(null);

  // Use TimeContext date range if available, otherwise use local state
  const dateRange = timeContext ? timeContext.dateRange : localDateRange;

  // Set user timezone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // IMPORTANT: Define processMealData BEFORE fetchMealData to avoid initialization error
  // Process raw meal data into the format needed for visualization
  const processMealData = useCallback((rawMeals) => {
    if (!Array.isArray(rawMeals)) {
      console.error('processMealData received non-array data:', rawMeals);
      return [];
    }

    return rawMeals.map(meal => {
      // Parse timestamps and convert to local time
      const mealTime = moment.utc(meal.timestamp).local();
      const formattedTime = TimeManager.formatDate(
        mealTime.toDate(),
        TimeManager.formats.DATETIME_DISPLAY
      );

      // Extract or calculate nutritional totals
      const nutrition = meal.nutrition || {};
      const totalCarbs = nutrition.carbs || 0;
      const totalProtein = nutrition.protein || 0;
      const totalFat = nutrition.fat || 0;
      const totalCalories = nutrition.calories ||
        (totalCarbs * 4 + totalProtein * 4 + totalFat * 9);

      // Calculate nutritional distribution percentages
      const totalNutrients = totalCarbs + totalProtein + totalFat;
      const carbPercentage = totalNutrients > 0 ? Math.round((totalCarbs / totalNutrients) * 100) : 0;
      const proteinPercentage = totalNutrients > 0 ? Math.round((totalProtein / totalNutrients) * 100) : 0;
      const fatPercentage = totalNutrients > 0 ? Math.round((totalFat / totalNutrients) * 100) : 0;

      // Get insulin details if available
      const insulinDose = meal.insulin?.dose || 0;
      const insulinType = meal.insulin?.type || '';

      return {
        id: meal._id || meal.id,
        timestamp: mealTime.valueOf(),
        formattedTime,
        date: mealTime.format('YYYY-MM-DD'),
        time: mealTime.format('HH:mm'),
        mealType: meal.mealType || 'normal',
        foodItems: meal.foodItems || [],
        nutrition: {
          ...nutrition,
          totalCarbs,
          totalProtein,
          totalFat,
          totalCalories,
          carbPercentage,
          proteinPercentage,
          fatPercentage
        },
        insulin: {
          dose: insulinDose,
          type: insulinType,
          calculationFactors: meal.calculationFactors || {}
        },
        notes: meal.notes || '',
        calculation_summary: meal.calculation_summary || null,
        bloodGlucose: meal.bloodGlucose || null,
        activities: meal.activities || []
      };
    }).sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending
  }, []);

  // Sort meals based on current sort configuration
  const sortMeals = useCallback((mealsToSort, config) => {
    return [...mealsToSort].sort((a, b) => {
      if (a[config.key] < b[config.key]) {
        return config.direction === 'asc' ? -1 : 1;
      }
      if (a[config.key] > b[config.key]) {
        return config.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }, []);

  // Apply filters to the meal data
  const applyFilters = useCallback((mealsToFilter, mealTypeValue) => {
    if (!Array.isArray(mealsToFilter)) {
      console.error('applyFilters received non-array data:', mealsToFilter);
      setFilteredMeals([]);
      return;
    }

    let result = [...mealsToFilter];

    // Filter by meal type if not set to 'all'
    if (mealTypeValue !== 'all') {
      result = result.filter(meal => meal.mealType === mealTypeValue);
    }

    // Apply any sorting
    result = sortMeals(result, sortConfig);

    setFilteredMeals(result);
  }, [sortConfig, sortMeals]);

  // NOW we can define fetchMealData, which depends on processMealData and applyFilters
  const fetchMealData = useCallback(async () => {
    if (isFetching) return;

    try {
      setIsFetching(true);
      setLoading(true);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Determine the appropriate endpoint based on whether we're viewing as doctor
      let url;
      if (isDoctor && patientId) {
        url = `http://localhost:5000/api/patient/${patientId}/meals-only`;
      } else {
        url = 'http://localhost:5000/api/meals-only';
      }

      // Add date range parameters
      url += `?start_date=${dateRange.start}&end_date=${dateRange.end}`;

      console.log('Fetching meal data from:', url);

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Access the meals array from response.data.meals
      if (response.data && Array.isArray(response.data.meals)) {
        console.log('Received meal data:', response.data);
        // Process the meal data
        const processedMeals = processMealData(response.data.meals);
        setMeals(processedMeals);

        // Initial filtering based on current meal type filter
        applyFilters(processedMeals, mealTypeFilter);

        setError('');

        // Call the onDataLoaded callback if provided
        if (onDataLoaded && typeof onDataLoaded === 'function') {
          onDataLoaded(processedMeals);
        }
      } else {
        console.error('Invalid response structure:', response.data);
        setError('Invalid data format received from server');
        setMeals([]);
        setFilteredMeals([]);
      }

    } catch (err) {
      console.error('Error fetching meal data:', err);
      setError(`Failed to fetch meal data: ${err.message || 'Unknown error'}`);
      setMeals([]);
      setFilteredMeals([]);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [dateRange, isDoctor, patientId, mealTypeFilter, isFetching, onDataLoaded, processMealData, applyFilters]);

  // Handle date range changes
  const handleDateRangeChange = useCallback((newRange) => {
    if (timeContext) {
      timeContext.setDateRange(newRange);
    } else {
      setLocalDateRange(newRange);
    }
  }, [timeContext]);

  // Handle meal type filter changes
  const handleMealTypeChange = useCallback((e) => {
    const newMealType = e.target.value;
    setMealTypeFilter(newMealType);
    applyFilters(meals, newMealType);
  }, [meals, applyFilters]);

  // Handle sort changes
  const handleSortChange = useCallback((key) => {
    setSortConfig(current => {
      const direction = current.key === key && current.direction === 'asc' ? 'desc' : 'asc';
      const newConfig = { key, direction };
      const sortedMeals = sortMeals(filteredMeals, newConfig);
      setFilteredMeals(sortedMeals);
      return newConfig;
    });
  }, [filteredMeals, sortMeals]);

  // Handle chart type changes
  const handleChartTypeChange = useCallback((type) => {
    setChartType(type);
  }, []);

  // Handle update data button click
  const handleUpdateData = useCallback(() => {
    fetchMealData();
  }, [fetchMealData]);

  // Handle view mode changes
  const handleViewChange = useCallback((view) => {
    setActiveView(view);
    if (view === 'details' && filteredMeals.length > 0 && !detailView) {
      setDetailView(filteredMeals[0]);
    }
  }, [filteredMeals, detailView]);

  // Handle meal detail selection
  const handleMealSelect = useCallback((meal) => {
    setDetailView(meal);
    setActiveView('details');
  }, []);

  // Apply quick date presets
  const applyDatePreset = useCallback((days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');
    const end = moment().format('YYYY-MM-DD');
    
    const newRange = { start, end };
    handleDateRangeChange(newRange);
    
    // Refetch data with new date range
    setTimeout(() => fetchMealData(), 0);
  }, [handleDateRangeChange, fetchMealData]);

  // Fetch data when component mounts or date range changes
  useEffect(() => {
    if (!didFetchRef.current) {
      fetchMealData();
      didFetchRef.current = true;
    }
  }, [fetchMealData]);

  // Apply filters when meals or filter state changes
  useEffect(() => {
    applyFilters(meals, mealTypeFilter);
  }, [meals, mealTypeFilter, applyFilters]);

  // Create table columns definition
  const columns = useMemo(
    () => [
      {
        Header: 'Date & Time',
        accessor: 'formattedTime',
        Cell: ({ value }) => <span className="meal-date">{value}</span>,
      },
      {
        Header: 'Meal Type',
        accessor: 'mealType',
        Cell: ({ value }) => (
          <span className={`meal-type ${value}`}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </span>
        ),
      },
      {
        Header: 'Carbs (g)',
        accessor: row => row.nutrition.totalCarbs,
        id: 'carbs',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Protein (g)',
        accessor: row => row.nutrition.totalProtein,
        id: 'protein',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Fat (g)',
        accessor: row => row.nutrition.totalFat,
        id: 'fat',
        Cell: ({ value }) => <span>{value.toFixed(1)}</span>,
      },
      {
        Header: 'Calories',
        accessor: row => row.nutrition.totalCalories,
        id: 'calories',
        Cell: ({ value }) => <span>{Math.round(value)}</span>,
      },
      {
        Header: 'Insulin',
        accessor: row => row.insulin.dose,
        id: 'insulin',
        Cell: ({ value, row }) => (
          <span>
            {value > 0 ? `${value} units${row.original.insulin.type ? ` (${row.original.insulin.type})` : ''}` : 'None'}
          </span>
        ),
      },
      {
        Header: 'Actions',
        Cell: ({ row }) => (
          <button 
            className="view-details-btn" 
            onClick={() => handleMealSelect(row.original)}
          >
            View Details
          </button>
        ),
      },
    ],
    [handleMealSelect]
  );

  // Set up React Table
  const tableInstance = useTable(
    {
      columns,
      data: filteredMeals,
      initialState: { pageIndex: 0, pageSize: 10 },
    },
    useSortBy,
    usePagination
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
  } = tableInstance;

  // Format X-axis labels for charts
  const formatXAxis = useCallback((timestamp) => {
    return moment(timestamp).format('MM/DD HH:mm');
  }, []);

  // Generate chart data
  const chartData = useMemo(() => {
    return filteredMeals.map(meal => ({
      timestamp: meal.timestamp,
      formattedTime: meal.formattedTime,
      carbs: meal.nutrition.totalCarbs,
      protein: meal.nutrition.totalProtein,
      fat: meal.nutrition.totalFat,
      calories: meal.nutrition.totalCalories,
      insulin: meal.insulin.dose,
      mealType: meal.mealType,
      // Include percentages for pie charts
      carbPercentage: meal.nutrition.carbPercentage,
      proteinPercentage: meal.nutrition.proteinPercentage,
      fatPercentage: meal.nutrition.fatPercentage
    }));
  }, [filteredMeals]);

  // Create nutrition distribution data for bar/pie charts
  const nutritionDistributionData = useMemo(() => {
    if (!filteredMeals.length) return [];
    
    // Aggregate data across all filtered meals
    const totals = filteredMeals.reduce(
      (acc, meal) => {
        acc.carbs += meal.nutrition.totalCarbs;
        acc.protein += meal.nutrition.totalProtein;
        acc.fat += meal.nutrition.totalFat;
        return acc;
      },
      { carbs: 0, protein: 0, fat: 0 }
    );
    
    const total = totals.carbs + totals.protein + totals.fat;
    
    return [
      {
        name: 'Carbs',
        value: totals.carbs,
        percentage: total > 0 ? Math.round((totals.carbs / total) * 100) : 0,
        color: '#8884d8'
      },
      {
        name: 'Protein',
        value: totals.protein,
        percentage: total > 0 ? Math.round((totals.protein / total) * 100) : 0,
        color: '#82ca9d'
      },
      {
        name: 'Fat',
        value: totals.fat,
        percentage: total > 0 ? Math.round((totals.fat / total) * 100) : 0,
        color: '#ffc658'
      }
    ];
  }, [filteredMeals]);
  
  // Custom tooltip for charts
  const CustomTooltip = useCallback(({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>
          <p className="tooltip-label">{`Meal Type: ${data.mealType}`}</p>
          <p className="tooltip-carbs">{`Carbs: ${data.carbs.toFixed(1)}g`}</p>
          <p className="tooltip-protein">{`Protein: ${data.protein.toFixed(1)}g`}</p>
          <p className="tooltip-fat">{`Fat: ${data.fat.toFixed(1)}g`}</p>
          <p className="tooltip-calories">{`Calories: ${Math.round(data.calories)}`}</p>
          {data.insulin > 0 && <p className="tooltip-insulin">{`Insulin: ${data.insulin} units`}</p>}
        </div>
      );
    }
    return null;
  }, []);

  // Render meal detail view
  const renderMealDetail = () => {
    if (!detailView) return <div className="no-detail-message">Select a meal to view details</div>;
    
    return (
      <div className="meal-detail-view">
        <h3>Meal Details</h3>
        <div className="meal-detail-header">
          <div className="meal-time">
            <span className="label">Time:</span>
            <span className="value">{detailView.formattedTime}</span>
          </div>
          <div className="meal-type">
            <span className="label">Type:</span>
            <span className={`value ${detailView.mealType}`}>
              {detailView.mealType.charAt(0).toUpperCase() + detailView.mealType.slice(1)}
            </span>
          </div>
        </div>
        
        <div className="meal-nutrition-summary">
          <h4>Nutrition Summary</h4>
          <div className="nutrition-grid">
            <div className="nutrition-item">
              <span className="label">Carbs:</span>
              <span className="value">{detailView.nutrition.totalCarbs.toFixed(1)}g</span>
              <div className="percentage-bar">
                <div 
                  className="percentage-fill carbs" 
                  style={{ width: `${detailView.nutrition.carbPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.carbPercentage}%</span>
            </div>
            
            <div className="nutrition-item">
              <span className="label">Protein:</span>
              <span className="value">{detailView.nutrition.totalProtein.toFixed(1)}g</span>
              <div className="percentage-bar">
                <div 
                  className="percentage-fill protein" 
                  style={{ width: `${detailView.nutrition.proteinPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.proteinPercentage}%</span>
            </div>
            
            <div className="nutrition-item">
              <span className="label">Fat:</span>
              <span className="value">{detailView.nutrition.totalFat.toFixed(1)}g</span>
              <div className="percentage-bar">
                <div 
                  className="percentage-fill fat" 
                  style={{ width: `${detailView.nutrition.fatPercentage}%` }}
                />
              </div>
              <span className="percentage">{detailView.nutrition.fatPercentage}%</span>
            </div>
            
            <div className="nutrition-item">
              <span className="label">Calories:</span>
              <span className="value">{Math.round(detailView.nutrition.totalCalories)}</span>
            </div>
          </div>
        </div>
        
        {detailView.foodItems.length > 0 && (
          <div className="meal-food-items">
            <h4>Food Items</h4>
            <table className="food-items-table">
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Amount</th>
                  <th>Unit</th>
                  <th>Carbs (g)</th>
                  <th>Protein (g)</th>
                  <th>Fat (g)</th>
                  <th>Calories</th>
                </tr>
              </thead>
              <tbody>
                {detailView.foodItems.map((item, index) => (
                  <tr key={index}>
                    <td>{item.name}</td>
                    <td>{item.amount}</td>
                    <td>{item.unit}</td>
                    <td>{item.carbs?.toFixed(1) || '0'}</td>
                    <td>{item.protein?.toFixed(1) || '0'}</td>
                    <td>{item.fat?.toFixed(1) || '0'}</td>
                    <td>{Math.round(item.calories) || '0'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {detailView.insulin.dose > 0 && (
          <div className="meal-insulin">
            <h4>Insulin Information</h4>
            <div className="insulin-details">
              <div className="insulin-item">
                <span className="label">Dose:</span>
                <span className="value">{detailView.insulin.dose} units</span>
              </div>
              {detailView.insulin.type && (
                <div className="insulin-item">
                  <span className="label">Type:</span>
                  <span className="value">{detailView.insulin.type}</span>
                </div>
              )}
              
              {detailView.insulin.calculationFactors && Object.keys(detailView.insulin.calculationFactors).length > 0 && (
                <div className="insulin-factors">
                  <h5>Calculation Factors:</h5>
                  <div className="factors-grid">
                    {Object.entries(detailView.insulin.calculationFactors).map(([key, value]) => (
                      <div className="factor-item" key={key}>
                        <span className="factor-label">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                        <span className="factor-value">
                          {typeof value === 'number' 
                            ? value.toFixed(2) 
                            : JSON.stringify(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        
        {detailView.bloodGlucose && (
          <div className="meal-blood-glucose">
            <h4>Blood Glucose</h4>
            <div className="blood-glucose-value">
              <span className="label">Reading:</span>
              <span className="value">
                {detailView.bloodGlucose} mg/dL
              </span>
            </div>
          </div>
        )}
        
        {detailView.activities && detailView.activities.length > 0 && (
          <div className="meal-activities">
            <h4>Associated Activities</h4>
            <div className="activities-list">
              {detailView.activities.map((activity, index) => (
                <div className="activity-item" key={index}>
                  <div className="activity-level">
                    Level: {activity.level} - {activity.impact.toFixed(2)}x impact
                  </div>
                  {activity.duration && (
                    <div className="activity-duration">Duration: {activity.duration}</div>
                  )}
                  {activity.startTime && (
                    <div className="activity-time">
                      Time: {moment(activity.startTime).format('HH:mm')}
                      {activity.endTime && ` - ${moment(activity.endTime).format('HH:mm')}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {detailView.notes && (
          <div className="meal-notes">
            <h4>Notes</h4>
            <div className="notes-content">{detailView.notes}</div>
          </div>
        )}
        
        <div className="detail-actions">
          <button className="back-button" onClick={() => setActiveView('table')}>
            Back to List
          </button>
        </div>
      </div>
    );
  };

  // Render functions for different chart types
  const renderNutritionChart = () => (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart
        data={chartData}
        margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis} 
          angle={-45}
          textAnchor="end"
          height={70}
        />
        <YAxis />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="carbs" name="Carbs (g)" fill="#8884d8" stackId="nutrition" />
        <Bar dataKey="protein" name="Protein (g)" fill="#82ca9d" stackId="nutrition" />
        <Bar dataKey="fat" name="Fat (g)" fill="#ffc658" stackId="nutrition" />
      </BarChart>
    </ResponsiveContainer>
  );

  const renderCaloriesChart = () => (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
          angle={-45}
          textAnchor="end"
          height={70}
        />
        <YAxis />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="calories" 
          name="Calories"
          stroke="#ff7300" 
          activeDot={{ r: 8 }}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const renderInsulinChart = () => (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={chartData}
        margin={{ top: 20, right: 30, bottom: 60, left: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="timestamp" 
          tickFormatter={formatXAxis}
          angle={-45}
          textAnchor="end"
          height={70}
        />
        <YAxis yAxisId="left" />
        <YAxis yAxisId="right" orientation="right" />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="insulin" 
          name="Insulin (units)"
          stroke="#ff4444" 
          yAxisId="left"
          strokeWidth={2}
        />
        <Line 
          type="monotone" 
          dataKey="carbs" 
          name="Carbs (g)"
          stroke="#8884d8" 
          yAxisId="right"
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  if (constantsLoading) {
    return <div className="loading">Loading patient data...</div>;
  }

  return (
    <div className={`meal-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Meal Data Visualization</h2>}
      
      {/* Timezone info display */}
      {!embedded && (
        <div className="timezone-info">
          Your timezone: {userTimeZone}
          <span className="timezone-note"> (all times displayed in your local timezone)</span>
        </div>
      )}
      
      {/* View mode toggle */}
      <div className="view-toggle">
        <button 
          className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
          onClick={() => handleViewChange('chart')}
        >
          <FaChartBar /> Chart
        </button>
        <button 
          className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
          onClick={() => handleViewChange('table')}
        >
          <FaTable /> Table
        </button>
        <button 
          className={`toggle-btn ${activeView === 'details' ? 'active' : ''}`}
          onClick={() => handleViewChange('details')}
        >
          <FaList /> Details
        </button>
      </div>
      
      {showControls && (
        <div className="controls">
          {/* Date range controls */}
          <div className="date-controls">
            <div className="date-range-inputs">
              <TimeInput 
                mode="daterange"
                value={dateRange}
                onChange={handleDateRangeChange}
                useTimeContext={!!timeContext}
                showPresets={false}
              />
            </div>
            
            <div className="quick-ranges">
              <button onClick={() => applyDatePreset(1)}>
                <FaCalendarAlt /> Today
              </button>
              <button onClick={() => applyDatePreset(7)}>
                <FaCalendarAlt /> Week
              </button>
              <button onClick={() => applyDatePreset(30)}>
                <FaCalendarAlt /> Month
              </button>
            </div>
          </div>
          
          {/* Filter controls */}
          <div className="filter-controls">
            <div className="meal-type-filter">
              <label htmlFor="meal-type-select">
                <FaFilter /> Meal Type:
              </label>
              <select 
                id="meal-type-select"
                value={mealTypeFilter}
                onChange={handleMealTypeChange}
              >
                <option value="all">All Types</option>
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
                <option value="normal">Normal</option>
              </select>
            </div>
            
            <button
              className={`update-btn ${isFetching ? 'loading' : ''}`}
              onClick={handleUpdateData}
              disabled={loading || isFetching}
            >
              <FaSync className={isFetching ? "spin" : ""} />
              {isFetching ? 'Updating...' : 'Update Data'}
            </button>
          </div>
          
          {/* Chart type toggle (only shown in chart view) */}
          {activeView === 'chart' && (
            <div className="chart-type-controls">
              <button
                className={`chart-type-btn ${chartType === 'nutrition' ? 'active' : ''}`}
                onClick={() => handleChartTypeChange('nutrition')}
              >
                Nutrition Distribution
              </button>
              <button
                className={`chart-type-btn ${chartType === 'calories' ? 'active' : ''}`}
                onClick={() => handleChartTypeChange('calories')}
              >
                Calories
              </button>
              <button
                className={`chart-type-btn ${chartType === 'insulin' ? 'active' : ''}`}
                onClick={() => handleChartTypeChange('insulin')}
              >
                Insulin & Carbs
              </button>
            </div>
          )}
        </div>
      )}
      
      {error && <div className="error-message">{error}</div>}
      
      {loading ? (
        <div className="loading">Loading meal data...</div>
      ) : (
        <div className="content-container">
          {filteredMeals.length === 0 ? (
            <div className="no-data-message">
              No meals found for the selected date range and filters.
            </div>
          ) : (
            <>
              {activeView === 'chart' && (
                <div className="chart-container" ref={chartRef}>
                  {chartType === 'nutrition' && renderNutritionChart()}
                  {chartType === 'calories' && renderCaloriesChart()}
                  {chartType === 'insulin' && renderInsulinChart()}
                </div>
              )}
              
              {activeView === 'table' && (
                <div className="table-container">
                  <table {...getTableProps()} className="meal-table">
                    <thead>
                      {headerGroups.map(headerGroup => {
                        const { key, ...headerGroupProps } = headerGroup.getHeaderGroupProps();
                        return (
                          <tr key={key || Math.random()} {...headerGroupProps}>
                            {headerGroup.headers.map(column => {
                              const { key, ...columnProps } = column.getHeaderProps(column.getSortByToggleProps());
                              return (
                                <th key={key || Math.random()} {...columnProps}>
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
                          </tr>
                        );
                      })}
                    </thead>
                    <tbody {...getTableBodyProps()}>
                      {page.map(row => {
                        prepareRow(row);
                        const { key, ...rowProps } = row.getRowProps();
                        return (
                          <tr 
                            key={key || Math.random()} 
                            {...rowProps}
                            className={`meal-row meal-type-${row.original.mealType}`}
                          >
                            {row.cells.map(cell => {
                              const { key, ...cellProps } = cell.getCellProps();
                              return (
                                <td key={key || Math.random()} {...cellProps}>
                                  {cell.render('Cell')}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  <div className="pagination">
                    <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
                    <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
                    <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
                    <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
                    <span>
                      Page{' '}
                      <strong>
                        {pageIndex + 1} of {pageOptions.length || 1}
                      </strong>
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
                      />
                    </span>
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
              )}
              
              {activeView === 'details' && (
                <div className="detail-container">
                  {renderMealDetail()}
                </div>
              )}
            </>
          )}
        </div>
      )}
      
      {/* Statistics summary - shown at bottom of all views */}
      {!loading && filteredMeals.length > 0 && (
        <div className="meal-statistics">
          <h3>Summary Statistics</h3>
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Total Meals:</span>
              <span className="stat-value">{filteredMeals.length}</span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Avg. Carbs:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + meal.nutrition.totalCarbs, 0) / filteredMeals.length).toFixed(1)}g
              </span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Avg. Protein:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + meal.nutrition.totalProtein, 0) / filteredMeals.length).toFixed(1)}g
              </span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Avg. Fat:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + meal.nutrition.totalFat, 0) / filteredMeals.length).toFixed(1)}g
              </span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Avg. Calories:</span>
              <span className="stat-value">
                {Math.round(filteredMeals.reduce((sum, meal) => sum + meal.nutrition.totalCalories, 0) / filteredMeals.length)}
              </span>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Avg. Insulin:</span>
              <span className="stat-value">
                {(filteredMeals.reduce((sum, meal) => sum + meal.insulin.dose, 0) / filteredMeals.length).toFixed(1)} units
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MealVisualization;