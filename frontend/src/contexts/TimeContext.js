import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import TimeManager from '../utils/TimeManager';

// Create the context
const TimeContext = createContext();

// Custom hook for using the context
export const useTime = () => {
  const context = useContext(TimeContext);
  if (!context) {
    throw new Error('useTime must be used within a TimeProvider');
  }
  return context;
};

// Provider component
export const TimeProvider = ({ children }) => {
  // Core time state
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
    end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]  // Tomorrow
  });
  const [timeScale, setTimeScale] = useState({});
  const [userTimeZone, setUserTimeZone] = useState('');

  // Future projection settings
  const [includeFutureEffect, setIncludeFutureEffect] = useState(true);
  const [futureHours, setFutureHours] = useState(7);

  // System info (using the specific values provided)
  const [systemDateTime, setSystemDateTime] = useState("2025-04-28 00:01:48");
  const [currentUserLogin, setCurrentUserLogin] = useState("aliattia02ok");

  // Timer ref to prevent memory leaks
  const timerRef = useRef(null);

  // Get user's timezone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Update current time at regular intervals
  useEffect(() => {
    // Update immediately
    updateCurrentTime();

    // Set up interval for future updates (every minute)
    timerRef.current = setInterval(updateCurrentTime, 60000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Initialize time scale on mount and when date range changes
  useEffect(() => {
    const newTimeScale = TimeManager.getTimeScaleForRange(dateRange.start, dateRange.end);
    setTimeScale(newTimeScale);
  }, [dateRange]);

  // Helper to update current time
  const updateCurrentTime = useCallback(() => {
    setCurrentDateTime(new Date());
  }, []);

  // Date range change handler
  const handleDateRangeChange = useCallback((e) => {
    const { name, value } = e.target;
    setDateRange(prev => {
      const newRange = { ...prev, [name]: value };
      return newRange;
    });
  }, []);

  // Quick date range presets
  const applyDatePreset = useCallback((days) => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().split('T')[0];

    let end;
    if (days === 1) {
      // For "Last 24h": past day plus 12 hours
      end = new Date(now);
      end.setHours(end.getHours() + 12);
    } else if (days === 7) {
      // For "Last Week": past 7 days plus one future day
      end = new Date(now);
      end.setDate(end.getDate() + 1);
    } else if (days === 30) {
      // For "Last Month": past 30 days plus 4 future days
      end = new Date(now);
      end.setDate(end.getDate() + 4);
    } else {
      // Default case
      end = new Date(now);
      end.setDate(end.getDate() + 1);
    }
    const endStr = end.toISOString().split('T')[0];

    setDateRange({
      start: startStr,
      end: endStr
    });
  }, []);

  // Toggle future effect projection
  const toggleFutureEffect = useCallback(() => {
    setIncludeFutureEffect(prev => !prev);
  }, []);

  // Generate ticks for x-axis based on time scale
  const generateTimeTicks = useCallback(() => {
    return TimeManager.generateTimeTicks(timeScale.start, timeScale.end, timeScale.tickInterval);
  }, [timeScale]);

  // Format X-axis labels
  const formatXAxis = useCallback((tickItem) => {
    return TimeManager.formatAxisTick(tickItem, timeScale.tickFormat);
  }, [timeScale]);

  // Check if a timestamp is within the current time scale range
  const isTimeInRange = useCallback((timestamp) => {
    return TimeManager.isTimeInRange(timestamp, timeScale.start, timeScale.end);
  }, [timeScale]);

  // Format a date for consistent display
  const formatDateTime = useCallback((date, format = TimeManager.formats.DATETIME_DISPLAY) => {
    return TimeManager.formatDate(date, format);
  }, []);

  // Get future projection end time
  const getFutureProjectionEndTime = useCallback(() => {
    if (!includeFutureEffect) return Date.now();
    const now = new Date();
    const future = new Date(now);
    future.setHours(future.getHours() + futureHours);
    return future.getTime();
  }, [includeFutureEffect, futureHours]);

  // Value to be provided by the context
  const contextValue = {
    // Core time state
    currentDateTime: currentDateTime.getTime(),
    currentDateTimeFormatted: TimeManager.formatDate(currentDateTime, TimeManager.formats.DATETIME_FULL),
    dateRange,
    timeScale,
    userTimeZone,
    includeFutureEffect,
    futureHours,
    systemDateTime,
    currentUserLogin,

    // Time format constants
    formats: TimeManager.formats,

    // Functions
    setDateRange,
    handleDateRangeChange,
    applyDatePreset,
    setFutureHours,
    toggleFutureEffect,
    generateTimeTicks,
    formatXAxis,
    isTimeInRange,
    formatDateTime,
    getFutureProjectionEndTime,

    // Direct access to TimeManager for advanced usage
    TimeManager
  };

  return (
    <TimeContext.Provider value={contextValue}>
      {children}
    </TimeContext.Provider>
  );
};

export default TimeContext;