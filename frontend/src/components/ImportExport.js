import React, { useState, useRef } from 'react';
import axios from 'axios';
import { FaFileImport, FaFileExport, FaFileAlt, FaInfoCircle, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import TimeManager from '../utils/TimeManager';
import styles from './ImportExport.module.css';

const ImportExport = () => {
  const [importType, setImportType] = useState('all');
  const [exportType, setExportType] = useState('all');
  const [importStatus, setImportStatus] = useState(null);
  const [exportFormat, setExportFormat] = useState('json');
  const [importValidation, setImportValidation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 30 days
    end: new Date().toISOString().split('T')[0]
  });

  const fileInputRef = useRef(null);

  const handleImportTypeChange = (e) => {
    setImportType(e.target.value);
  };

  const handleExportTypeChange = (e) => {
    setExportType(e.target.value);
  };

  const handleExportFormatChange = (e) => {
    setExportFormat(e.target.value);
  };

  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  const validateImportFile = async (file) => {
    try {
      setIsLoading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', importType);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const response = await axios.post(
        'http://localhost:5000/api/import/validate',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setImportValidation(response.data);
      return response.data.valid;

    } catch (error) {
      console.error('Error validating import file:', error);
      setImportValidation({
        valid: false,
        errors: [error.response?.data?.error || error.message || 'Error validating file']
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportStatus({ type: 'info', message: 'Validating file...' });

    // Validate the file first
    const isValid = await validateImportFile(file);

    if (isValid) {
      setImportStatus({ type: 'info', message: 'File is valid. Importing data...' });

      try {
        setIsLoading(true);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', importType);

        const token = localStorage.getItem('token');
        if (!token) {
          throw new Error('Authentication token not found');
        }

        const response = await axios.post(
          'http://localhost:5000/api/import',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          }
        );

        const results = response.data.results;
        const totalImported = (
          (results.blood_sugar_imported || 0) +
          (results.meals_imported || 0) +
          (results.activities_imported || 0) +
          (results.insulin_imported || 0)
        );

        setImportStatus({
          type: 'success',
          message: `Successfully imported ${totalImported} records!`,
          details: `
            Blood Sugar Readings: ${results.blood_sugar_imported || 0}
            Meals: ${results.meals_imported || 0}
            Activities: ${results.activities_imported || 0}
            Insulin Doses: ${results.insulin_imported || 0}
          `
        });

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }

      } catch (error) {
        console.error('Error importing data:', error);
        setImportStatus({
          type: 'error',
          message: 'Failed to import data',
          details: error.response?.data?.error || error.message || 'Unknown error occurred'
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      setImportStatus({
        type: 'error',
        message: 'Validation failed, please fix the issues before importing',
        details: importValidation?.errors?.join('\n') || 'Unknown validation error'
      });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsLoading(true);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Request the template file
      const response = await axios.get(
        `http://localhost:5000/api/import/export-template?format=${exportFormat}&type=${importType}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          responseType: 'blob'  // Important for file download
        }
      );

      // Create a download link and trigger the download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      // Set filename from Content-Disposition header if possible
      const contentDisposition = response.headers['content-disposition'];
      let filename = `diabetes_import_template_${importType}.${exportFormat}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setImportStatus({
        type: 'success',
        message: 'Template downloaded successfully'
      });

    } catch (error) {
      console.error('Error downloading template:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to download template',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    try {
      setIsLoading(true);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      // Format dates for the API
      const startDateUtc = new Date(dateRange.start).toISOString();
      const endDateUtc = new Date(dateRange.end + 'T23:59:59').toISOString();

      // Request the data export
      const response = await axios.get(
        `http://localhost:5000/api/import/download-data?format=${exportFormat}&type=${exportType}&start_date=${startDateUtc}&end_date=${endDateUtc}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          },
          responseType: 'blob'  // Important for file download
        }
      );

      // Create a download link and trigger the download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;

      // Set filename from Content-Disposition header if possible
      const contentDisposition = response.headers['content-disposition'];
      let filename = `diabetes_data_${exportType}_${TimeManager.formatDate(new Date(), 'YYYYMMDD')}.${exportFormat}`;

      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename=(.+)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setImportStatus({
        type: 'success',
        message: 'Data exported successfully'
      });

    } catch (error) {
      console.error('Error exporting data:', error);
      setImportStatus({
        type: 'error',
        message: 'Failed to export data',
        details: error.response?.data?.error || error.message || 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Import & Export Data</h2>

      <div className={styles.grid}>
        {/* Import Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <FaFileImport className={styles.icon} />
            <h3>Import Data</h3>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="importType">Data Type:</label>
            <select
              id="importType"
              value={importType}
              onChange={handleImportTypeChange}
              disabled={isLoading}
            >
              <option value="all">All Data Types</option>
              <option value="blood_sugar">Blood Sugar Readings</option>
              <option value="meals">Meals</option>
              <option value="activities">Activities</option>
              <option value="insulin">Insulin Doses</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="importFile">Upload File:</label>
            <div className={styles.fileInputWrapper}>
              <input
                type="file"
                id="importFile"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".csv,.json"
                disabled={isLoading}
              />
              <div className={styles.fileFormats}>
                <small>Accepts CSV and JSON formats</small>
              </div>
            </div>
          </div>

          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isLoading}
              className={styles.templateButton}
            >
              <FaFileAlt className={styles.buttonIcon} />
              Download Import Template
            </button>
          </div>

          {importValidation && (
            <div className={styles.validationResults}>
              <h4>Validation Results:</h4>

              {importValidation.valid ? (
                <div className={styles.validTrue}>
                  <FaCheckCircle className={styles.validIcon} />
                  <span>File is valid and ready for import</span>
                </div>
              ) : (
                <div className={styles.validFalse}>
                  <FaTimesCircle className={styles.invalidIcon} />
                  <span>File validation failed</span>
                </div>
              )}

              {/* Display record counts */}
              {importValidation.total_records && (
                <div className={styles.counts}>
                  <p>Total Records: {importValidation.total_records}</p>
                  {importValidation.blood_sugar_records > 0 && (
                    <p>Blood Sugar Records: {importValidation.blood_sugar_records}</p>
                  )}
                  {importValidation.meal_records > 0 && (
                    <p>Meal Records: {importValidation.meal_records}</p>
                  )}
                  {importValidation.activity_records > 0 && (
                    <p>Activity Records: {importValidation.activity_records}</p>
                  )}
                  {importValidation.insulin_records > 0 && (
                    <p>Insulin Records: {importValidation.insulin_records}</p>
                  )}
                </div>
              )}

              {/* Display errors */}
              {importValidation.errors && importValidation.errors.length > 0 && (
                <div className={styles.errorList}>
                  <h5>Errors:</h5>
                  <ul>
                    {importValidation.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Display warnings */}
              {importValidation.warnings && importValidation.warnings.length > 0 && (
                <div className={styles.warningList}>
                  <h5>Warnings:</h5>
                  <ul>
                    {importValidation.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <FaFileExport className={styles.icon} />
            <h3>Export Data</h3>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="exportType">Data Type:</label>
            <select
              id="exportType"
              value={exportType}
              onChange={handleExportTypeChange}
              disabled={isLoading}
            >
              <option value="all">All Data Types</option>
              <option value="blood_sugar">Blood Sugar Readings</option>
              <option value="meals">Meals</option>
              <option value="activities">Activities</option>
              <option value="insulin">Insulin Doses</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="exportFormat">Format:</label>
            <select
              id="exportFormat"
              value={exportFormat}
              onChange={handleExportFormatChange}
              disabled={isLoading}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="startDate">Date Range:</label>
            <div className={styles.dateRangeInputs}>
              <input
                type="date"
                id="startDate"
                name="start"
                value={dateRange.start}
                onChange={handleDateChange}
                disabled={isLoading}
              />
              <span>to</span>
              <input
                type="date"
                id="endDate"
                name="end"
                value={dateRange.end}
                onChange={handleDateChange}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <button
              type="button"
              onClick={handleExportData}
              disabled={isLoading}
              className={styles.exportButton}
            >
              <FaFileExport className={styles.buttonIcon} />
              Export Data
            </button>
          </div>

          <div className={styles.info}>
            <FaInfoCircle className={styles.infoIcon} />
            <p>
              Exported data will contain readings from <strong>{dateRange.start}</strong> to <strong>{dateRange.end}</strong>.
              All times are stored in UTC but displayed in your local timezone.
            </p>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {importStatus && (
        <div className={`${styles.statusMessage} ${styles[importStatus.type]}`}>
          <h4>{importStatus.message}</h4>
          {importStatus.details && (
            <pre className={styles.details}>{importStatus.details}</pre>
          )}
        </div>
      )}

      <div className={styles.loadingOverlay} style={{ display: isLoading ? 'flex' : 'none' }}>
        <div className={styles.spinner}></div>
        <p>Processing...</p>
      </div>
    </div>
  );
};

export default ImportExport;