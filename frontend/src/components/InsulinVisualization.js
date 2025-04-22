import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Area } from 'recharts';
import { useTable, useSortBy, usePagination } from 'react-table';
import axios from 'axios';
import moment from 'moment';
import { useConstants } from '../contexts/ConstantsContext';
import './BloodSugarVisualization.css';

/**
 * Enhanced Blood Sugar Visualization Component with Insulin Effect Integration
 *
 * Features:
 * - Two distinct lines: actual readings and estimated values
 * - Actual readings only connect when less than 20 minutes apart
 * - Estimated line accounts for insulin effect on blood glucose
 * - Shows active insulin overlay to visualize insulin impact
 */
const InsulinVisualization = ({
  isDoctor = false,
  patientId = null,
  showControls = true,
  fillGaps = true,
  gapThresholdHours = 3,
  height = '400px',
  onDataLoaded = null,
  dateRange: initialDateRange = null,
  defaultView = 'chart',
  embedded = false,
  customApiEndpoint = null,
  chartConfig = {}
}) => {
  // Access patient constants from context
  const { patientConstants, loading: constantsLoading } = useConstants();

  // Shared state
  const [data, setData] = useState([]);
  const [insulinData, setInsulinData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [actualReadingsData, setActualReadingsData] = useState([]);  // For actual readings line
  const [estimatedData, setEstimatedData] = useState([]);  // For estimated values line
  const [processedData, setProcessedData] = useState([]);
  const [insulinTypes, setInsulinTypes] = useState([]);
  const [selectedInsulinTypes, setSelectedInsulinTypes] = useState([]);
  const [targetGlucose, setTargetGlucose] = useState(
    patientConstants?.target_glucose || 120
  );
  const [dateRange, setDateRange] = useState(initialDateRange || {
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('mg/dL');
  const [activeView, setActiveView] = useState(defaultView);
  const [userTimeZone, setUserTimeZone] = useState('');
  const [timeScale, setTimeScale] = useState({
    start: moment().subtract(7, 'days').valueOf(),
    end: moment().valueOf(),
    tickInterval: 12, // in hours
    tickFormat: 'DD/MM HH:mm'
  });
  const [currentTime, setCurrentTime] = useState(moment().valueOf());
  const [currentDateTime, setCurrentDateTime] = useState("2025-04-22 12:43:47");
  const [currentUserLogin, setCurrentUserLogin] = useState("aliattia02");
  const [gapFillSettings, setGapFillSettings] = useState({
    enabled: fillGaps,
    thresholdHours: gapThresholdHours,
    extendToCurrent: true,    // Extend to current time
    fillFromStart: true,      // Fill from the start of the time range
    fillEntireGraph: true,    // Fill the entire graph, including beyond now
    maxConnectGapMinutes: 20, // Only connect actual readings if within 20 minutes
    returnToTarget: true,     // Always return to target glucose after readings
    includeInsulinEffect: true, // NEW: Use insulin effect to model glucose changes
    showInsulinOverlay: true   // NEW: Show insulin effect overlay on chart
  });

  // Settings for blood glucose modeling
  const [modelSettings, setModelSettings] = useState({
    stabilizationHours: 2,       // Hours it takes for glucose to return to target after a reading
    targetStability: true,       // Whether glucose should stay at target without meals
    insulinImpactFactor: 50,     // NEW: How much 1 unit of insulin reduces blood sugar (mg/dL)
    carbohydrateImpactFactor: 4  // NEW: How much 1g of carbs increases blood sugar (mg/dL)
  });

  // Reference for chart container
  const chartRef = useRef(null);

  // Update target glucose when patient constants change
  useEffect(() => {
    if (patientConstants && patientConstants.target_glucose) {
      setTargetGlucose(patientConstants.target_glucose);

      // Also update model settings if available in patient constants
      if (patientConstants.insulin_sensitivity_factor) {
        setModelSettings(prev => ({
          ...prev,
          insulinImpactFactor: patientConstants.insulin_sensitivity_factor
        }));
      }

      if (patientConstants.carb_ratio) {
        setModelSettings(prev => ({
          ...prev,
          carbohydrateImpactFactor: patientConstants.carb_ratio
        }));
      }
    }
  }, [patientConstants]);

  // Get user's time zone info on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Filter data based on timeScale
  useEffect(() => {
    // Only keep data points that fall within the time scale
    if (data.length > 0) {
      const filtered = data.filter(item =>
        item.readingTime >= timeScale.start &&
        item.readingTime <= timeScale.end
      );
      console.log(`Filtered data from ${data.length} to ${filtered.length} points based on time range`);
      setFilteredData(filtered);
    } else {
      setFilteredData([]);
    }
  }, [data, timeScale]);

  // Helper function to get insulin parameters from context or default
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

  // Calculate insulin effect at a given time point (adapted from InsulinVisualization component)
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

  // Get total insulin effect at a specific time
  const getTotalInsulinEffect = useCallback((timestamp) => {
    let totalEffect = 0;

    insulinData.forEach(dose => {
      const hoursSinceDose = (timestamp - dose.administrationTime) / (60 * 60 * 1000);

      // Skip doses that haven't been administered yet
      if (hoursSinceDose < 0) return;

      // Get insulin parameters for this type
      const params = getInsulinParameters(dose.medication);

      // Calculate effect and add to total
      const effect = calculateInsulinEffect(
        hoursSinceDose,
        dose.dose,
        params.onset_hours,
        params.peak_hours,
        params.duration_hours
      );

      totalEffect += effect;
    });

    return totalEffect;
  }, [insulinData, calculateInsulinEffect, getInsulinParameters]);

  /**
   * Improved blood glucose model that accounts for insulin effect
   */
  const modelBloodGlucose = useCallback((startReading, elapsedMinutes, timestamp) => {
    const baseValue = startReading.bloodSugar;
    const stabilizationMinutes = modelSettings.stabilizationHours * 60;

    // Calculate natural return-to-target effect
    let naturalGlucose;
    if (elapsedMinutes < stabilizationMinutes) {
      const stabilizationRatio = elapsedMinutes / stabilizationMinutes;
      const exponentialReturn = 1 - Math.exp(-3 * stabilizationRatio); // Exponential curve for smoother approach
      naturalGlucose = targetGlucose + (baseValue - targetGlucose) * (1 - exponentialReturn);
    } else {
      naturalGlucose = targetGlucose;
    }

    // If not including insulin effect, just return the natural glucose level
    if (!gapFillSettings.includeInsulinEffect) {
      return naturalGlucose;
    }

    // Calculate insulin effect at this time point
    const pointTimeStamp = startReading.readingTime + (elapsedMinutes * 60 * 1000);
    const activeInsulin = getTotalInsulinEffect(pointTimeStamp);

    // Apply insulin effect to reduce blood sugar
    // Use insulin sensitivity factor to convert insulin units to blood sugar reduction
    const insulinReduction = activeInsulin * modelSettings.insulinImpactFactor;

    // Calculate the final glucose value (natural level minus insulin reduction)
    const adjustedGlucose = Math.max(40, naturalGlucose - insulinReduction);

    return adjustedGlucose;
  }, [targetGlucose, modelSettings, gapFillSettings.includeInsulinEffect, getTotalInsulinEffect]);

  // Create estimated points between actual readings
  const generateEstimatedPoints = useCallback((startPoint, endTimeOrPoint, numPoints = 10) => {
    const points = [];
    const startTime = startPoint.readingTime;

    // Handle both endPoint object and raw endTime value
    let endTime;
    if (typeof endTimeOrPoint === 'number') {
      endTime = endTimeOrPoint; // It's a timestamp
    } else if (endTimeOrPoint && endTimeOrPoint.readingTime) {
      endTime = endTimeOrPoint.readingTime; // It's a point object
    } else {
      endTime = currentTime; // Default to current time
    }

    const totalGapMinutes = (endTime - startTime) / (60 * 1000);

    // Skip if gap is too small
    if (totalGapMinutes < 5) return points;

    // Determine number of points to generate (one point every 30 minutes, or user-specified)
    const pointsToGenerate = Math.max(2, Math.ceil(totalGapMinutes / 30));
    const actualPoints = Math.min(pointsToGenerate, numPoints); // Limit by numPoints parameter
    const timeStep = (endTime - startTime) / (actualPoints + 1);

    for (let i = 1; i <= actualPoints; i++) {
      const pointTime = startTime + (i * timeStep);
      const elapsedMinutes = (pointTime - startTime) / (60 * 1000);

      // Calculate blood glucose based on our model
      let glucoseValue = modelBloodGlucose(startPoint, elapsedMinutes, pointTime);

      points.push({
        readingTime: pointTime,
        bloodSugar: glucoseValue,
        formattedReadingTime: moment(pointTime).format('MM/DD/YYYY, HH:mm'),
        isInterpolated: true,
        isEstimated: true,
        dataType: 'estimated',
        status: getBloodSugarStatus(glucoseValue, targetGlucose),
        activeInsulin: getTotalInsulinEffect(pointTime)
      });
    }

    return points;
  }, [currentTime, modelBloodGlucose, targetGlucose, getBloodSugarStatus, getTotalInsulinEffect]);

  // Process data to separate actual readings and create estimated line
  useEffect(() => {
    if (filteredData.length === 0) {
      setProcessedData([]);
      setActualReadingsData([]);
      setEstimatedData([]);
      return;
    }

    // Mark all actual readings
    const taggedActualData = filteredData.map(item => ({
      ...item,
      dataType: 'actual',
      isInterpolated: false,
      isEstimated: false,
      activeInsulin: getTotalInsulinEffect(item.readingTime)
    }));

    // Sort by reading time
    taggedActualData.sort((a, b) => a.readingTime - b.readingTime);

    // Prepare actual readings dataset - we'll tag the ones that should connect
    let actualReadings = [];
    let lastReading = null;

    taggedActualData.forEach(reading => {
      const shouldConnect = lastReading &&
        ((reading.readingTime - lastReading.readingTime) <= (gapFillSettings.maxConnectGapMinutes * 60 * 1000));

      actualReadings.push({
        ...reading,
        connectToPrevious: shouldConnect
      });

      lastReading = reading;
    });

    setActualReadingsData(actualReadings);

    // Now generate estimated data if gap filling is enabled
    if (!gapFillSettings.enabled) {
      setEstimatedData([]);
      setProcessedData(actualReadings);
      return;
    }

    // Create estimated dataset
    let estimatedPoints = [];

    // Start with a target value at timeScale.start if needed
    if (gapFillSettings.fillFromStart && actualReadings.length > 0 &&
        actualReadings[0].readingTime > timeScale.start) {
      const startPoint = {
        readingTime: timeScale.start,
        bloodSugar: targetGlucose,  // Always start from target at the beginning of the chart
        formattedReadingTime: moment(timeScale.start).format('MM/DD/YYYY, HH:mm'),
        isInterpolated: true,
        isEstimated: true,
        dataType: 'estimated',
        status: getBloodSugarStatus(targetGlucose, targetGlucose),
        activeInsulin: getTotalInsulinEffect(timeScale.start)
      };

      estimatedPoints.push(startPoint);

      // Generate estimated points from start to first reading
      const pointsToFirstReading = generateEstimatedPoints(
        startPoint,
        actualReadings[0],
        Math.max(5, Math.ceil((actualReadings[0].readingTime - startPoint.readingTime) / (30 * 60 * 1000)))
      );
      estimatedPoints = [...estimatedPoints, ...pointsToFirstReading];
    }

    // Add estimated points between actual readings
    for (let i = 0; i < actualReadings.length; i++) {
      // Add the actual reading to estimated line as an anchor point
      estimatedPoints.push({
        ...actualReadings[i],
        isEstimatedLine: true  // Tag to indicate this is an anchor point for the estimated line
      });

      // Generate estimated points to next reading or continue the pattern
      if (i < actualReadings.length - 1) {
        const pointsBetweenReadings = generateEstimatedPoints(
          actualReadings[i],
          actualReadings[i+1],
          Math.max(5, Math.ceil((actualReadings[i+1].readingTime - actualReadings[i].readingTime) / (30 * 60 * 1000)))
        );
        estimatedPoints = [...estimatedPoints, ...pointsBetweenReadings];
      }
      // If this is the last reading, extend to fill the graph
      else {
        // Decide where to extend to
        let endTime;

        if (gapFillSettings.fillEntireGraph) {
          // Fill to the end of the time scale
          endTime = timeScale.end;
        } else if (gapFillSettings.extendToCurrent && currentTime > actualReadings[i].readingTime) {
          // Fill only to current time
          endTime = currentTime;
        } else {
          // No extension needed
          continue;
        }

        // Skip if the last reading is already beyond our end point
        if (actualReadings[i].readingTime >= endTime) continue;

        // Generate estimated points from last reading to end time
        const pointsToEndTime = generateEstimatedPoints(
          actualReadings[i],
          endTime,
          Math.max(5, Math.ceil((endTime - actualReadings[i].readingTime) / (30 * 60 * 1000)))
        );
        estimatedPoints = [...estimatedPoints, ...pointsToEndTime];

        // Add final point at the end time
        const finalGlucose = modelBloodGlucose(
          actualReadings[i],
          (endTime - actualReadings[i].readingTime) / (60 * 1000),
          endTime
        );

        const finalPoint = {
          readingTime: endTime,
          bloodSugar: finalGlucose,
          formattedReadingTime: moment(endTime).format('MM/DD/YYYY, HH:mm'),
          isInterpolated: true,
          isEstimated: true,
          dataType: 'estimated',
          status: getBloodSugarStatus(finalGlucose, targetGlucose),
          activeInsulin: getTotalInsulinEffect(endTime)
        };

        estimatedPoints.push(finalPoint);
      }
    }

    setEstimatedData(estimatedPoints);

    // Combine all data for the table view
    const combined = [...actualReadings, ...estimatedPoints.filter(p => p.isInterpolated)];
    combined.sort((a, b) => a.readingTime - b.readingTime);

    setProcessedData(combined);

  }, [filteredData, gapFillSettings, targetGlucose, currentTime, timeScale.start, timeScale.end,
      modelSettings, generateEstimatedPoints, getBloodSugarStatus, getTotalInsulinEffect, modelBloodGlucose]);

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = moment();
      setCurrentTime(now.valueOf());
      setCurrentDateTime("2025-04-22 12:43:47"); // Keep using the provided datetime
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, []);

  // Update time scale when date range changes
  const updateTimeScale = useCallback(() => {
    const startMoment = moment(dateRange.start).startOf('day');
    const endMoment = moment(dateRange.end).endOf('day');
    const diffDays = endMoment.diff(startMoment, 'days');

    let tickInterval, tickFormat;

    // Determine scaling based on the date range
    if (diffDays <= 1) {
      // Last 24 hours - 2 hour ticks
      tickInterval = 2;
      tickFormat = 'HH:mm';
    } else if (diffDays <= 7) {
      // Last week - 12 hour ticks
      tickInterval = 12;
      tickFormat = 'DD/MM HH:mm';
    } else {
      // Last month - 1 day ticks
      tickInterval = 24;
      tickFormat = 'MM/DD';
    }

    setTimeScale({
      start: startMoment.valueOf(),
      end: endMoment.valueOf(),
      tickInterval,
      tickFormat
    });
  }, [dateRange]);

  // Generate ticks for the x-axis based on time scale
  const generateTicks = useCallback(() => {
    const ticks = [];
    let current = moment(timeScale.start).startOf('hour');
    const end = moment(timeScale.end);

    // Align ticks to exact hour boundaries for consistent grid alignment
    while (current.isBefore(end)) {
      ticks.push(current.valueOf());
      current = current.add(timeScale.tickInterval, 'hours');
    }

    return ticks;
  }, [timeScale]);

  // Fetch both blood sugar and insulin data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      // FIRST: Fetch blood sugar data
      const bloodSugarUrl = customApiEndpoint || `http://localhost:5000/api/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`;

      const bloodSugarResponse = await axios.get(
        isDoctor && patientId
          ? `http://localhost:5000/doctor/patient/${patientId}/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`
          : bloodSugarUrl,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Process blood sugar data
      const processedBloodSugarData = bloodSugarResponse.data.map(reading => {
        // Use reading time if available, otherwise use recording time
        const readingTime = moment.utc(reading.bloodSugarTimestamp || reading.timestamp).local();

        return {
          id: reading._id,
          bloodSugar: reading.bloodSugar,
          readingTime: readingTime.valueOf(),
          formattedReadingTime: readingTime.format('MM/DD/YYYY, HH:mm'),
          status: getBloodSugarStatus(reading.bloodSugar, reading.target || targetGlucose),
          notes: reading.notes || ''
        };
      });

      // SECOND: Fetch insulin data
      const insulinUrl = `http://localhost:5000/api/insulin-data?start_date=${startDate}&end_date=${endDate}`;

      const insulinResponse = await axios.get(
        isDoctor && patientId
          ? `http://localhost:5000/api/insulin-data?start_date=${startDate}&end_date=${endDate}&patient_id=${patientId}`
          : insulinUrl,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Process insulin data
      const processedInsulinData = insulinResponse.data.insulin_logs.map(log => {
        const adminTime = moment(log.taken_at);

        return {
          id: log.id,
          medication: log.medication,
          dose: log.dose,
          administrationTime: adminTime.valueOf(),
          formattedTime: adminTime.format('MM/DD/YYYY, HH:mm'),
          notes: log.notes || '',
          pharmacokinetics: log.pharmacokinetics || getInsulinParameters(log.medication)
        };
      });

      // Extract unique insulin types
      const types = [...new Set(processedInsulinData.map(log => log.medication))];
      setInsulinTypes(types);
      setSelectedInsulinTypes(types);

      // Save the processed data
      setData(processedBloodSugarData);
      setInsulinData(processedInsulinData);

      // Update time scale after fetching data
      updateTimeScale();

      if (onDataLoaded) {
        onDataLoaded(processedBloodSugarData);
      }

      setError('');
    } catch (error) {
      console.error('Error fetching data:', error);
      setError('Failed to fetch data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, isDoctor, patientId, unit, targetGlucose, updateTimeScale,
      customApiEndpoint, onDataLoaded, getInsulinParameters, getBloodSugarStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    updateTimeScale();
  }, [dateRange, updateTimeScale]);

  const getBloodSugarStatus = (bloodSugar, target) => {
    const statusMap = {
      'low': { color: '#ff4444', label: 'Low' },
      'normal': { color: '#00C851', label: 'Normal' },
      'high': { color: '#ff8800', label: 'High' }
    };

    if (bloodSugar < target * 0.7) return statusMap.low;
    if (bloodSugar > target * 1.3) return statusMap.high;
    return statusMap.normal;
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const handleUnitChange = (e) => {
    setUnit(e.target.value);
  };

  const handleGapFillToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  };

  const handleInsulinEffectToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      includeInsulinEffect: !prev.includeInsulinEffect
    }));
  };

  const handleInsulinOverlayToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      showInsulinOverlay: !prev.showInsulinOverlay
    }));
  };

  const handleExtendToCurrentToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      extendToCurrent: !prev.extendToCurrent
    }));
  };

  const handleFillFromStartToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      fillFromStart: !prev.fillFromStart
    }));
  };

  const handleFillEntireGraphToggle = () => {
    setGapFillSettings(prev => ({
      ...prev,
      fillEntireGraph: !prev.fillEntireGraph
    }));
  };

  const handleStabilizationHoursChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 0) {
      setModelSettings(prev => ({
        ...prev,
        stabilizationHours: value
      }));
    }
  };

  const handleInsulinImpactFactorChange = (e) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setModelSettings(prev => ({
        ...prev,
        insulinImpactFactor: value
      }));
    }
  };

  const handleConnectMaxTimeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setGapFillSettings(prev => ({
        ...prev,
        maxConnectGapMinutes: value
      }));
    }
  };

  // Quick date range presets
  const applyDatePreset = (days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');

    // Set the end date based on the preset type with specific requirements
    let end;
    if (days === 1) {
      // For "Last 24h": past day plus 12 hours
      end = moment().add(12, 'hours').format('YYYY-MM-DD HH:mm');
    } else if (days === 7) {
      // For "Last Week": past 7 days plus one future day
      end = moment().add(1, 'day').format('YYYY-MM-DD');
    } else if (days === 30) {
      // For "Last Month": past 30 days plus 4 future days
      end = moment().add(4, 'days').format('YYYY-MM-DD');
    } else {
      // Default case
      end = moment().format('YYYY-MM-DD');
    }

    setDateRange({
      start: start,
      end: end
    });
  };

  // Format the X-axis labels
  const formatXAxis = (tickItem) => {
    return moment(tickItem).format(timeScale.tickFormat);
  };

  const formatYAxis = (value) => {
    return `${value} ${unit}`;
  };

  // Generate custom ticks based on time scale
  const ticks = generateTicks();

  // Determine if current time is within chart range
  const currentTimeInRange = currentTime >= timeScale.start && currentTime <= timeScale.end;

  // Custom dot renderer that changes appearance based on data type
  const CustomActualDot = (props) => {
    const { cx, cy, stroke, payload, value } = props;

    // Only render visible dots for actual readings
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4}
        stroke={payload.status.color}
        strokeWidth={2}
        fill="#ffffff"
      />
    );
  };

  // Custom dot renderer for estimated line
  const CustomEstimatedDot = (props) => {
    const { cx, cy, stroke, payload, value } = props;

    // Don't render dots for estimated points to reduce clutter
    if (payload.isInterpolated && !payload.isEstimatedLine) {
      return null;
    }

    // Only show dots at anchor points (where estimated line meets actual readings)
    if (payload.isEstimatedLine) {
      return (
        <circle
          cx={cx}
          cy={cy}
          r={3}
          stroke="#6a5acd"
          strokeWidth={1}
          fill="#f9f9f9"
          strokeDasharray="2,2"
        />
      );
    }

    return null;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      // Find the data point with blood sugar values
      const dataPoint = payload.find(p => p.dataKey === 'bloodSugar')?.payload;
      if (!dataPoint) return null;

      // Find active insulin value if available
      const activeInsulinValue = dataPoint.activeInsulin || 0;

      return (
        <div className="custom-tooltip">
          <p className="tooltip-time">{moment(dataPoint.readingTime).format('MM/DD/YYYY, HH:mm')}</p>
          <p className="tooltip-value" style={{ color: dataPoint.status.color }}>
            {`Blood Sugar: ${Math.round(dataPoint.bloodSugar * 10) / 10} ${unit}`}
          </p>
          <p className="tooltip-target">
            {`Target: ${targetGlucose} ${unit}`}
          </p>
          {activeInsulinValue > 0 && (
            <p className="tooltip-insulin">
              {`Active Insulin: ${activeInsulinValue.toFixed(2)} units`}
            </p>
          )}
          <p className="tooltip-status">
            {dataPoint.isInterpolated
              ? `Type: ${dataPoint.dataType === 'estimated' ? 'Estimated' : 'Target'}`
              : `Status: ${dataPoint.status.label}`}
          </p>
          {dataPoint.notes && <p className="tooltip-notes">Notes: {dataPoint.notes}</p>}
          {dataPoint.isInterpolated && (
            <p className="tooltip-interpolated">
              {dataPoint.dataType === 'estimated'
                ? (gapFillSettings.includeInsulinEffect
                    ? 'Estimated with insulin effect'
                    : 'Estimated (returns to target)')
                : `Target glucose value (${targetGlucose} ${unit})`}
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Table-specific columns
  const columns = React.useMemo(
    () => [
      {
        Header: 'Reading Time',
        accessor: 'formattedReadingTime',
        Cell: ({ value, row }) => (
          <span style={{
            color: row.original.isInterpolated ? '#888888' : 'inherit',
            fontStyle: row.original.isInterpolated ? 'italic' : 'normal'
          }}>
            {value}
            {row.original.isInterpolated && (
              row.original.dataType === 'estimated' ? ' (estimated)' : ' (target)'
            )}
          </span>
        ),
      },
      {
        Header: `Blood Sugar (${unit})`,
        accessor: 'bloodSugar',
        Cell: ({ value, row }) => (
          <span style={{
            color: row.original.dataType === 'estimated' ? '#6a5acd' :
                  row.original.isInterpolated ? '#888888' : row.original.status.color,
            fontWeight: row.original.isInterpolated ? 'normal' : 500,
            fontStyle: row.original.isInterpolated ? 'italic' : 'normal'
          }}>
            {value !== undefined && value !== null ? Math.round(value * 10) / 10 : 'N/A'} {unit}
          </span>
        ),
      },
      {
        Header: 'Active Insulin (units)',
        accessor: 'activeInsulin',
        Cell: ({ value }) => (
          <span>
            {value !== undefined && value !== null ? value.toFixed(2) : '0.00'}
          </span>
        )
      },
      {
        Header: `Target (${unit})`,
        accessor: 'target',
        Cell: ({ value, row }) => (
          <span>
            {value !== undefined && value !== null ? value : targetGlucose} {unit}
          </span>
        ),
      },
      {
        Header: 'Status',
        accessor: row => row.status.label,
        Cell: ({ row }) => (
          <div className="status-indicator">
            <div
              className="status-dot"
              style={{
                backgroundColor: row.original.dataType === 'estimated' ? '#6a5acd' :
                               row.original.isInterpolated ? '#aaaaaa' : row.original.status.color,
                opacity: row.original.isInterpolated ? 0.7 : 1
              }}
            ></div>
            <span style={{
              fontStyle: row.original.isInterpolated ? 'italic' : 'normal',
              color: row.original.isInterpolated ? '#888888' : 'inherit'
            }}>
              {row.original.isInterpolated
                ? (row.original.dataType === 'estimated' ? 'Estimated' : 'Target')
                : row.original.status.label}
            </span>
          </div>
        ),
      },
      {
        Header: 'Data Type',
        accessor: row => row.dataType,
        Cell: ({ value }) => {
          let color, text;
          switch(value) {
            case 'actual':
              color = '#00C851';
              text = 'Actual';
              break;
            case 'estimated':
              color = '#6a5acd';
              text = 'Estimated';
              break;
            case 'target':
              color = '#888888';
              text = 'Target';
              break;
            default:
              color = '#333333';
              text = value;
          }

          return (
            <span style={{
              color: color,
              fontWeight: value === 'actual' ? 'bold' : 'normal'
            }}>
              {text}
            </span>
          );
        },
      },
    ],
    [unit, targetGlucose]
  );

  const tableInstance = useTable(
    {
      columns,
      data: processedData,
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

  // Apply any custom chart configuration
  const chartSettings = {
    width: '100%',
    height: embedded ? height : 400,
    ...chartConfig
  };

  // Convert estimatedData to a format suitable for the insulin effect area
  const insulinEffectData = useMemo(() => {
    if (!gapFillSettings.showInsulinOverlay) return [];

    return estimatedData.map(point => ({
      readingTime: point.readingTime,
      insulinEffect: point.activeInsulin ? point.activeInsulin / 2 : 0 // Scale for better visualization
    }));
  }, [estimatedData, gapFillSettings.showInsulinOverlay]);

  // Handle visibility of the individual dots representing actual readings
  const dottedActualReadings = actualReadingsData.map(reading => ({
    ...reading,
    connectToPrevious: false // Override to ensure all dots are rendered
  }));

  // Show loading if we're waiting for constants
  if (constantsLoading) return <div className="loading">Loading patient data...</div>;

  return (
    <div className={`blood-sugar-visualization ${embedded ? 'embedded' : ''}`}>
      {!embedded && <h2 className="title">Blood Sugar & Insulin Effect</h2>}

      {/* Patient Target Info */}
      <div className="target-info">
        <span className="target-label">Patient Target Blood Glucose: </span>
        <span className="target-value">{targetGlucose} {unit}</span>
        {/* Display current date and login info */}
        <div className="system-info">
          <span className="time-label">Current: {currentDateTime} UTC | </span>
          <span className="user-label">User: {currentUserLogin}</span>
        </div>
      </div>

      {/* Add timezone info display */}
      {!embedded && (
        <div className="timezone-info">
          Your timezone: {userTimeZone}
          <span className="timezone-note"> (all times displayed in your local timezone)</span>
        </div>
      )}

      {!embedded && (
        <div className="view-toggle">
          <button
            className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
            onClick={() => setActiveView('chart')}
          >
            Chart View
          </button>
          <button
            className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => setActiveView('table')}
          >
            Table View
          </button>
        </div>
      )}

      {showControls && (
        <div className="controls">
          <div className="date-controls">
            <div className="date-input-group">
              <label htmlFor="start-date">From:</label>
              <input
                id="start-date"
                type="date"
                name="start"
                value={dateRange.start}
                onChange={handleDateChange}
              />
            </div>
            <div className="date-input-group">
              <label htmlFor="end-date">To:</label>
              <input
                id="end-date"
                type="date"
                name="end"
                value={dateRange.end}
                onChange={handleDateChange}
              />
            </div>
          </div>

          <div className="quick-ranges">
            <button onClick={() => applyDatePreset(1)}>Last 24h</button>
            <button onClick={() => applyDatePreset(7)}>Last Week</button>
            <button onClick={() => applyDatePreset(30)}>Last Month</button>
          </div>

          <div className="unit-selector">
            <label htmlFor="unit-select">Unit:</label>
            <select id="unit-select" value={unit} onChange={handleUnitChange}>
              <option value="mg/dL">mg/dL</option>
              <option value="mmol/L">mmol/L</option>
            </select>
          </div>

          <div className="gap-fill-controls">
            <label>
              <input
                type="checkbox"
                checked={gapFillSettings.enabled}
                onChange={handleGapFillToggle}
              />
              Show estimated line
            </label>

            <div className="threshold-input">
              <label htmlFor="connect-max-time">Connect readings within (min):</label>
              <input
                id="connect-max-time"
                type="number"
                min="1"
                max="60"
                value={gapFillSettings.maxConnectGapMinutes}
                onChange={handleConnectMaxTimeChange}
              />
            </div>

            {gapFillSettings.enabled && (
              <>
                <label>
                  <input
                    type="checkbox"
                    checked={gapFillSettings.includeInsulinEffect}
                    onChange={handleInsulinEffectToggle}
                  />
                  Include insulin effect
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={gapFillSettings.showInsulinOverlay}
                    onChange={handleInsulinOverlayToggle}
                  />
                  Show insulin overlay
                </label>

                <div className="threshold-input">
                  <label htmlFor="stabilization-hours">Return to target in (hours):</label>
                  <input
                    id="stabilization-hours"
                    type="number"
                    min="0.5"
                    max="24"
                    step="0.5"
                    value={modelSettings.stabilizationHours}
                    onChange={handleStabilizationHoursChange}
                  />
                </div>

                {gapFillSettings.includeInsulinEffect && (
                  <div className="threshold-input">
                    <label htmlFor="insulin-impact">Insulin sensitivity (mg/dL per unit):</label>
                    <input
                      id="insulin-impact"
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={modelSettings.insulinImpactFactor}
                      onChange={handleInsulinImpactFactorChange}
                    />
                  </div>
                )}

                <label>
                  <input
                    type="checkbox"
                    checked={gapFillSettings.fillEntireGraph}
                    onChange={handleFillEntireGraphToggle}
                  />
                  Fill entire graph
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={gapFillSettings.fillFromStart}
                    onChange={handleFillFromStartToggle}
                  />
                  Fill from range start
                </label>
              </>
            )}
          </div>

          <button className="update-btn" onClick={fetchData}>Update Data</button>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading blood sugar data...</div>
      ) : (
        <div className="content-container">
          {(activeView === 'chart' || embedded) && (
            <div className="chart-container" ref={chartRef}>
              <ResponsiveContainer width={chartSettings.width} height={chartSettings.height}>
                <LineChart
                  margin={{ top: 20, right: 40, bottom: 30, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="readingTime"
                    name="Time"
                    domain={[timeScale.start, timeScale.end]} // Use fixed domain from timeScale
                    ticks={ticks} // Use our generated ticks
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    allowDuplicatedCategory={false}
                    scale="time"
                    interval={0}
                  />
                  <YAxis
                    yAxisId="bloodSugar"
                    tickFormatter={formatYAxis}
                    domain={['auto', 'auto']}
                  />

                  {gapFillSettings.showInsulinOverlay && (
                    <YAxis
                      yAxisId="insulinEffect"
                      orientation="right"
                      domain={[0, 'auto']}
                      tickFormatter={val => `${val.toFixed(1)}u`}
                      label={{ value: 'Active Insulin', angle: -90, position: 'insideRight' }}
                    />
                  )}

                  <Tooltip content={<CustomTooltip />} />
                  <Legend />

                  {/* Target glucose reference lines */}
                  <ReferenceLine
                    y={targetGlucose}
                    yAxisId="bloodSugar"
                    label={{ value: 'Target', position: 'right' }}
                    stroke="#666"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={targetGlucose * 0.7}
                    yAxisId="bloodSugar"
                    label={{ value: 'Low', position: 'right' }}
                    stroke="#ff4444"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    y={targetGlucose * 1.3}
                    yAxisId="bloodSugar"
                    label={{ value: 'High', position: 'right' }}
                    stroke="#ff8800"
                    strokeDasharray="3 3"
                  />

                  {/* Current time reference line */}
                  {currentTimeInRange && (
                    <ReferenceLine
                      x={currentTime}
                      stroke="#ff0000"
                      strokeWidth={2}
                      label={{
                        value: 'Now',
                        position: 'top',
                        fill: '#ff0000',
                        fontSize: 12
                      }}
                    />
                  )}

                  {/* Active Insulin Effect Area */}
                  {gapFillSettings.showInsulinOverlay && (
                    <Area
                      yAxisId="insulinEffect"
                      dataKey="insulinEffect"
                      data={insulinEffectData}
                      fill="#82ca9d"
                      fillOpacity={0.3}
                      stroke="#82ca9d"
                      name="Active Insulin"
                    />
                  )}

                  {/* Generate a disconnected line with only dots for all actual readings */}
                  <Line
                    key="actual-dots"
                    yAxisId="bloodSugar"
                    dataKey="bloodSugar"
                    name={`Actual Readings (${unit})`}
                    data={dottedActualReadings}
                    stroke="none"
                    isAnimationActive={false}
                    dot={CustomActualDot}
                  />

                  {/* Connected line only for points within configured minutes of each other */}
                  <Line
                    key="actual-line"
                    yAxisId="bloodSugar"
                    dataKey="bloodSugar"
                    name={`Actual Readings (${unit})`}
                    data={actualReadingsData.filter(r => r.connectToPrevious)}
                    stroke="#8884d8"
                    strokeWidth={2}
                    isAnimationActive={false}
                    dot={false}
                    connectNulls={false}
                  />

                  {/* Estimated line with insulin effect */}
                  {gapFillSettings.enabled && (
                    <Line
                      key="estimated-line"
                      yAxisId="bloodSugar"
                      dataKey="bloodSugar"
                      name={`Estimated Pattern (${unit})`}
                      data={estimatedData}
                      stroke="#6a5acd"
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                      strokeDasharray="4 4"
                      isAnimationActive={false}
                      dot={CustomEstimatedDot}
                      connectNulls={true}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>

              <div className="chart-legend">
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
                  <span className="legend-color" style={{ backgroundColor: '#8884d8' }}></span>
                  <span>Actual Readings (connected when &lt;{gapFillSettings.maxConnectGapMinutes}min apart)</span>
                </div>
                {gapFillSettings.enabled && (
                  <div className="legend-item">
                    <span className="legend-dash" style={{ borderTop: '2px dashed #6a5acd' }}></span>
                    <span>Estimated {gapFillSettings.includeInsulinEffect ? 'with insulin effect' : 'pattern'}</span>
                  </div>
                )}
                {gapFillSettings.showInsulinOverlay && (
                  <div className="legend-item">
                    <span className="legend-area" style={{ backgroundColor: '#82ca9d', opacity: 0.3 }}></span>
                    <span>Active Insulin</span>
                  </div>
                )}
                <div className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: '#ff0000' }}></span>
                  <span>Current Time</span>
                </div>
              </div>

              {/* Display insulin types used in data */}
              {insulinTypes.length > 0 && (
                <div className="insulin-types-info">
                  <h4>Insulin Types:</h4>
                  <div className="insulin-types-list">
                    {insulinTypes.map((type, idx) => {
                      const params = getInsulinParameters(type);
                      return (
                        <div key={`insulin-${idx}`} className="insulin-type">
                          <span className="insulin-name">{type.replace(/_/g, ' ')}</span>
                          <span className="insulin-params">
                            Onset: {params.onset_hours}h |
                            {params.peak_hours ? ` Peak: ${params.peak_hours}h | ` : ' '}
                            Duration: {params.duration_hours}h
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Display message if no data points are in the current range */}
              {processedData.length === 0 && (
                <div className="no-data-overlay">
                  No blood sugar readings found in the selected date range
                </div>
              )}
            </div>
          )}

          {activeView === 'table' && !embedded && (
            <div className="table-container">
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
                  {page.length > 0 ? (
                    page.map(row => {
                      prepareRow(row);
                      const { key, ...rowProps } = row.getRowProps();

                      // Define row class based on data type
                      let rowClass = '';
                      if (row.original.dataType === 'actual') {
                        rowClass = `status-${row.original.status.label.toLowerCase()}`;
                      } else if (row.original.dataType === 'estimated') {
                        rowClass = 'estimated';
                        if (row.original.activeInsulin > 0) rowClass += ' with-insulin';
                      } else {
                        rowClass = 'interpolated';
                      }

                      return (
                        <tr
                          key={key}
                          {...rowProps}
                          className={rowClass}
                        >
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
                    })
                  ) : (
                    <tr>
                      <td colSpan={columns.length} className="no-data">
                        No blood sugar readings found for the selected date range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="pagination">
                <button onClick={() => gotoPage(0)} disabled={!canPreviousPage}>{'<<'}</button>
                <button onClick={() => previousPage()} disabled={!canPreviousPage}>{'<'}</button>
                <button onClick={() => nextPage()} disabled={!canNextPage}>{'>'}</button>
                <button onClick={() => gotoPage(pageCount - 1)} disabled={!canNextPage}>{'>>'}</button>
                <span>
                  Page {' '}
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
        </div>
      )}
    </div>
  );
};

export default InsulinVisualization;