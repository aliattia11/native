/**
 * TimeManager - Enhanced utility for standardized time handling across the application
 */
class TimeManager {
  /**
   * Standard date formats used throughout the application
   */
  static formats = {
    DATE: 'YYYY-MM-DD',
    TIME: 'HH:mm',
    DATETIME: 'YYYY-MM-DD HH:mm',
    DATETIME_DISPLAY: 'MM/DD/YYYY, HH:mm',
    DATETIME_FULL: 'YYYY-MM-DD HH:mm:ss',
    DATETIME_ISO: 'YYYY-MM-DDTHH:mm',
    CHART_TICKS_SHORT: 'HH:mm',
    CHART_TICKS_MEDIUM: 'DD/MM HH:mm',
    CHART_TICKS_LONG: 'MM/DD'
  };

  /**
   * Get current time as ISO string suitable for datetime-local input
   * Format: YYYY-MM-DDTHH:MM in local timezone
   * @returns {string} ISO datetime string in local timezone (YYYY-MM-DDTHH:MM)
   */
  static getCurrentTimeISOString() {
    const now = new Date();
    // Adjust format for datetime-local input (YYYY-MM-DDTHH:MM)
    // This preserves the local timezone instead of converting to UTC
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  /**
   * Get system date and time in consistent format
   * In a real application, this would retrieve from server or system
   * @returns {string} System date/time in YYYY-MM-DD HH:mm:ss format
   */
  static getSystemDateTime() {
    // Get current UTC date and time in the required format
    const now = new Date();
    return this.formatDate(now, this.formats.DATETIME_FULL);
  }

  /**
   * Get current user login
   * In a real application, this would come from auth context
   * @returns {string} Current user's login ID
   */
  static getCurrentUserLogin() {
    // Retrieve from localStorage or session - for demo purposes
    return localStorage.getItem('username') || 'Unknown User';
  }

  /**
   * Generate evenly spaced ticks for chart X-axis based on time range
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} tickInterval - Hours between ticks
   * @returns {number[]} Array of timestamp ticks
   */
  static generateTimeTicks(startTime, endTime, tickInterval = 12) {
    const ticksArray = [];
    const start = new Date(startTime);
    start.setMinutes(0, 0, 0); // Align to hour boundary

    let current = start.getTime();
    const intervalMs = tickInterval * 60 * 60 * 1000;

    while (current <= endTime) {
      ticksArray.push(current);
      current += intervalMs;
    }

    return ticksArray;
  }

  /**
   * Format a timestamp for X-axis display
   * @param {number} timestamp - Timestamp in milliseconds
   * @param {string} format - Format string (from formats object)
   * @returns {string} Formatted date string
   */
  static formatAxisTick(timestamp, format) {
    const date = new Date(timestamp);
    const formatString = this.formats[format] || format || this.formats.DATETIME_DISPLAY;

    return this.formatDate(date, formatString);
  }

  /**
   * Format a date using specified format
   * @param {Date|number|string} date - Date to format
   * @param {string} format - Format string
   * @returns {string} Formatted date string
   */
  static formatDate(date, format) {
    if (!date) return '';

    const d = new Date(date);

    // Handle invalid dates
    if (isNaN(d.getTime())) return '';

    // Extract date components
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    // Replace format tokens
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  }

  /**
   * Determine appropriate time scale settings based on date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {object} Time scale settings with start, end, tickInterval, and tickFormat
   */
  static getTimeScaleForRange(startDate, endDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const diffDays = (end - start) / (1000 * 60 * 60 * 24);

    let tickInterval, tickFormat;

    // Determine scale based on range duration
    if (diffDays <= 1) {
      tickInterval = 2;  // 2 hour intervals
      tickFormat = this.formats.CHART_TICKS_SHORT;
    } else if (diffDays <= 7) {
      tickInterval = 12; // 12 hour intervals
      tickFormat = this.formats.CHART_TICKS_MEDIUM;
    } else {
      tickInterval = 24; // 1 day intervals
      tickFormat = this.formats.CHART_TICKS_LONG;
    }

    return {
      start: start.getTime(),
      end: end.getTime(),
      tickInterval,
      tickFormat
    };
  }

  /**
   * Check if a timestamp is within a given range
   * @param {number} timestamp - Timestamp to check
   * @param {number} startTime - Range start timestamp
   * @param {number} endTime - Range end timestamp
   * @returns {boolean} True if timestamp is within range
   */
  static isTimeInRange(timestamp, startTime, endTime) {
    return timestamp >= startTime && timestamp <= endTime;
  }

  // Existing methods are preserved below this point
  static durationToHours(duration) {
    if (typeof duration === 'number') return duration;

    if (typeof duration === 'string' && duration.includes(':')) {
      const [hours, minutes] = duration.split(':').map(num => parseInt(num, 10) || 0);
      return hours + (minutes / 60);
    }

    return parseFloat(duration) || 0;
  }

  static hoursToTimeString(hours) {
    if (hours === undefined || hours === null) return "00:00";

    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    return `${wholeHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  static calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) {
      return { hours: 0, minutes: 0, totalHours: 0, formatted: "0h 0m" };
    }

    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const durationMs = Math.max(0, end - start);

      const totalMinutes = durationMs / (1000 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = Math.round(totalMinutes % 60);

      return {
        hours,
        minutes,
        totalHours: hours + (minutes / 60),
        formatted: `${hours}h ${minutes}m`
      };
    } catch (error) {
      console.error("Error calculating duration:", error);
      return { hours: 0, minutes: 0, totalHours: 0, formatted: "0h 0m" };
    }
  }

  static formatDateTime(isoString) {
    if (!isoString) return '';

    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }

  static getTimePointHoursAgo(hoursAgo) {
    const date = new Date();
    date.setHours(date.getHours() - hoursAgo);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  // Convert UTC ISO string to local datetime format
  static utcToLocalString(utcIsoString) {
    if (!utcIsoString) return '';

    try {
      const date = new Date(utcIsoString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');

      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch (error) {
      console.error('Error converting UTC to local time:', error);
      return '';
    }
  }

  // Convert local datetime to UTC ISO string
  static localToUTCISOString(localDateTimeString) {
    if (!localDateTimeString) return new Date().toISOString();

    // Create Date object from the local datetime string
    const localDate = new Date(localDateTimeString);
    // Convert to UTC ISO string
    return localDate.toISOString();
  }

  // For compatibility
  static utcToLocalIsoString(utcIsoString) {
    return this.utcToLocalString(utcIsoString);
  }
}

export default TimeManager;