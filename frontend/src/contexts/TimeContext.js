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
  const [userTimeZone, setUserTimeZone] = useState(TimeManager.getUserTimeZone());

  // Future projection settings - centralized here to avoid duplication
  const [includeFutureEffect, setIncludeFutureEffect] = useState(true);
  const [futureHours, setFutureHours] = useState(7);

  // System info (using TimeManager for consistency)
  const [systemDateTime, setSystemDateTime] = useState(
    TimeManager.getSystemDateTime(TimeManager.formats.SYSTEM_TIME)
  );
  const [currentUserLogin, setCurrentUserLogin] = useState(
    TimeManager.getCurrentUserLogin()
  );

  // Timer ref to prevent memory leaks
  const timerRef = useRef(null);

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
    // Also update system time if needed for real-time applications
    setSystemDateTime(TimeManager.getSystemDateTime(TimeManager.formats.SYSTEM_TIME));
  }, []);

  // Date range change handler
  const handleDateRangeChange = useCallback((e) => {
    // Handle both event-style inputs and direct object updates
    if (e && e.target) {
      const { name, value } = e.target;
      setDateRange(prev => {
        const newRange = { ...prev, [name]: value };
        return newRange;
      });
    } else if (typeof e === 'object') {
      // Direct object update (e.g., {start: '2023-01-01', end: '2023-01-31'})
      setDateRange(e);
    }
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

  // Update future hours projection
  const setFutureHoursValue = useCallback((hours) => {
    // Ensure hours is a valid number between 1 and 24
    const validHours = Math.min(Math.max(1, Number(hours) || 7), 24);
    setFutureHours(validHours);
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
    return TimeManager.getFutureProjectionTime(futureHours);
  }, [includeFutureEffect, futureHours]);

  // Calculate time settings for API requests with future data
  const getAPITimeSettings = useCallback(() => {
    // Calculate the date range including future hours if needed
    const endDate = includeFutureEffect
      ? TimeManager.addHours(new Date(dateRange.end), futureHours)
      : new Date(dateRange.end);

    return {
      startDate: dateRange.start,
      endDate: TimeManager.formatDate(endDate, TimeManager.formats.DATE),
      includeFuture: includeFutureEffect,
      futureHours
    };
  }, [dateRange, includeFutureEffect, futureHours]);

  // Value to be provided by the context
  const contextValue = {
    // Core time state
    currentDateTime: currentDateTime.getTime(),
    currentDateTimeFormatted: TimeManager.formatDate(currentDateTime, TimeManager.formats.DATETIME_FULL),
    dateRange,
    timeScale,
    userTimeZone,

    // Future projection settings - centralized
    includeFutureEffect,
    futureHours,

    // System info
    systemDateTime,
    currentUserLogin,

    // Time format constants
    formats: TimeManager.formats,

    // Functions
    setDateRange,
    handleDateRangeChange,
    applyDatePreset,
    setFutureHours: setFutureHoursValue,
    toggleFutureEffect,
    generateTimeTicks,
    formatXAxis,
    isTimeInRange,
    formatDateTime,
    getFutureProjectionEndTime,
    getAPITimeSettings,

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