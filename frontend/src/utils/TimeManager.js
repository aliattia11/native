/**
 * TimeManager.js
 * A utility for handling all time-related operations consistently across the application.
 */

class TimeManager {
  /**
   * Get current time in ISO format
   * @returns {string} Current time in ISO format
   */
  static getCurrentTimeISOString() {
    return new Date().toISOString();
  }

  /**
   * Format date to locale date string (without time)
   * @param {string|Date} dateString - Date to format
   * @param {object} options - Formatting options
   * @returns {string} Formatted date string
   */
  static formatDate(dateString, options = {}) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      return date.toLocaleDateString(
        options.locale || undefined,
        options.dateOptions || { year: 'numeric', month: 'short', day: 'numeric' }
      );
    } catch (e) {
      console.error('Error formatting date:', e);
      return String(dateString);
    }
  }

  /**
   * Format date and time to locale string
   * @param {string|Date} dateString - Date to format
   * @param {object} options - Formatting options
   * @returns {string} Formatted date and time string
   */
  static formatDateTime(dateString, options = {}) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      return date.toLocaleString(
        options.locale || undefined,
        options.dateTimeOptions || {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }
      );
    } catch (e) {
      console.error('Error formatting date time:', e);
      return String(dateString);
    }
  }

  /**
   * Format time only (HH:MM)
   * @param {string|Date} dateString - Date to extract time from
   * @returns {string} Formatted time string (HH:MM)
   */
  static formatTime(dateString) {
    try {
      const date = dateString instanceof Date ? dateString : new Date(dateString);
      return date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } catch (e) {
      console.error('Error formatting time:', e);
      return String(dateString);
    }
  }

  /**
   * Convert a date to YYYY-MM-DD format
   * @param {Date|string} date - Date to format
   * @returns {string} Date in YYYY-MM-DD format
   */
  static toDateString(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Convert a time to HH:MM format
   * @param {Date|string} date - Date to extract time from
   * @returns {string} Time in HH:MM format
   */
  static toTimeString(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toTimeString().slice(0, 5);
  }

  /**
   * Calculate hours elapsed between two times
   * @param {Date|string} startTime - Start time
   * @param {Date|string} endTime - End time (defaults to now)
   * @returns {number} Hours elapsed
   */
  static getHoursElapsed(startTime, endTime = new Date()) {
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    return (end - start) / (1000 * 60 * 60);
  }

  /**
   * Calculate minutes elapsed between two times
   * @param {Date|string} startTime - Start time
   * @param {Date|string} endTime - End time (defaults to now)
   * @returns {number} Minutes elapsed
   */
  static getMinutesElapsed(startTime, endTime = new Date()) {
    const start = startTime instanceof Date ? startTime : new Date(startTime);
    const end = endTime instanceof Date ? endTime : new Date(endTime);
    return (end - start) / (1000 * 60);
  }

  /**
   * Compare if a date is before another date
   * @param {Date|string} date1 - First date
   * @param {Date|string} date2 - Second date
   * @returns {boolean} True if date1 is before date2
   */
  static isBefore(date1, date2) {
    const d1 = date1 instanceof Date ? date1 : new Date(date1);
    const d2 = date2 instanceof Date ? date2 : new Date(date2);
    return d1 < d2;
  }

  /**
   * Compare if a date is after another date
   * @param {Date|string} date1 - First date
   * @param {Date|string} date2 - Second date
   * @returns {boolean} True if date1 is after date2
   */
  static isAfter(date1, date2) {
    const d1 = date1 instanceof Date ? date1 : new Date(date1);
    const d2 = date2 instanceof Date ? date2 : new Date(date2);
    return d1 > d2;
  }

  /**
   * Format a duration in hours and minutes
   * @param {number} minutes - Duration in minutes
   * @returns {string} Formatted duration string (e.g. "2h 30m" or "45m")
   */
  static formatDuration(minutes) {
    if (!minutes && minutes !== 0) return '';

    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);

    if (hours && mins) {
      return `${hours}h ${mins}m`;
    } else if (hours) {
      return `${hours}h`;
    } else {
      return `${mins}m`;
    }
  }

  /**
   * Parse duration string (like "1:30" or "90") to minutes
   * @param {string} durationString - Duration string
   * @returns {number} Duration in minutes
   */
  static parseDuration(durationString) {
    if (!durationString) return 0;

    // Handle "HH:MM" format
    if (durationString.includes(':')) {
      const [hours, minutes] = durationString.split(':').map(Number);
      return (hours * 60) + minutes;
    }

    // Handle numeric string (minutes)
    return parseInt(durationString, 10);
  }

  /**
   * Add minutes to a date
   * @param {Date|string} date - Starting date
   * @param {number} minutes - Minutes to add
   * @returns {Date} New date
   */
  static addMinutes(date, minutes) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    return new Date(d.getTime() + minutes * 60000);
  }

  /**
   * Add hours to a date
   * @param {Date|string} date - Starting date
   * @param {number} hours - Hours to add
   * @returns {Date} New date
   */
  static addHours(date, hours) {
    return this.addMinutes(date, hours * 60);
  }

  /**
   * Add days to a date
   * @param {Date|string} date - Starting date
   * @param {number} days - Days to add
   * @returns {Date} New date
   */
  static addDays(date, days) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  /**
   * Get time of day category (morning, afternoon, evening, night)
   * @param {Date|string} date - Date to get time of day for
   * @returns {string} Time of day category
   */
  static getTimeOfDay(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const hour = d.getHours();

    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 22) return 'evening';
    return 'night';
  }

  /**
   * Format a relative time (e.g. "2 hours ago", "in 5 minutes")
   * @param {Date|string} date - Date to format
   * @returns {string} Relative time string
   */
  static formatRelativeTime(date) {
    const now = new Date();
    const d = date instanceof Date ? date : new Date(date);
    const diffMs = d - now;
    const diffSecs = Math.round(diffMs / 1000);
    const diffMins = Math.round(diffSecs / 60);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);

    if (diffSecs < -60 * 60 * 24 * 2) return `${-diffDays} days ago`;
    if (diffSecs < -60 * 60 * 24) return 'yesterday';
    if (diffSecs < -60 * 60 * 2) return `${-diffHours} hours ago`;
    if (diffSecs < -60 * 60) return 'an hour ago';
    if (diffSecs < -60 * 2) return `${-diffMins} minutes ago`;
    if (diffSecs < -60) return 'a minute ago';
    if (diffSecs < 0) return 'just now';
    if (diffSecs < 60) return 'in a moment';
    if (diffSecs < 60 * 2) return 'in a minute';
    if (diffSecs < 60 * 60) return `in ${diffMins} minutes`;
    if (diffSecs < 60 * 60 * 2) return 'in an hour';
    if (diffSecs < 60 * 60 * 24) return `in ${diffHours} hours`;
    if (diffSecs < 60 * 60 * 24 * 2) return 'tomorrow';
    return `in ${diffDays} days`;
  }

  /**
   * Parse time string to date object
   * @param {string} timeString - Time string (HH:MM)
   * @param {Date|string} [baseDate=today] - Base date to use
   * @returns {Date} Date object with the specified time
   */
  static parseTimeToDate(timeString, baseDate = new Date()) {
    if (!timeString) return null;

    const base = baseDate instanceof Date ? new Date(baseDate) : new Date(baseDate);
    const [hours, minutes] = timeString.split(':').map(Number);

    base.setHours(hours, minutes, 0, 0);
    return base;
  }

  /**
   * Check if a time string is valid (HH:MM)
   * @param {string} timeString - Time string to validate
   * @returns {boolean} True if valid
   */
  static isValidTimeString(timeString) {
    if (!timeString || typeof timeString !== 'string') return false;

    const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    return regex.test(timeString);
  }

  /**
   * Check if a date string is valid ISO format
   * @param {string} dateString - Date string to validate
   * @returns {boolean} True if valid
   */
  static isValidISOString(dateString) {
    if (!dateString || typeof dateString !== 'string') return false;

    try {
      const date = new Date(dateString);
      return !isNaN(date.getTime());
    } catch (e) {
      return false;
    }
  }

  /**
   * Get today's date at 00:00:00
   * @returns {Date} Today at midnight
   */
  static getStartOfDay(date = new Date()) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Get the end of day (23:59:59.999)
   * @returns {Date} End of day
   */
  static getEndOfDay(date = new Date()) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  /**
   * Convert 12-hour format to 24-hour format
   * @param {string} time12h - Time in 12-hour format (e.g. "2:30 PM")
   * @returns {string} Time in 24-hour format (e.g. "14:30")
   */
  static convert12hTo24h(time12h) {
    if (!time12h) return '';

    const [timePart, modifier] = time12h.split(' ');
    let [hours, minutes] = timePart.split(':');

    hours = parseInt(hours, 10);

    if (hours === 12) {
      hours = modifier === 'PM' ? 12 : 0;
    } else if (modifier === 'PM') {
      hours += 12;
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  }

  /**
   * Convert 24-hour format to 12-hour format
   * @param {string} time24h - Time in 24-hour format (e.g. "14:30")
   * @returns {string} Time in 12-hour format (e.g. "2:30 PM")
   */
  static convert24hTo12h(time24h) {
    if (!time24h) return '';

    const [hours, minutes] = time24h.split(':');
    const h = parseInt(hours, 10);

    return `${h % 12 || 12}:${minutes} ${h < 12 ? 'AM' : 'PM'}`;
  }

  /**
   * Create a date range for filtering data
   * @param {string} range - Range identifier ('today', 'week', 'month', etc.)
   * @returns {Object} Object with start and end dates
   */
  static getDateRange(range) {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const ranges = {
      today: {
        start: today,
        end: new Date(now)
      },
      yesterday: {
        start: new Date(today.getTime() - 86400000),
        end: new Date(today.getTime() - 1)
      },
      week: {
        start: new Date(today.getTime() - 6 * 86400000),
        end: new Date(now)
      },
      month: {
        start: new Date(today.getFullYear(), today.getMonth(), 1),
        end: new Date(now)
      }
    };

    return ranges[range] || { start: today, end: now };
  }
}

export default TimeManager;