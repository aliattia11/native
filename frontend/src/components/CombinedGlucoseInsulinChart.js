import React, { useState, useEffect, useCallback } from 'react';
import { Line, Area, Bar, ReferenceLine } from 'recharts';
import axios from 'axios';
import moment from 'moment';
import BaseTimeSeriesVisualization from './Charts/BaseTimeSeriesVisualization';
import TimeEffect from '../utils/TimeEffect';
import { useConstants } from '../contexts/ConstantsContext';
import { useTable, useSortBy, usePagination } from 'react-table';
import './CombinedGlucoseInsulinChart.css';

/**
 * CombinedGlucoseInsulinChart - Component that shows blood sugar levels with insulin effects
 * Extends BaseTimeSeriesVisualization to integrate both data types
 */
const CombinedGlucoseInsulinChart = ({ isDoctor = false, patientId = null }) => {
  // Use constants context for patient-specific insulin parameters
  const { patientConstants } = useConstants();

  // State management
  const [bloodSugarData, setBloodSugarData] = useState([]);
  const [insulinData, setInsulinData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(3, 'days').format('YYYY-MM-DD'),
    end: moment().format('YYYY-MM-DD')
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [displayOptions, setDisplayOptions] = useState({
    showBloodSugar: true,
    showInsulinDoses: true,
    showInsulinEffect: true,
    showEstimatedGlucose: true,
    includeFutureEffect: true,
    futureHours: 7
  });
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [targetGlucose, setTargetGlucose] = useState(100);
  const [unit, setUnit] = useState('mg/dL');

  // Helper function to get insulin parameters from patient constants
  const getInsulinParameters = useCallback((insulinType) => {
    // Default parameters as fallback
    const defaultParams = {
      onset_hours: 0.5,
      peak_hours: 2,
      duration_hours: 5,
      type: 'short_acting'
    };

    // Get medication factors from patient constants
    const medicationFactors = patientConstants.medication_factors || {};

    // Return patient-specific parameters if available, otherwise use defaults
    return medicationFactors[insulinType] || defaultParams;
  }, [patientConstants]);

  // Fetch blood sugar and insulin data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Calculate the date range including future hours
      const endDate = moment(dateRange.end)
        .add(displayOptions.includeFutureEffect ? displayOptions.futureHours : 0, 'hours')
        .format('YYYY-MM-DD');

      // Parallel requests for blood sugar and insulin data
      const [bloodSugarResponse, insulinResponse] = await Promise.all([
        axios.get(
          `http://localhost:5000/api/blood-sugar?start_date=${dateRange.start}&end_date=${endDate}${patientId ? `&patient_id=${patientId}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        axios.get(
          `http://localhost:5000/api/insulin-data?days=30&end_date=${endDate}${patientId ? `&patient_id=${patientId}` : ''}`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      ]);

      // Process blood sugar data
      const processedBloodSugarData = bloodSugarResponse.data.map(reading => {
        // Use reading time if available, otherwise use recording time
        const readingTime = moment(reading.bloodSugarTimestamp || reading.timestamp);

        return {
          id: reading._id,
          bloodSugar: reading.bloodSugar,
          readingTime: readingTime.valueOf(),
          timestamp: readingTime.valueOf(), // Common key for timeline
          formattedTime: readingTime.format('MM/DD/YYYY, HH:mm'),
          status: reading.status || getBloodSugarStatus(reading.bloodSugar, reading.target || targetGlucose),
          notes: reading.notes || '',
          target: reading.target || targetGlucose
        };
      });

      // Extract target glucose from first reading if available
      if (processedBloodSugarData.length > 0 && processedBloodSugarData[0].target) {
        setTargetGlucose(processedBloodSugarData[0].target);
      }

      // Process insulin data
      const insulinLogs = insulinResponse.data.insulin_logs || [];

      // Extract unique insulin types
      const types = [...new Set(insulinLogs.map(log => log.medication))];
      setInsulinTypes(types);

      // Only set selectedInsulinTypes if it's empty and we have types
      if (selectedInsulinTypes.length === 0 && types.length > 0) {
        setSelectedInsulinTypes(types);
      }

      // Process and enhance insulin data
      const processedInsulinData = insulinLogs.map(log => {
        // Parse administration time
        const adminTime = moment(log.taken_at);

        return {
          id: log.id || `insulin-${adminTime.valueOf()}`,
          medication: log.medication,
          dose: log.dose,
          administrationTime: adminTime.valueOf(),
          timestamp: adminTime.valueOf(), // Common key for timeline
          formattedTime: adminTime.format('MM/DD/YYYY, HH:mm'),
          notes: log.notes || '',
          mealType: log.meal_type || 'N/A',
          bloodSugar: log.blood_sugar,
          suggestedDose: log.suggested_dose,
          // Include pharmacokinetics from the API
          pharmacokinetics: log.pharmacokinetics || getInsulinParameters(log.medication)
        };
      });

      // Store processed data
      setBloodSugarData(processedBloodSugarData);
      setInsulinData(processedInsulinData);

      // Generate combined timeline data
      const combined = generateCombinedData(processedBloodSugarData, processedInsulinData);
      setCombinedData(combined);

      setError('');
      setLoading(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to load data. Please try again.');
      setLoading(false);
    }
  }, [dateRange, displayOptions.includeFutureEffect, displayOptions.futureHours,
       getInsulinParameters, patientId, selectedInsulinTypes.length, targetGlucose]);

  // Effect to fetch data once when component mounts and when necessary params change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Helper function to determine blood sugar status
  const getBloodSugarStatus = (bloodSugar, target) => {
    if (bloodSugar < target * 0.7) return { color: '#ff4444', label: 'Low' };
    if (bloodSugar > target * 1.3) return { color: '#ff8800', label: 'High' };
    return { color: '#00C851', label: 'Normal' };
  };

  // Calculate insulin effect at a given time point
  const calculateInsulinEffect = useCallback((hoursSinceDose, dose, onsetHours, peakHours, durationHours) => {
    // Return 0 if outside the duration window
    if (hoursSinceDose < 0 || hoursSinceDose > durationHours) {
      return 0;
    }

    // For "peakless" insulins like glargine or detemir
    if (peakHours === null) {
      // Simple flat effect after onset
      if (hoursSinceDose < onsetHours) {
        return dose * (hoursSinceDose / onsetHours) * 0.5;
      } else {
        return dose * 0.5 * (1 - ((hoursSinceDose - onsetHours) / (durationHours - onsetHours)));
      }
    }

    // For insulins with a peak (calculate using a triangular model)
    let effect = 0;

    // Rising phase (onset to peak)
    if (hoursSinceDose < peakHours) {
      if (hoursSinceDose < onsetHours) {
        effect = dose * (hoursSinceDose / onsetHours) * (peakHours / durationHours);
      } else {
        effect = dose * (hoursSinceDose / peakHours);
      }
    }
    // Falling phase (peak to end)
    else {
      effect = dose * (1 - ((hoursSinceDose - peakHours) / (durationHours - peakHours)));
    }

    return Math.max(0, effect);
  }, []);

  // Function to estimate blood glucose based on insulin
  const estimateGlucoseWithInsulin = useCallback((bloodSugarPoints, insulinPoints, startTime, endTime) => {
    // Sort blood sugar and insulin points by time
    const sortedBS = [...bloodSugarPoints].sort((a, b) => a.readingTime - b.readingTime);
    const sortedInsulin = [...insulinPoints].sort((a, b) => a.administrationTime - b.administrationTime);

    // Constants for estimation
    const insulinSensitivity = patientConstants.insulin_sensitivity_factor || 50; // mg/dL per unit
    const returnToTargetRate = 5; // mg/dL per hour natural tendency to return to target

    // Timeline points every 15 minutes
    const interval = 15 * 60 * 1000; // 15 minutes in milliseconds
    const estimates = [];
    let currentTime = startTime;

    while (currentTime <= endTime) {
      // Find the closest blood sugar reading before current time
      let lastBS = null;
      for (let i = sortedBS.length - 1; i >= 0; i--) {
        if (sortedBS[i].readingTime <= currentTime) {
          lastBS = sortedBS[i];
          break;
        }
      }

      // If no prior readings, use target glucose
      const baselineGlucose = lastBS ? lastBS.bloodSugar : targetGlucose;
      let estimatedGlucose = baselineGlucose;

      // Calculate cumulative insulin effect
      let insulinEffect = 0;
      for (const insulin of sortedInsulin) {
        if (!selectedInsulinTypes.includes(insulin.medication)) continue;

        const hoursSinceDose = (currentTime - insulin.administrationTime) / (60 * 60 * 1000);
        if (hoursSinceDose < 0) continue; // Future dose

        const params = getInsulinParameters(insulin.medication);
        const effect = calculateInsulinEffect(
          hoursSinceDose,
          insulin.dose,
          params.onset_hours,
          params.peak_hours,
          params.duration_hours
        );

        insulinEffect += effect;
      }

      // Calculate hours since last reading
      const hoursSinceLastReading = lastBS ? (currentTime - lastBS.readingTime) / (60 * 60 * 1000) : 0;

      // Apply insulin effect (each unit lowers glucose by insulin sensitivity factor)
      estimatedGlucose -= insulinEffect * insulinSensitivity / 10; // Scaled effect

      // Natural tendency to return to target over time
      if (hoursSinceLastReading > 0) {
        const returnEffect = Math.min(
          Math.abs(estimatedGlucose - targetGlucose),
          returnToTargetRate * hoursSinceLastReading
        );

        if (estimatedGlucose > targetGlucose) {
          estimatedGlucose -= returnEffect;
        } else if (estimatedGlucose < targetGlucose) {
          estimatedGlucose += returnEffect;
        }
      }

      // Don't go below physiological minimum
      estimatedGlucose = Math.max(40, estimatedGlucose);

      // Add to timeline
      estimates.push({
        timestamp: currentTime,
        estimatedGlucose: Math.round(estimatedGlucose),
        formattedTime: moment(currentTime).format('MM/DD/YYYY, HH:mm'),
        insulinEffect: insulinEffect,
        status: getBloodSugarStatus(estimatedGlucose, targetGlucose)
      });

      currentTime += interval;
    }

    return estimates;
  }, [calculateInsulinEffect, getInsulinParameters, patientConstants.insulin_sensitivity_factor,
      selectedInsulinTypes, targetGlucose]);

  // Generate combined data for timeline visualization
  const generateCombinedData = useCallback((bloodGlucoseData, insulinData) => {
    try {
      // Find the earliest and latest timestamps
      const allTimestamps = [
        ...bloodGlucoseData.map(d => d.readingTime),
        ...insulinData.map(d => d.administrationTime)
      ];

      if (allTimestamps.length === 0) {
        return [];
      }

      const minTime = Math.min(...allTimestamps);
      let maxTime = Math.max(...allTimestamps);

      // If including future effects, extend the timeline
      if (displayOptions.includeFutureEffect) {
        const futureTime = moment().add(displayOptions.futureHours, 'hours').valueOf();
        maxTime = Math.max(maxTime, futureTime);
      }

      // Get glucose estimates that incorporate insulin effects
      const estimates = displayOptions.showEstimatedGlucose
        ? estimateGlucoseWithInsulin(bloodGlucoseData, insulinData, minTime, maxTime)
        : [];

      // Generate timeline with 15-minute intervals
      const timelineData = [];
      let currentTime = minTime;
      const interval = 15 * 60 * 1000; // 15 minutes

      while (currentTime <= maxTime) {
        // Create data point for this time
        const timePoint = {
          timestamp: currentTime,
          formattedTime: moment(currentTime).format('MM/DD/YYYY, HH:mm'),
          insulinDoses: {},
          insulinEffects: {},
          totalInsulinEffect: 0
        };

        // Add blood sugar reading if available at this time
        const searchTime = currentTime;
        const closestBloodSugar = bloodGlucoseData.find(bs =>
          Math.abs(bs.readingTime - searchTime) < 5 * 60 * 1000 // Within 5 minutes
        );

        if (closestBloodSugar) {
          timePoint.bloodSugar = closestBloodSugar.bloodSugar;
          timePoint.bloodSugarStatus = closestBloodSugar.status;
          timePoint.bloodSugarNotes = closestBloodSugar.notes;
        }

        // Find estimated glucose for this time point
        const estimatePoint = estimates.find(est => est.timestamp === currentTime);
        if (estimatePoint) {
          timePoint.estimatedGlucose = estimatePoint.estimatedGlucose;
        }

        // Calculate insulin doses and effects at this time
        if (displayOptions.showInsulinDoses || displayOptions.showInsulinEffect) {
          insulinData.forEach(dose => {
            if (!selectedInsulinTypes.includes(dose.medication)) return;

            // Record doses given at this time
            if (displayOptions.showInsulinDoses &&
                Math.abs(dose.administrationTime - currentTime) < 5 * 60 * 1000) { // Within 5 minutes
              timePoint.insulinDoses[dose.medication] =
                (timePoint.insulinDoses[dose.medication] || 0) + dose.dose;
            }

            // Calculate effect for this time point
            if (displayOptions.showInsulinEffect) {
              const hoursSinceDose = (currentTime - dose.administrationTime) / (60 * 60 * 1000);

              // Calculate effects for past doses and future projections if enabled
              if (hoursSinceDose >= 0 || displayOptions.includeFutureEffect) {
                const insulinParams = getInsulinParameters(dose.medication);
                const effect = calculateInsulinEffect(
                  hoursSinceDose,
                  dose.dose,
                  insulinParams.onset_hours,
                  insulinParams.peak_hours,
                  insulinParams.duration_hours
                );

                if (effect > 0) {
                  timePoint.insulinEffects[dose.medication] =
                    (timePoint.insulinEffects[dose.medication] || 0) + effect;
                  timePoint.totalInsulinEffect += effect;
                }
              }
            }
          });
        }

        timelineData.push(timePoint);
        currentTime += interval;
      }

      return timelineData;
    } catch (error) {
      console.error('Error generating combined data:', error);
      return [];
    }
  }, [
    calculateInsulinEffect,
    displayOptions.includeFutureEffect,
    displayOptions.futureHours,
    displayOptions.showEstimatedGlucose,
    displayOptions.showInsulinDoses,
    displayOptions.showInsulinEffect,
    estimateGlucoseWithInsulin,
    getInsulinParameters,
    selectedInsulinTypes
  ]);

  // Handle insulin type toggle
  const handleInsulinTypeToggle = (insulinType) => {
    setSelectedInsulinTypes(prev => {
      if (prev.includes(insulinType)) {
        return prev.filter(type => type !== insulinType);
      } else {
        return [...prev, insulinType];
      }
    });
  };

  // Handle display options change
  const handleDisplayOptionChange = (option) => {
    setDisplayOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  // Custom tooltip for the chart
  const renderTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;

      return (
        <div className="combined-tooltip">
          <p className="tooltip-time">{data.formattedTime}</p>

          {/* Blood sugar section */}
          {data.bloodSugar && (
            <div className="tooltip-section">
              <p className="tooltip-header">Blood Sugar:</p>
              <p className="tooltip-blood-sugar" style={{ color: data.bloodSugarStatus?.color }}>
                {data.bloodSugar} {unit}
              </p>
            </div>
          )}

          {/* Estimated glucose section */}
          {data.estimatedGlucose && (
            <div className="tooltip-section">
              <p className="tooltip-header">Estimated Glucose:</p>
              <p className="tooltip-blood-sugar">
                {data.estimatedGlucose} {unit}
              </p>
            </div>
          )}

          {/* Insulin doses section */}
          {Object.entries(data.insulinDoses || {}).length > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Insulin Doses:</p>
              {Object.entries(data.insulinDoses).map(([type, dose], idx) => (
                <p key={idx} className="tooltip-dose">
                  {type.replace(/_/g, ' ')} - {dose} units
                </p>
              ))}
            </div>
          )}

          {/* Insulin effect section */}
          {data.totalInsulinEffect > 0 && (
            <div className="tooltip-section">
              <p className="tooltip-header">Active Insulin:</p>
              <p className="tooltip-effect">Total: {data.totalInsulinEffect.toFixed(2)} units</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  // Helper function to get color for insulin types
  const getInsulinColor = (insulinType, index, isEffect = false) => {
    const colors = [
      '#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe',
      '#00C49F', '#FFBB28', '#FF8042', '#a4de6c', '#d0ed57'
    ];

    if (isEffect) {
      // For effect lines, use a slightly different shade
      const baseColor = colors[index % colors.length];
      return adjustColorBrightness(baseColor, -20);
    }

    return colors[index % colors.length];
  };

  // Helper function to adjust color brightness
  const adjustColorBrightness = (hex, percent) => {
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);

    r = Math.min(255, Math.max(0, r + percent));
    g = Math.min(255, Math.max(0, g + percent));
    b = Math.min(255, Math.max(0, b + percent));

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Render chart lines, areas, and bars
  const renderLines = (data) => {
    const elements = [];

    // Blood sugar line
    if (displayOptions.showBloodSugar) {
      elements.push(
        <Line
          key="bloodSugar"
          type="monotone"
          dataKey="bloodSugar"
          yAxisId="bloodSugar"
          name="Blood Sugar"
          stroke="#8884d8"
          dot={{ r: 4 }}
          activeDot={{ r: 8 }}
          connectNulls={false}
        />
      );
    }

    // Estimated glucose line
    if (displayOptions.showEstimatedGlucose) {
      elements.push(
        <Line
          key="estimatedGlucose"
          type="monotone"
          dataKey="estimatedGlucose"
          yAxisId="bloodSugar"
          name="Estimated Glucose"
          stroke="#8884d8"
          strokeDasharray="5 5"
          dot={false}
          connectNulls
        />
      );
    }

    // Insulin doses
    if (displayOptions.showInsulinDoses) {
      selectedInsulinTypes.forEach((insulinType, idx) => {
        elements.push(
          <Bar
            key={`dose-${insulinType}`}
            dataKey={`insulinDoses.${insulinType}`}
            yAxisId="insulinDose"
            name={`${insulinType.replace(/_/g, ' ')} Dose`}
            fill={getInsulinColor(insulinType, idx)}
            barSize={20}
            stackId="doses"
          />
        );
      });
    }

    // Insulin effect area
    if (displayOptions.showInsulinEffect) {
      elements.push(
        <Area
          key="totalInsulinEffect"
          type="monotone"
          dataKey="totalInsulinEffect"
          yAxisId="insulinEffect"
          name="Active Insulin"
          fill="#82ca9d"
          stroke="#82ca9d"
          fillOpacity={0.3}
        />
      );

      // Individual insulin effects
      selectedInsulinTypes.forEach((insulinType, idx) => {
        elements.push(
          <Line
            key={`effect-${insulinType}`}
            type="monotone"
            dataKey={`insulinEffects.${insulinType}`}
            yAxisId="insulinEffect"
            name={`${insulinType.replace(/_/g, ' ')} Effect`}
            stroke={getInsulinColor(insulinType, idx, true)}
            strokeWidth={1}
            strokeDasharray="3 3"
            dot={false}
          />
        );
      });
    }

    return elements;
  };

  // Define Y-axis configuration
  const yAxisConfig = [
    {
      id: "bloodSugar",
      label: { value: `Blood Sugar (${unit})`, angle: -90, position: 'insideLeft' },
      orientation: "left",
      formatter: (value) => `${value} ${unit}`
    }
  ];

  if (displayOptions.showInsulinDoses) {
    yAxisConfig.push({
      id: "insulinDose",
      label: { value: 'Insulin Dose (units)', angle: -90, position: 'insideRight' },
      orientation: "right",
      formatter: (value) => `${value} u`
    });
  }

  if (displayOptions.showInsulinEffect && !displayOptions.showInsulinDoses) {
    yAxisConfig.push({
      id: "insulinEffect",
      label: { value: 'Active Insulin (units)', angle: -90, position: 'insideRight' },
      orientation: "right",
      formatter: (value) => `${value} u`
    });
  } else if (displayOptions.showInsulinEffect) {
    yAxisConfig.push({
      id: "insulinEffect",
      label: { value: 'Active Insulin (units)', angle: -90, position: 'insideRight' },
      orientation: "right",
      formatter: (value) => `${value} u`,
      hide: true
    });
  }

  // Define reference lines
  const referenceLines = [
    // Target glucose
    {
      y: targetGlucose,
      yAxisId: "bloodSugar",
      label: { value: 'Target', position: 'right' },
      stroke: '#666',
      strokeDasharray: '3 3'
    },
    // Low threshold
    {
      y: targetGlucose * 0.7,
      yAxisId: "bloodSugar",
      label: { value: 'Low', position: 'right' },
      stroke: '#ff4444',
      strokeDasharray: '3 3'
    },
    // High threshold
    {
      y: targetGlucose * 1.3,
      yAxisId: "bloodSugar",
      label: { value: 'High', position: 'right' },
      stroke: '#ff8800',
      strokeDasharray: '3 3'
    }
  ];

  // Render custom legend
  const renderLegend = () => {
    return (
      <div className="chart-legend">
        <div className="chart-info">
          <div className="chart-info-item">
            <span className="info-label">Target Glucose:</span>
            <span className="info-value">{targetGlucose} {unit}</span>
          </div>
          <div className="chart-info-item">
            <span className="info-label">Range:</span>
            <span className="info-value">
              {Math.round(targetGlucose * 0.7)} - {Math.round(targetGlucose * 1.3)} {unit}
            </span>
          </div>
        </div>

        <h4>Display Settings</h4>
        <div className="display-options">
          <label className="display-option">
            <input
              type="checkbox"
              checked={displayOptions.showBloodSugar}
              onChange={() => handleDisplayOptionChange('showBloodSugar')}
            />
            Show Blood Sugar
          </label>
          <label className="display-option">
            <input
              type="checkbox"
              checked={displayOptions.showEstimatedGlucose}
              onChange={() => handleDisplayOptionChange('showEstimatedGlucose')}
            />
            Show Estimated Glucose
          </label>
          <label className="display-option">
            <input
              type="checkbox"
              checked={displayOptions.showInsulinDoses}
              onChange={() => handleDisplayOptionChange('showInsulinDoses')}
            />
            Show Insulin Doses
          </label>
          <label className="display-option">
            <input
              type="checkbox"
              checked={displayOptions.showInsulinEffect}
              onChange={() => handleDisplayOptionChange('showInsulinEffect')}
            />
            Show Insulin Effect
          </label>
          <label className="display-option">
            <input
              type="checkbox"
              checked={displayOptions.includeFutureEffect}
              onChange={() => handleDisplayOptionChange('includeFutureEffect')}
            />
            Project Future Effect
          </label>
          {displayOptions.includeFutureEffect && (
            <div className="future-hours">
              <label>Future Hours:</label>
              <input
                type="number"
                min="1"
                max="24"
                value={displayOptions.futureHours}
                onChange={(e) => setDisplayOptions(prev => ({
                  ...prev,
                  futureHours: parseInt(e.target.value) || 7
                }))}
              />
            </div>
          )}
        </div>

        {insulinTypes.length > 0 && (
          <div>
            <h4>Insulin Types</h4>
            <div className="insulin-type-filters">
              {insulinTypes.map((type, idx) => (
                <label key={`${type}_${idx}`} className="filter-option">
                  <input
                    type="checkbox"
                    checked={selectedInsulinTypes.includes(type)}
                    onChange={() => handleInsulinTypeToggle(type)}
                  />
                  <span
                    className="insulin-color-box"
                    style={{ backgroundColor: getInsulinColor(type, idx) }}
                  ></span>
                  {type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </label>
              ))}
            </div>
          </div>
        )}

        <h4>Legend</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#8884d8' }}></span>
            <span>Actual Blood Sugar</span>
          </div>
          <div className="legend-item">
            <div className="legend-dash" style={{ borderBottom: '2px dashed #8884d8' }}></div>
            <span>Estimated Blood Sugar</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#82ca9d' }}></span>
            <span>Active Insulin Effect</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#00C851' }}></span>
            <span>Normal: {targetGlucose * 0.7} - {targetGlucose * 1.3} {unit}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ff4444' }}></span>
            <span>Low: Below {targetGlucose * 0.7} {unit}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ff8800' }}></span>
            <span>High: Above {targetGlucose * 1.3} {unit}</span>
          </div>
          <div className="legend-item">
            <span className="legend-color" style={{ backgroundColor: '#ff0000' }}></span>
            <span>Current Time</span>
          </div>
        </div>
      </div>
    );
  };

  // Table columns for the data table
  const columns = React.useMemo(
    () => [
      {
        Header: 'Time',
        accessor: 'formattedTime',
      },
      {
        Header: `Blood Sugar (${unit})`,
        accessor: 'bloodSugar',
        Cell: ({ value, row }) => (
          value ? <span style={{ color: row.original.bloodSugarStatus?.color }}>
            {value} {unit}
          </span> : 'N/A'
        ),
      },
      {
        Header: `Estimated (${unit})`,
        accessor: 'estimatedGlucose',
        Cell: ({ value }) => (value ? `${value} ${unit}` : 'N/A'),
      },
      {
        Header: 'Active Insulin (u)',
        accessor: 'totalInsulinEffect',
        Cell: ({ value }) => value ? value.toFixed(2) : '0.00',
      },
      {
        Header: 'Insulin Doses (u)',
        accessor: row => {
          const doses = Object.entries(row.insulinDoses || {});
          return doses.length
            ? doses.map(([type, dose]) => `${type.replace(/_/g, ' ')}: ${dose}`).join(', ')
            : '';
        },
      }
    ],
    [unit]
  );

  // Set up the table instance
  const tableInstance = useTable(
    {
      columns,
      data: combinedData,
      initialState: { pageIndex: 0, pageSize: 20 }
    },
    useSortBy,
    usePagination
  );

  // Render table view
  const renderTable = () => {
    const {
      getTableProps,
      getTableBodyProps,
      headerGroups,
      page,
      prepareRow,
      canPreviousPage,
      canNextPage,
      pageCount,
      gotoPage,
      nextPage,
      previousPage,
      setPageSize,
      state: { pageIndex, pageSize }
    } = tableInstance;

    return (
      <>
        <table {...getTableProps()} className="combined-data-table">
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

        <div className="pagination">
          <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
          <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
          <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
          <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
          <span>
            Page {pageIndex + 1} of {Math.max(1, pageCount)}
          </span>
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
            }}
          >
            {[10, 20, 30, 50, 100].map(size => (
              <option key={size} value={size}>
                Show {size}
              </option>
            ))}
          </select>
        </div>
      </>
    );
  };

  return (
    <BaseTimeSeriesVisualization
      data={combinedData}
      dateRange={dateRange}
      setDateRange={setDateRange}
      loading={loading}
      error={error}
      showTable={true}
      yAxisConfig={yAxisConfig}
      referenceLines={referenceLines}
      renderLines={renderLines}
      renderTooltip={renderTooltip}
      renderTable={renderTable}
      renderLegend={renderLegend}
      onFetchData={fetchData}
      title="Blood Glucose & Insulin Analysis"
    />
  );
};

export default CombinedGlucoseInsulinChart;