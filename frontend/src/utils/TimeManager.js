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

  // This method is now redundant with utcToLocalString but kept for compatibility
  static utcToLocalIsoString(utcIsoString) {
    return this.utcToLocalString(utcIsoString);
  }
}

export default TimeManager;