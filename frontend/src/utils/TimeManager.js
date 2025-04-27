/**
 * TimeManager - Utility for standardized time handling across the application
 */
class TimeManager {
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
   * Convert local datetime to UTC ISO string for API communication
   * @param {string} localDateTimeString - Local datetime string (YYYY-MM-DDTHH:MM)
   * @returns {string} - Full UTC ISO string for sending to backend
   */
  static localToUTCISOString(localDateTimeString) {
    if (!localDateTimeString) return new Date().toISOString();

    // Create Date object from the local datetime string
    const localDate = new Date(localDateTimeString);
    // Convert to UTC ISO string
    return localDate.toISOString();
  }

  /**
   * Convert UTC ISO string from API to local datetime format for inputs
   * @param {string} utcIsoString - UTC ISO string from backend
   * @returns {string} - Local datetime string (YYYY-MM-DDTHH:MM)
   */
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

  /**
   * Convert duration string or number to hours
   * @param {string|number} duration - Duration in HH:MM format or hours as number
   * @returns {number} - Duration in hours
   */
  static durationToHours(duration) {
    if (typeof duration === 'number') return duration;

    if (typeof duration === 'string' && duration.includes(':')) {
      const [hours, minutes] = duration.split(':').map(num => parseInt(num, 10) || 0);
      return hours + (minutes / 60);
    }

    return parseFloat(duration) || 0;
  }

  /**
   * Convert hours to time string in HH:MM format
   * @param {number} hours - Duration in hours
   * @returns {string} - Time string in HH:MM format
   */
  static hoursToTimeString(hours) {
    if (hours === undefined || hours === null) return "00:00";

    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);

    return `${wholeHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate duration between two time points
   * @param {string|Date} startTime - Start time
   * @param {string|Date} endTime - End time
   * @returns {object} - Duration details including hours, minutes, totalHours and formatted string
   */
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
        formatted: `${hours}h ${minutes}m`,
        milliseconds: durationMs
      };
    } catch (error) {
      console.error("Error calculating duration:", error);
      return { hours: 0, minutes: 0, totalHours: 0, formatted: "0h 0m", milliseconds: 0 };
    }
  }

  /**
   * Format DateTime for display
   * @param {string} isoString - ISO date string
   * @returns {string} - Formatted date and time
   */
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

  /**
   * Get time point at a specific number of hours ago
   * @param {number} hoursAgo - Hours ago from current time
   * @returns {string} - ISO datetime string in local timezone
   */
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

  // This method is now redundant with utcToLocalString but kept for compatibility
  static utcToLocalIsoString(utcIsoString) {
    return this.utcToLocalString(utcIsoString);
  }

  /**
   * NEW: Generate time points for visualization between start and end time
   * @param {Date|string} startTime - Starting time
   * @param {Date|string} endTime - Ending time
   * @param {number} numPoints - Number of points to generate
   * @returns {Array} - Array of evenly spaced timestamps
   */
  static generateTimePoints(startTime, endTime, numPoints = 24) {
    try {
      const start = new Date(startTime).getTime();
      const end = new Date(endTime).getTime();

      if (isNaN(start) || isNaN(end)) {
        throw new Error("Invalid date format");
      }

      const interval = (end - start) / (numPoints - 1);
      const points = [];

      for (let i = 0; i < numPoints; i++) {
        const timestamp = start + (interval * i);
        points.push(new Date(timestamp));
      }

      return points;
    } catch (error) {
      console.error("Error generating time points:", error);
      return [];
    }
  }

  /**
   * NEW: Format date range for display in visualizations
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @returns {string} - Formatted date range string
   */
  static formatDateRange(startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Same day
      if (start.toDateString() === end.toDateString()) {
        return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      }

      // Different days
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    } catch (error) {
      console.error("Error formatting date range:", error);
      return "";
    }
  }

  /**
   * NEW: Get appropriate time scale for visualization based on duration
   * @param {Date|string} startTime - Starting time
   * @param {Date|string} endTime - Ending time
   * @returns {object} - Time scale configuration for visualization
   */
  static getVisualizationTimeScale(startTime, endTime) {
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);
      const durationHours = (end - start) / (1000 * 60 * 60);

      // Choose appropriate time format and interval
      if (durationHours <= 6) {
        return {
          interval: 'hour',
          format: 'HH:mm',
          stepSize: 1,
          displayFormat: 'hourly'
        };
      } else if (durationHours <= 48) {
        return {
          interval: 'hour',
          format: 'MM/DD HH:mm',
          stepSize: 4,
          displayFormat: '4-hourly'
        };
      } else if (durationHours <= 168) { // 1 week
        return {
          interval: 'day',
          format: 'MM/DD',
          stepSize: 1,
          displayFormat: 'daily'
        };
      } else {
        return {
          interval: 'day',
          format: 'MM/DD',
          stepSize: 3,
          displayFormat: 'every 3 days'
        };
      }
    } catch (error) {
      console.error("Error calculating visualization time scale:", error);
      return {
        interval: 'hour',
        format: 'MM/DD HH:mm',
        stepSize: 4,
        displayFormat: 'default'
      };
    }
  }

  /**
   * NEW: Format a datetime for consistent display across visualizations
   * @param {Date|string|number} dateTime - The datetime to format
   * @param {string} format - Format type: 'date', 'time', 'datetime', 'short'
   * @returns {string} - Formatted string
   */
  static formatForVisualization(dateTime, format = 'datetime') {
    if (!dateTime) return '';

    try {
      const date = new Date(dateTime);

      switch (format) {
        case 'date':
          return date.toLocaleDateString();
        case 'time':
          return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
        case 'short':
          return `${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        case 'datetime':
        default:
          return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
      }
    } catch (error) {
      console.error("Error formatting for visualization:", error);
      return String(dateTime);
    }
  }
}

export default TimeManager;