import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Brush, Area, AreaChart 
} from 'recharts';
import TimeEffect from '../../utils/TimeEffect';
import TimeManager from '../../utils/TimeManager';
import { useConstants } from '../../contexts/ConstantsContext';
import moment from 'moment';
import { FaInfoCircle, FaFilter, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import './InsulinEffectChart.css';

const InsulinEffectChart = ({ 
  patientId, 
  daysToShow = 3,
  height = 500,
  showFilters = true
}) => {
  const { patientConstants } = useConstants();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [insulinDoses, setInsulinDoses] = useState([]);
  const [bloodSugarReadings, setBloodSugarReadings] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [availableInsulinTypes, setAvailableInsulinTypes] = useState([]);
  const [timeRange, setTimeRange] = useState(daysToShow);
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [chartResolution, setChartResolution] = useState(15); // minutes between data points
  const [targetRangeMin, setTargetRangeMin] = useState(80);
  const [targetRangeMax, setTargetRangeMax] = useState(180);
  const [activeDose, setActiveDose] = useState(null);

  // Fetch data on component mount
  useEffect(() => {
    fetchData();
  }, [patientId, timeRange]);

  // Generate chart data whenever our source data changes
  useEffect(() => {
    if (insulinDoses.length > 0 || bloodSugarReadings.length > 0) {
      generateChartData();
    }
  }, [insulinDoses, bloodSugarReadings, selectedInsulinTypes, chartResolution]);

  // Set initial insulin type filters
  useEffect(() => {
    if (availableInsulinTypes.length > 0 && selectedInsulinTypes.length === 0) {
      setSelectedInsulinTypes(availableInsulinTypes.map(type => type.id));
    }
  }, [availableInsulinTypes]);

  // Fetch insulin doses and blood sugar readings
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error("Authentication token not found");

      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - timeRange);

      // Fetch insulin doses
      const insulinResponse = await axios.get(
        `/api/medication-logs/recent`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { 
            medication_type: 'insulin',
            days: timeRange,
            limit: 100
          }
        }
      );

      // Fetch blood sugar readings
      const bsResponse = await axios.get(
        `/api/blood-sugar/history`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString()
          }
        }
      );

      // Process insulin doses
      const doses = insulinResponse.data.logs.map(log => ({
        id: log._id,
        medication: log.medication,
        dose: log.dose,
        timestamp: new Date(log.taken_at || log.scheduled_time),
        notes: log.notes || '',
        mealId: log.meal_id,
        mealType: log.meal_type || 'unknown',
        bloodSugar: log.blood_sugar,
        suggestedDose: log.suggested_dose,
        administrationTime: new Date(log.taken_at || log.scheduled_time)
      }));

      // Extract unique insulin types
      const insulinTypes = [...new Set(doses.map(dose => dose.medication))];
      setAvailableInsulinTypes(
        insulinTypes.map(type => ({
          id: type,
          name: formatInsulinName(type),
          color: getInsulinColor(type)
        }))
      );
      
      // Process blood sugar readings
      const readings = bsResponse.data.readings.map(reading => ({
        id: reading._id,
        value: reading.value,
        timestamp: new Date(reading.timestamp),
        source: reading.source || 'manual'
      }));

      setInsulinDoses(doses);
      setBloodSugarReadings(readings);
    } catch (err) {
      console.error("Error fetching data for chart:", err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Generate time-series data for the chart
  const generateChartData = () => {
    if (!patientConstants) return;
    
    // Determine time range
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - timeRange);
    
    // Create time points for the entire range at the specified resolution
    const dataPoints = [];
    const currentPoint = new Date(startDate);
    while (currentPoint <= endDate) {
      dataPoints.push({
        timestamp: new Date(currentPoint),
        formattedTime: moment(currentPoint).format('MM/DD HH:mm'),
        glucoseValue: null,
        insulinEffect: {}, // Will store effect of each insulin dose
        totalInsulinEffect: 0, // Combined effect of all insulin doses
        activeDoses: [], // Insulin doses active at this time
      });
      
      // Increment by resolution minutes
      currentPoint.setMinutes(currentPoint.getMinutes() + chartResolution);
    }

    // Add blood sugar readings to data points
    bloodSugarReadings.forEach(reading => {
      // Find the closest data point to this reading
      const closestPoint = dataPoints.reduce((closest, point) => {
        const currentDiff = Math.abs(point.timestamp - reading.timestamp);
        const closestDiff = Math.abs(closest.timestamp - reading.timestamp);
        return currentDiff < closestDiff ? point : closest;
      }, dataPoints[0]);
      
      if (closestPoint) {
        closestPoint.glucoseValue = reading.value;
        closestPoint.isReading = true;
        closestPoint.readingSource = reading.source;
      }
    });

    // Calculate insulin effects for each dose
    const filteredDoses = insulinDoses.filter(
      dose => selectedInsulinTypes.includes(dose.medication)
    );
    
    filteredDoses.forEach(dose => {
      const insulinProfile = patientConstants.medication_factors[dose.medication];
      if (!insulinProfile) return;
      
      dataPoints.forEach(point => {
        // Calculate hours since administration
        const hoursSince = (point.timestamp - dose.timestamp) / (1000 * 60 * 60);
        
        // Skip if this is before the insulin was administered
        if (hoursSince < 0) return;
        
        // Calculate effect based on pharmacokinetics
        const effect = calculateInsulinEffect(hoursSince, dose, insulinProfile);
        
        // Store individual effect
        if (effect > 0) {
          point.insulinEffect[dose.id] = {
            value: effect,
            medication: dose.medication,
            dose: dose.dose,
            color: getInsulinColor(dose.medication)
          };
          
          // Add to total effect
          point.totalInsulinEffect += effect;
          
          // Add to active doses
          point.activeDoses.push({
            id: dose.id,
            medication: dose.medication,
            dose: dose.dose,
            effect: effect,
            percentRemaining: calculatePercentRemaining(hoursSince, insulinProfile),
            color: getInsulinColor(dose.medication)
          });
        }
      });
    });

    // Add insulin administration markers
    filteredDoses.forEach(dose => {
      // Find closest data point to this dose
      const closestPoint = dataPoints.reduce((closest, point) => {
        const currentDiff = Math.abs(point.timestamp - dose.timestamp);
        const closestDiff = Math.abs(closest.timestamp - dose.timestamp);
        return currentDiff < closestDiff ? point : closest;
      }, dataPoints[0]);
      
      if (closestPoint) {
        if (!closestPoint.insulinDoses) closestPoint.insulinDoses = [];
        closestPoint.insulinDoses.push({
          id: dose.id,
          medication: dose.medication,
          dose: dose.dose,
          color: getInsulinColor(dose.medication),
          bloodSugar: dose.bloodSugar,
          mealType: dose.mealType
        });
      }
    });
    
    // Set the processed data for the chart
    setChartData(dataPoints);
  };

  // Calculate the effect of insulin at a given time point
  const calculateInsulinEffect = (hoursSince, dose, insulinProfile) => {
    const { onset_hours = 0.5, peak_hours = 2, duration_hours = 4 } = insulinProfile;
    
    // Check if insulin is still active
    if (hoursSince > duration_hours) return 0;
    
    // Calculate effect based on insulin phase
    let effectStrength = 0;
    
    if (hoursSince < onset_hours) {
      // Ramping up to onset
      effectStrength = (hoursSince / onset_hours) * 0.2;
    } else if (hoursSince < peak_hours) {
      // Building from onset to peak
      effectStrength = 0.2 + ((hoursSince - onset_hours) / (peak_hours - onset_hours)) * 0.8;
    } else if (hoursSince < duration_hours) {
      // Declining from peak to end
      effectStrength = 1.0 - ((hoursSince - peak_hours) / (duration_hours - peak_hours));
    }
    
    // Scale by dose
    return effectStrength * dose.dose;
  };

  const calculatePercentRemaining = (hoursSince, insulinProfile) => {
    const { duration_hours = 4 } = insulinProfile;
    return Math.max(0, 100 * (1 - (hoursSince / duration_hours)));
  };

  // Format insulin name for display
  const formatInsulinName = (insulinType) => {
    if (!insulinType) return '';
    
    const insulin = patientConstants?.medication_factors?.[insulinType];
    if (!insulin) return insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    
    return `${insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${insulin.type.split('_')[0]} acting)`;
  };

  // Get color for insulin type
  const getInsulinColor = (insulinType) => {
    const colors = {
      'rapid_acting': '#FF5733',
      'short_acting': '#33A8FF',
      'intermediate_acting': '#7D33FF',
      'long_acting': '#33FF57',
      'mixed': '#FF33A8'
    };
    
    const insulin = patientConstants?.medication_factors?.[insulinType];
    if (!insulin) return '#888888';
    
    const type = insulin.type.split('_')[0];
    return colors[type] || '#888888';
  };

  const handleDoseClick = (dose) => {
    setActiveDose(activeDose?.id === dose.id ? null : dose);
  };

  const handleInsulinTypeChange = (insulinType) => {
    setSelectedInsulinTypes(prev => {
      if (prev.includes(insulinType)) {
        return prev.filter(type => type !== insulinType);
      } else {
        return [...prev, insulinType];
      }
    });
  };

  const handleTimeRangeChange = (e) => {
    setTimeRange(Number(e.target.value));
  };

  const handleResolutionChange = (e) => {
    setChartResolution(Number(e.target.value));
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || !payload.length) return null;
    
    const data = payload[0].payload;
    
    return (
      <div className="insulin-effect-tooltip">
        <p className="tooltip-time">{data.formattedTime}</p>
        
        {data.glucoseValue !== null && (
          <p className="tooltip-bs">
            Blood Sugar: <strong>{data.glucoseValue} mg/dL</strong>
            {data.isReading && <span className="tooltip-source">({data.readingSource})</span>}
          </p>
        )}
        
        {data.totalInsulinEffect > 0 && (
          <p className="tooltip-effect">
            Insulin Activity: <strong>{data.totalInsulinEffect.toFixed(2)} units</strong>
          </p>
        )}
        
        {data.activeDoses?.length > 0 && (
          <div className="tooltip-active-insulin">
            <p className="tooltip-section-title">Active Insulin:</p>
            <ul>
              {data.activeDoses.map(activeDose => (
                <li key={activeDose.id} style={{ color: activeDose.color }}>
                  {formatInsulinName(activeDose.medication)}: 
                  <strong> {activeDose.effect.toFixed(2)} units</strong>
                  <span className="tooltip-remaining"> ({activeDose.percentRemaining.toFixed(0)}% remaining)</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {data.insulinDoses?.length > 0 && (
          <div className="tooltip-doses">
            <p className="tooltip-section-title">Doses administered:</p>
            <ul>
              {data.insulinDoses.map(dose => (
                <li key={dose.id} style={{ color: dose.color }}>
                  {formatInsulinName(dose.medication)}: <strong>{dose.dose} units</strong>
                  {dose.bloodSugar && <div>BS: {dose.bloodSugar} mg/dL</div>}
                  {dose.mealType && <div>Context: {dose.mealType}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  // Handle loading and error states
  if (loading) {
    return <div className="insulin-effect-chart-loading">Loading insulin data...</div>;
  }

  if (error) {
    return <div className="insulin-effect-chart-error">{error}</div>;
  }

  return (
    <div className="insulin-effect-chart-container">
      <h2 className="chart-title">
        Insulin Effect & Blood Sugar Monitoring
        <span className="chart-info-icon" title="Shows insulin effect curves and blood sugar readings over time">
          <FaInfoCircle />
        </span>
      </h2>
      
      {showFilters && (
        <div className="chart-filters">
          <button 
            className="filter-toggle-button"
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
          >
            <FaFilter /> Filters {showFiltersPanel ? <FaChevronUp /> : <FaChevronDown />}
          </button>
          
          {showFiltersPanel && (
            <div className="filters-panel">
              <div className="filter-section">
                <h4>Time Range</h4>
                <select value={timeRange} onChange={handleTimeRangeChange}>
                  <option value="1">Last 24 hours</option>
                  <option value="3">Last 3 days</option>
                  <option value="7">Last week</option>
                  <option value="14">Last 2 weeks</option>
                  <option value="30">Last month</option>
                </select>
              </div>
              
              <div className="filter-section">
                <h4>Chart Resolution</h4>
                <select value={chartResolution} onChange={handleResolutionChange}>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>
              
              <div className="filter-section">
                <h4>Insulin Types</h4>
                <div className="insulin-type-checkboxes">
                  {availableInsulinTypes.map(type => (
                    <div className="insulin-type-checkbox" key={type.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={selectedInsulinTypes.includes(type.id)}
                          onChange={() => handleInsulinTypeChange(type.id)}
                        />
                        <span className="insulin-color-indicator" style={{ backgroundColor: type.color }}></span>
                        {type.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="filter-section">
                <h4>Target Range</h4>
                <div className="range-inputs">
                  <label>
                    Min:
                    <input 
                      type="number" 
                      value={targetRangeMin} 
                      onChange={(e) => setTargetRangeMin(Number(e.target.value))} 
                      min="40" 
                      max="200" 
                    />
                  </label>
                  <label>
                    Max:
                    <input 
                      type="number" 
                      value={targetRangeMax} 
                      onChange={(e) => setTargetRangeMax(Number(e.target.value))} 
                      min="100" 
                      max="300" 
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="formattedTime" 
              tick={{ fontSize: 12 }}
              interval={Math.floor(chartData.length / 10)}
            />
            <YAxis 
              yAxisId="glucose"
              domain={[0, 'auto']}
              label={{ value: 'Blood Sugar (mg/dL)', angle: -90, position: 'insideLeft' }}
            />
            <YAxis 
              yAxisId="insulin"
              orientation="right"
              domain={[0, 'auto']}
              label={{ value: 'Active Insulin (units)', angle: 90, position: 'insideRight' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            
            {/* Target range */}
            <ReferenceLine y={targetRangeMin} yAxisId="glucose" stroke="#82ca9d" strokeDasharray="3 3" />
            <ReferenceLine y={targetRangeMax} yAxisId="glucose" stroke="#ff7300" strokeDasharray="3 3" />
            
            {/* Blood sugar line */}
            <Line
              yAxisId="glucose"
              type="monotone"
              dataKey="glucoseValue"
              stroke="#8884d8"
              dot={(props) => {
                const { cx, cy, payload } = props;
                if (!payload.isReading) return null;
                return (
                  <circle 
                    cx={cx} 
                    cy={cy} 
                    r={5} 
                    fill={payload.readingSource === 'cgm' ? '#8884d8' : '#FF5733'} 
                    stroke="#fff" 
                  />
                );
              }}
              activeDot={{ r: 8 }}
              connectNulls={false}
              name="Blood Sugar"
            />
            
            {/* Total insulin effect */}
            <Line
              yAxisId="insulin"
              type="monotone"
              dataKey="totalInsulinEffect"
              stroke="#82ca9d"
              strokeWidth={2}
              dot={false}
              name="Insulin Activity"
            />
            
            {/* Individual insulin markers */}
            {chartData.some(d => d.insulinDoses?.length > 0) && (
              <Line
                yAxisId="insulin"
                dataKey={(dataPoint) => {
                  if (!dataPoint.insulinDoses?.length) return null;
                  // Return max value for visibility
                  return Math.max(...dataPoint.insulinDoses.map(d => d.dose));
                }}
                stroke="none"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (!payload.insulinDoses?.length) return null;
                  
                  // Show one marker per dose
                  return payload.insulinDoses.map((dose, index) => (
                    <svg 
                      key={dose.id} 
                      x={cx - 10} 
                      y={cy - 20 - (index * 10)}
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24"
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleDoseClick(dose)}
                    >
                      <rect 
                        x="2" 
                        y="2" 
                        width="20" 
                        height="20" 
                        rx="4"
                        fill={dose.color} 
                        fillOpacity="0.8" 
                      />
                      <text 
                        x="12" 
                        y="15" 
                        textAnchor="middle" 
                        fill="white" 
                        fontSize="12"
                      >
                        {dose.dose}
                      </text>
                    </svg>
                  ));
                }}
                name="Insulin Doses"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-marker bs-marker"></span>
          <span>Blood Sugar Reading</span>
        </div>
        <div className="legend-item">
          <span className="legend-marker cgm-marker"></span>
          <span>CGM Reading</span>
        </div>
        <div className="legend-item">
          <span className="legend-marker insulin-marker"></span>
          <span>Active Insulin</span>
        </div>
        <div className="legend-item">
          <span className="legend-line target-min"></span>
          <span>Target Minimum</span>
        </div>
        <div className="legend-item">
          <span className="legend-line target-max"></span>
          <span>Target Maximum</span>
        </div>
      </div>
      
      {activeDose && (
        <div className="active-dose-details">
          <h3>Dose Details</h3>
          <button className="close-button" onClick={() => setActiveDose(null)}>×</button>
          <div className="dose-info">
            <p><strong>Insulin:</strong> {formatInsulinName(activeDose.medication)}</p>
            <p><strong>Dose:</strong> {activeDose.dose} units</p>
            {activeDose.bloodSugar && (
              <p><strong>Blood Sugar:</strong> {activeDose.bloodSugar} mg/dL</p>
            )}
            {activeDose.mealType && (
              <p><strong>Context:</strong> {activeDose.mealType}</p>
            )}
            
            <div className="effect-timeline">
              <h4>Effect Timeline</h4>
              <div className="timeline-visualization">
                {patientConstants?.medication_factors?.[activeDose.medication] && (
                  <>
                    <div className="timeline-bar">
                      <div className="onset-marker" style={{
                        left: `${(patientConstants.medication_factors[activeDose.medication].onset_hours / 
                            patientConstants.medication_factors[activeDose.medication].duration_hours) * 100}%`
                      }}>
                        <span>Onset</span>
                        <div className="time-label">
                          {patientConstants.medication_factors[activeDose.medication].onset_hours}h
                        </div>
                      </div>
                      <div className="peak-marker" style={{
                        left: `${(patientConstants.medication_factors[activeDose.medication].peak_hours / 
                            patientConstants.medication_factors[activeDose.medication].duration_hours) * 100}%`
                      }}>
                        <span>Peak</span>
                        <div className="time-label">
                          {patientConstants.medication_factors[activeDose.medication].peak_hours}h
                        </div>
                      </div>
                      <div className="duration-line"></div>
                    </div>
                    <div className="timeline-labels">
                      <span>0h</span>
                      <span>{patientConstants.medication_factors[activeDose.medication].duration_hours}h</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinEffectChart;