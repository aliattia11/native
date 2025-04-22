import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import moment from 'moment';

// Create the context
const BloodSugarDataContext = createContext();

// Custom hook for using the context
export const useBloodSugarData = () => {
  const context = useContext(BloodSugarDataContext);
  if (!context) {
    throw new Error('useBloodSugarData must be used within a BloodSugarDataProvider');
  }
  return context;
};

// Provider component
export const BloodSugarDataProvider = ({ children }) => {
  // Core state
  const [bloodSugarData, setBloodSugarData] = useState([]);
  const [estimatedBloodSugarData, setEstimatedBloodSugarData] = useState([]);
  const [combinedData, setCombinedData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [targetGlucose, setTargetGlucose] = useState(120);

  // Configuration state
  const [dateRange, setDateRange] = useState({
    start: moment().subtract(7, 'days').format('YYYY-MM-DD'),
    end: moment().add(1, 'day').format('YYYY-MM-DD')
  });
  const [timeScale, setTimeScale] = useState({
    start: moment().subtract(7, 'days').valueOf(),
    end: moment().valueOf(),
    tickInterval: 12,
    tickFormat: 'MM/DD HH:mm'
  });
  const [unit, setUnit] = useState('mg/dL');
  const [estimationSettings, setEstimationSettings] = useState({
    enabled: true,
    stabilizationHours: 2,
    maxConnectGapMinutes: 20,
    fillFromStart: true,
    extendToCurrent: true,
    fillEntireGraph: true,
    returnToTarget: true
  });

  // Constants
  const currentDateTime = "2025-04-22 18:39:40";
  const currentUserLogin = "aliattia02";

  // Prevent initial render issues with refs
  const didInitialFetch = useRef(false);
  const processingData = useRef(false);

  // Helper function to determine blood sugar status
  const getBloodSugarStatus = useCallback((bloodSugar, target) => {
    const statusMap = {
      'low': { color: '#ff4444', label: 'Low' },
      'normal': { color: '#00C851', label: 'Normal' },
      'high': { color: '#ff8800', label: 'High' }
    };

    if (bloodSugar < target * 0.7) return statusMap.low;
    if (bloodSugar > target * 1.3) return statusMap.high;
    return statusMap.normal;
  }, []);

  // Update time scale based on date range
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


  const getFilteredEstimatedReadings = useCallback((allData = combinedData) => {
  if (!allData || allData.length === 0) return [];

  // Get only estimated/interpolated points
  const estimatedPoints = allData.filter(r => r.isInterpolated || r.isEstimated);

  if (estimatedPoints.length <= 1) return estimatedPoints;

  // Get actual readings to avoid overlap
  const actualReadings = allData.filter(r => r.isActualReading);

  // Sort by time
  estimatedPoints.sort((a, b) => a.readingTime - b.readingTime);

  const filteredEstimates = [];
  let lastIncludedTime = 0;

  // Process each estimated point
  estimatedPoints.forEach(point => {
    // Check if this point is at least 30 minutes from the last included point
    const timeGapOK = (point.readingTime - lastIncludedTime) >= 30 * 60 * 1000;

    // Check if this point is at least 15 minutes away from any actual reading
    const awayFromActualReadings = !actualReadings.some(actual =>
      Math.abs(actual.readingTime - point.readingTime) < 15 * 60 * 1000
    );

    // Include the point if both conditions are met
    if (timeGapOK && awayFromActualReadings) {
      filteredEstimates.push(point);
      lastIncludedTime = point.readingTime;
    }
  });

  return filteredEstimates;
}, [combinedData]);


  // Filter data based on time scale
  const getFilteredData = useCallback((dataToFilter) => {
    if (!dataToFilter || dataToFilter.length === 0) return [];

    return dataToFilter.filter(item =>
      item.readingTime >= timeScale.start &&
      item.readingTime <= timeScale.end
    );
  }, [timeScale]);

  // Update filtered data when blood sugar data or time scale changes
  useEffect(() => {
    setFilteredData(getFilteredData(bloodSugarData));
  }, [bloodSugarData, getFilteredData]);

  // Generate estimated blood glucose data
  const generateEstimatedData = useCallback((actualData) => {
    // Prevent running this function if we're already processing data
    if (processingData.current) return;
    processingData.current = true;

    const dataToProcess = actualData || filteredData;

    if (!estimationSettings.enabled || dataToProcess.length === 0) {
      setEstimatedBloodSugarData([]);
      setCombinedData(dataToProcess);
      processingData.current = false;
      return;
    }

    // Model blood glucose value without meal input
    const modelBloodGlucose = (startReading, elapsedMinutes) => {
      const baseValue = startReading.bloodSugar;
      const stabilizationMinutes = estimationSettings.stabilizationHours * 60;

      if (elapsedMinutes < stabilizationMinutes) {
        const stabilizationRatio = elapsedMinutes / stabilizationMinutes;
        const exponentialReturn = 1 - Math.exp(-3 * stabilizationRatio);
        return targetGlucose + (baseValue - targetGlucose) * (1 - exponentialReturn);
      }

      return targetGlucose;
    };

    // Create estimated points between actual readings
    const generateEstimatedPoints = (startPoint, endTimeOrPoint, numPoints = 10) => {
      const points = [];
      const startTime = startPoint.readingTime;

      // Handle both endPoint object and raw endTime value
      let endTime;
      if (typeof endTimeOrPoint === 'number') {
        endTime = endTimeOrPoint; // It's a timestamp
      } else if (endTimeOrPoint && endTimeOrPoint.readingTime) {
        endTime = endTimeOrPoint.readingTime; // It's a point object
      } else {
        endTime = moment().valueOf(); // Default to current time
      }

      const totalGapMinutes = (endTime - startTime) / (60 * 1000);

      // Skip if gap is too small
      if (totalGapMinutes < 5) return points;

      // Determine number of points to generate
      const pointsToGenerate = Math.max(2, Math.ceil(totalGapMinutes / 30));
      const actualPoints = Math.min(pointsToGenerate, numPoints);
      const timeStep = (endTime - startTime) / (actualPoints + 1);

      for (let i = 1; i <= actualPoints; i++) {
        const pointTime = startTime + (i * timeStep);
        const elapsedMinutes = (pointTime - startTime) / (60 * 1000);

        // Calculate blood glucose based on our model
        let glucoseValue = modelBloodGlucose(startPoint, elapsedMinutes);

        points.push({
          readingTime: pointTime,
          bloodSugar: glucoseValue,
          formattedReadingTime: moment(pointTime).format('MM/DD/YYYY, HH:mm'),
          isActualReading: false,
          isInterpolated: true,
          isEstimated: true,
          dataType: 'estimated',
          status: getBloodSugarStatus(glucoseValue, targetGlucose)
        });
      }

      return points;
    };

    try {
      // Start building the estimated dataset
      let estimatedPoints = [];
      const sortedActualReadings = [...dataToProcess].sort((a, b) => a.readingTime - b.readingTime);

      // Start with a target value at timeScale.start if needed
      if (estimationSettings.fillFromStart && sortedActualReadings.length > 0 &&
          sortedActualReadings[0].readingTime > timeScale.start) {
        const startPoint = {
          readingTime: timeScale.start,
          bloodSugar: targetGlucose,
          formattedReadingTime: moment(timeScale.start).format('MM/DD/YYYY, HH:mm'),
          isActualReading: false,
          isInterpolated: true,
          isEstimated: true,
          dataType: 'estimated',
          status: getBloodSugarStatus(targetGlucose, targetGlucose)
        };

        estimatedPoints.push(startPoint);

        // Generate estimated points from start to first reading
        const pointsToFirstReading = generateEstimatedPoints(
          startPoint,
          sortedActualReadings[0],
          Math.max(5, Math.ceil((sortedActualReadings[0].readingTime - startPoint.readingTime) / (30 * 60 * 1000)))
        );
        estimatedPoints = [...estimatedPoints, ...pointsToFirstReading];
      }

      // Add estimated points between actual readings
      for (let i = 0; i < sortedActualReadings.length; i++) {
        // Add the actual reading to estimated line as an anchor point
        estimatedPoints.push({
          ...sortedActualReadings[i],
          isEstimatedLine: true
        });

        // Generate estimated points to next reading or continue the pattern
        if (i < sortedActualReadings.length - 1) {
          const pointsBetweenReadings = generateEstimatedPoints(
            sortedActualReadings[i],
            sortedActualReadings[i+1],
            Math.max(5, Math.ceil((sortedActualReadings[i+1].readingTime - sortedActualReadings[i].readingTime) / (30 * 60 * 1000)))
          );
          estimatedPoints = [...estimatedPoints, ...pointsBetweenReadings];
        }
        // If this is the last reading, extend to fill the graph
        else {
          // Decide where to extend to
          let endTime;

          if (estimationSettings.fillEntireGraph) {
            // Fill to the end of the time scale
            endTime = timeScale.end;
          } else if (estimationSettings.extendToCurrent) {
            // Fill only to current time
            endTime = moment().valueOf();
          } else {
            // No extension needed
            continue;
          }

          // Skip if the last reading is already beyond our end point
          if (sortedActualReadings[i].readingTime >= endTime) continue;

          // Generate estimated points from last reading to end time
          const pointsToEndTime = generateEstimatedPoints(
            sortedActualReadings[i],
            endTime,
            Math.max(5, Math.ceil((endTime - sortedActualReadings[i].readingTime) / (30 * 60 * 1000)))
          );
          estimatedPoints = [...estimatedPoints, ...pointsToEndTime];

          // Add final point at the end time showing target glucose
          const finalPoint = {
            readingTime: endTime,
            bloodSugar: targetGlucose,
            formattedReadingTime: moment(endTime).format('MM/DD/YYYY, HH:mm'),
            isActualReading: false,
            isInterpolated: true,
            isEstimated: true,
            dataType: 'estimated',
            status: getBloodSugarStatus(targetGlucose, targetGlucose)
          };

          estimatedPoints.push(finalPoint);
        }
      }

      setEstimatedBloodSugarData(estimatedPoints);

      // Combine all data
      const combined = [...sortedActualReadings, ...estimatedPoints.filter(p => p.isInterpolated)];
      combined.sort((a, b) => a.readingTime - b.readingTime);
      setCombinedData(combined);
    } catch(err) {
      console.error('Error generating estimated data:', err);
    } finally {
      processingData.current = false;
    }

  }, [estimationSettings, targetGlucose, timeScale, filteredData, getBloodSugarStatus]);

  // Fetch blood sugar data from API
  const fetchBloodSugarData = useCallback(async (patientId = null) => {
    // Avoid fetch if already loading
    if (loading) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Build API endpoint
      const startDate = moment(dateRange.start).format('YYYY-MM-DD');
      const endDate = moment(dateRange.end).format('YYYY-MM-DD');

      let url = `http://localhost:5000/api/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`;
      if (patientId) {
        url = `http://localhost:5000/doctor/patient/${patientId}/blood-sugar?start_date=${startDate}&end_date=${endDate}&unit=${unit}`;
      }

      console.log('Fetching blood sugar data from:', url);
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Process the data
      const formattedData = response.data.map(item => {
        // Use reading time (bloodSugarTimestamp) if available, otherwise use recording time (timestamp)
        const readingTime = item.bloodSugarTimestamp || item.timestamp;

        // Parse the UTC timestamps explicitly
        const localReadingTime = moment.utc(readingTime).local();
        const localRecordingTime = moment.utc(item.timestamp).local();

        const itemTarget = item.target || targetGlucose;

        return {
          ...item,
          readingTime: localReadingTime.valueOf(),
          formattedReadingTime: localReadingTime.format('MM/DD/YYYY, HH:mm'),
          formattedRecordingTime: localRecordingTime.format('MM/DD/YYYY, HH:mm'),
          status: getBloodSugarStatus(item.bloodSugar, itemTarget),
          isActualReading: true,
          isInterpolated: false,
          dataType: 'actual',
          target: itemTarget
        };
      });

      formattedData.sort((a, b) => a.readingTime - b.readingTime);
      setBloodSugarData(formattedData);

      setError('');
    } catch (err) {
      console.error('Error fetching blood sugar data:', err);
      setError('Failed to fetch blood sugar data: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [dateRange, unit, targetGlucose, getBloodSugarStatus, loading]);

  // Apply an insulin effect to the estimated blood glucose data
  const applyInsulinEffect = useCallback((insulinData, bloodSugarDataToModify = combinedData) => {
    if (!insulinData || insulinData.length === 0 || bloodSugarDataToModify.length === 0) {
      return bloodSugarDataToModify;
    }

    // Clone the data to avoid mutation
    const modifiedData = JSON.parse(JSON.stringify(bloodSugarDataToModify));

    // For each blood sugar reading, calculate the cumulative insulin effect
    modifiedData.forEach(reading => {
      if (!reading.isEstimated && !reading.isInterpolated) {
        // Don't modify actual readings
        return;
      }

      let totalEffect = 0;
      const readingTime = reading.readingTime;

      // Calculate effect from each insulin dose
      insulinData.forEach(dose => {
        const doseTime = dose.administrationTime;
        const hoursSinceDose = (readingTime - doseTime) / (60 * 60 * 1000);

        // Skip if the dose is in the future or too old
        if (hoursSinceDose < 0 || hoursSinceDose > 8) {
          return;
        }

        // Get insulin parameters
        const params = dose.pharmacokinetics || {
          onset_hours: 0.5,
          peak_hours: 2,
          duration_hours: 5,
          type: 'short_acting'
        };

        // Calculate effect using insulin action curve
        let effect = 0;
        const { onset_hours, peak_hours, duration_hours } = params;

        // Return 0 if outside the duration window
        if (hoursSinceDose < 0 || hoursSinceDose > duration_hours) {
          effect = 0;
        }
        // For "peakless" insulins like glargine or detemir
        else if (peak_hours === null) {
          // Simple flat effect after onset
          if (hoursSinceDose < onset_hours) {
            effect = dose.dose * (hoursSinceDose / onset_hours) * 0.5;
          } else {
            effect = dose.dose * 0.5 * (1 - ((hoursSinceDose - onset_hours) / (duration_hours - onset_hours)));
          }
        }
        // For insulins with a peak (calculate using a triangular model)
        else {
          // Rising phase (onset to peak)
          if (hoursSinceDose < peak_hours) {
            if (hoursSinceDose < onset_hours) {
              effect = dose.dose * (hoursSinceDose / onset_hours) * (peak_hours / duration_hours);
            } else {
              effect = dose.dose * (hoursSinceDose / peak_hours);
            }
          }
          // Falling phase (peak to end)
          else {
            effect = dose.dose * (1 - ((hoursSinceDose - peak_hours) / (duration_hours - peak_hours)));
          }
        }

        totalEffect += Math.max(0, effect);
      });

      // Apply the insulin effect (each unit of insulin reduces blood sugar by ~50 mg/dL)
      const insulinSensitivity = 50; // This could be personalized per patient
      reading.predictedBloodSugar = Math.max(70, reading.bloodSugar - (totalEffect * insulinSensitivity));
      reading.insulinEffect = totalEffect;
    });

    return modifiedData;
  }, [combinedData]);

  // Utility function to get blood sugar at a specific time
  const getBloodSugarAtTime = useCallback((timestamp) => {
    // Find the closest reading to the given timestamp
    if (combinedData.length === 0) return null;

    // Sort by absolute time difference
    const sortedByProximity = [...combinedData]
      .sort((a, b) => Math.abs(a.readingTime - timestamp) - Math.abs(b.readingTime - timestamp));

    return sortedByProximity[0];
  }, [combinedData]);

  // Update estimated data when filteredData changes
  useEffect(() => {
    // Skip initial render
    if (didInitialFetch.current) {
      generateEstimatedData();
    }
  }, [filteredData, estimationSettings, targetGlucose, generateEstimatedData]);

  // Initial data fetch and setup
  useEffect(() => {
    // This has to be done after the component mounts
    updateTimeScale();

    // Only fetch if there's a token
    const token = localStorage.getItem('token');
    if (token && !didInitialFetch.current) {
      fetchBloodSugarData();
      didInitialFetch.current = true;
    }
  }, [updateTimeScale, fetchBloodSugarData]);

  // Value to be provided by the context - define this AFTER all functions are defined
  const contextValue = {
    // Data
    bloodSugarData,
    filteredData,
    estimatedBloodSugarData,
    combinedData,
    loading,
    error,
    targetGlucose,
    dateRange,
    timeScale,
    unit,
    estimationSettings,
    currentDateTime,
    currentUserLogin,
        // Functions
  filteredEstimatedReadings: getFilteredEstimatedReadings(),
  getFilteredEstimatedReadings,

    fetchBloodSugarData,
    setDateRange,
    setUnit,
    setTargetGlucose,
    setEstimationSettings,
    getBloodSugarStatus,
    getFilteredData,
    applyInsulinEffect,
    getBloodSugarAtTime
  };

  return (
    <BloodSugarDataContext.Provider value={contextValue}>
      {children}
    </BloodSugarDataContext.Provider>
  );
};

export default BloodSugarDataContext;