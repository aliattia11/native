/**
 * TimeManager - Enhanced utility for standardized time handling across the application
 *
 * USAGE GUIDELINES:
 * 1. PREFERRED: Access TimeManager through useTime() hook from TimeContext
 *    Example: const { getCurrentTimeLocal, localToUTC } = useTime();
 *
 * 2. ALTERNATIVE: Import TimeManager directly when outside of React components
 *    Example: import TimeManager from '../utils/TimeManager';
 *
 * 3. ALWAYS: Store times in UTC in backend, display in local timezone to users
 *
 * 4. CONVERSION PATTERN:
 *    - UI Input → capture as local time
 *    - Before API call → convert to UTC using localToUTCISOString()
 *    - After API response → convert from UTC to local using utcToLocalString()
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
    CHART_TICKS_LONG: 'MM/DD',
    SYSTEM_TIME: 'YYYY-MM-DD HH:mm:ss' // Dedicated format for system time
  };

  /**
   * Constants for commonly used time values
   */
  static constants = {
    MILLISECONDS_PER_MINUTE: 60 * 1000,
    MILLISECONDS_PER_HOUR: 60 * 60 * 1000,
    MILLISECONDS_PER_DAY: 24 * 60 * 60 * 1000
  };

  /**
   * Get user's timezone
   * @returns {string} User's timezone (e.g. "America/New_York")
   */
  static getUserTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

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
   * @param {string|null} format - Optional format to override default
   * @returns {string} System date/time in specified format
   */
  static getSystemDateTime(format = null) {
  // Use the actual current time instead of hardcoded value
  const now = new Date();
  const systemTime = now.toISOString().replace('T', ' ').substring(0, 19);

  if (!format) {
    return systemTime;
  }

  // Parse the system time string and format it as requested
  try {
    const [datePart, timePart] = systemTime.split(' ');
    const [year, month, day] = datePart.split('-');
    const [hours, minutes, seconds] = timePart.split(':');

    const date = new Date(Date.UTC(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds || 0)
    ));

    return this.formatDate(date, format);
  } catch (e) {
    console.error('Error parsing system time:', e);
    return systemTime;
  }
}

  /**
   * Get current user login
   * @returns {string} Current user's login ID
   */
  static getCurrentUserLogin() {
    // For the diabetes management system, we're using a specific login
    return "aliattia02";
  }

  /**
   * Convert a UTC timestamp to local timezone
   * @param {number|string|Date} utcTime - UTC timestamp to convert
   * @returns {Date} Date object in local timezone
   */
  static utcToLocal(utcTime) {
    const date = new Date(utcTime);
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds()
    );
  }

  /**
   * Convert a local timestamp to UTC
   * @param {number|string|Date} localTime - Local timestamp to convert
   * @returns {Date} Date object in UTC
   */
  static localToUtc(localTime) {
    const date = new Date(localTime);
    return new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    ));
  }

  /**
   * Generate evenly spaced ticks for chart X-axis based on time range
   * @param {number} startTime - Start timestamp in milliseconds
   * @param {number} endTime - End timestamp in milliseconds
   * @param {number} tickInterval - Hours between ticks
   * @returns {number[]} Array of timestamp ticks
   */
  static generateTimeTicks(startTime, endTime, tickInterval = 12) {
    if (!startTime || !endTime) {
      console.warn('Invalid time range for ticks generation', { startTime, endTime });
      return [];
    }

    const ticksArray = [];
    const start = new Date(startTime);
    start.setMinutes(0, 0, 0); // Align to hour boundary

    let current = start.getTime();
    const intervalMs = tickInterval * this.constants.MILLISECONDS_PER_HOUR;

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

  // Add this check for undefined format
  if (!format) {
    format = this.formats.DATETIME_DISPLAY; // Use default format
  }

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

    // Format simple month and day for display (without leading zeros)
    const displayMonth = (d.getMonth() + 1).toString();
    const displayDay = d.getDate().toString();

    // Replace format tokens
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
      .replace('M', displayMonth) // For non-zero padded month
      .replace('D', displayDay);  // For non-zero padded day
  }

  /**
   * Determine appropriate time scale settings based on date range
   * @param {string} startDate - Start date in YYYY-MM-DD format
   * @param {string} endDate - End date in YYYY-MM-DD format
   * @returns {object} Time scale settings with start, end, tickInterval, and tickFormat
   */
  static getTimeScaleForRange(startDate, endDate) {
    if (!startDate || !endDate) {
      console.warn('Invalid date range for time scale', { startDate, endDate });
      // Provide reasonable defaults
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * this.constants.MILLISECONDS_PER_DAY);

      return this.getTimeScaleForRange(
        this.formatDate(weekAgo, this.formats.DATE),
        this.formatDate(now, this.formats.DATE)
      );
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const diffDays = (end - start) / this.constants.MILLISECONDS_PER_DAY;

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
   * Format a timestamp as just the time (HH:MM)
   * @param {string|Date} timestamp - The timestamp to format
   * @returns {string} Time in HH:MM format
   */
  static formatTime(timestamp) {
    if (!timestamp) return '';

    try {
      const date = new Date(timestamp);
      // Handle invalid dates
      if (isNaN(date.getTime())) return '';

      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');

      return `${hours}:${minutes}`;
    } catch (error) {
      console.error('Error formatting time:', error);
      return '';
    }
  }

  /**
   * Parse timestamp safely ensuring it's treated correctly whether it has timezone info or not
   * @param {string|Date} timestamp - The timestamp to parse
   * @returns {Date} Properly parsed Date object
   */
  static parseTimestamp(timestamp) {
    if (!timestamp) return new Date();

    if (timestamp instanceof Date) return timestamp;

    try {
      // If the timestamp has 'Z' at the end, it's already in UTC format
      if (typeof timestamp === 'string') {
        if (timestamp.endsWith('Z') || timestamp.includes('+') || timestamp.includes('-', 10)) {
          // Has timezone info - parse directly
          return new Date(timestamp);
        } else {
          // No timezone info - treat as UTC time
          const [datePart, timePart] = timestamp.includes('T')
            ? timestamp.split('T')
            : [timestamp.split(' ')[0], timestamp.split(' ')[1] || '00:00:00'];

          if (!datePart) return new Date();

          const [year, month, day] = datePart.split('-').map(num => parseInt(num, 10));
          const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(num => parseInt(num, 10));

          // Create the date in UTC
          return new Date(Date.UTC(year, month - 1, day, hours || 0, minutes || 0, seconds || 0));
        }
      }

      return new Date(timestamp);
    } catch (error) {
      console.error('Error parsing timestamp:', error, timestamp);
      return new Date();
    }
  }

  /**
   * Format a timestamp as a relative time (e.g., "5 minutes ago")
   * Uses system time rather than browser time for consistency
   * @param {string|Date} timestamp - The timestamp to format
   * @returns {string} Human-readable relative time
   */
  static formatRelativeTime(timestamp) {
    if (!timestamp) return '';

    try {
      // Parse the timestamp as UTC
      const date = this.parseTimestamp(timestamp);

      // Get the system time as UTC
      const systemTime = this.parseTimestamp(this.getSystemDateTime());

      // Handle invalid dates
      if (isNaN(date.getTime())) return '';

      const diffMs = systemTime - date;

      // If very recent (less than a minute ago)
      if (diffMs < this.constants.MILLISECONDS_PER_MINUTE) {
        return 'just now';
      }

      // If less than an hour ago
      if (diffMs < this.constants.MILLISECONDS_PER_HOUR) {
        const mins = Math.floor(diffMs / this.constants.MILLISECONDS_PER_MINUTE);
        return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
      }

      // If less than a day ago
      if (diffMs < this.constants.MILLISECONDS_PER_DAY) {
        const hours = Math.floor(diffMs / this.constants.MILLISECONDS_PER_HOUR);
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
      }

      // If less than a week ago
      if (diffMs < 7 * this.constants.MILLISECONDS_PER_DAY) {
        const days = Math.floor(diffMs / this.constants.MILLISECONDS_PER_DAY);
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
      }

      // If more than a week ago, format as a date
      return this.formatDate(date, this.formats.DATETIME_DISPLAY);
    } catch (error) {
      console.error('Error formatting relative time:', error);
      return '';
    }
  }

  /**
   * Check if a timestamp is within a given range
   * @param {number} timestamp - Timestamp to check
   * @param {number} startTime - Range start timestamp
   * @param {number} endTime - Range end timestamp
   * @returns {boolean} True if timestamp is within range
   */
  static isTimeInRange(timestamp, startTime, endTime) {
    if (!timestamp || !startTime || !endTime) return false;
    return timestamp >= startTime && timestamp <= endTime;
  }

  /**
   * Add specified hours to a date
   * @param {Date|string|number} date - Date to modify
   * @param {number} hours - Hours to add (can be negative)
   * @returns {Date} New date with hours added
   */
  static addHours(date, hours) {
    const result = new Date(date);
    result.setTime(result.getTime() + (hours * this.constants.MILLISECONDS_PER_HOUR));
    return result;
  }

  /**
   * Calculate future projection end time
   * @param {number} futureHours - Hours to project into future
   * @returns {number} Future timestamp in milliseconds
   */
  static getFutureProjectionTime(futureHours = 7) {
    const now = new Date();
    return this.addHours(now, futureHours).getTime();
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

      const totalMinutes = durationMs / this.constants.MILLISECONDS_PER_MINUTE;
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
      // Parse timestamp as UTC
      const date = this.parseTimestamp(isoString);
      // Format using browser's locale
      return date.toLocaleString();
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  }

  static getTimePointHoursAgo(hoursAgo) {
    const date = this.addHours(new Date(), -hoursAgo);

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