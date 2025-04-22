import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import moment from 'moment';
import './BaseTimeSeriesVisualization.css';

/**
 * Base component for time series visualizations
 * Can be extended for blood sugar, insulin, and combined visualizations
 */
const BaseTimeSeriesVisualization = ({
  data = [],
  dateRange,
  setDateRange,
  loading = false,
  error = '',
  showTable = true,
  yAxisConfig = [],
  referenceLines = [],
  renderLines = () => {},
  renderTooltip = () => {},
  renderTable = () => {},
  renderLegend = () => {},
  onFetchData = () => {},
  title = 'Time Series Data'
}) => {
  // State for view management
  const [activeView, setActiveView] = useState('chart');
  const [userTimeZone, setUserTimeZone] = useState('');
  const [timeScale, setTimeScale] = useState({
    start: moment().subtract(7, 'days').valueOf(),
    end: moment().valueOf(),
    tickInterval: 12, // in hours
    tickFormat: 'DD/MM HH:mm'
  });
  
  // Get user's time zone on component mount
  useEffect(() => {
    setUserTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  // Update time scale when date range changes
  useEffect(() => {
    if (!dateRange) return;
    
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
    if (!timeScale) return [];
    
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

  // Handle date range changes
  const handleDateChange = (e) => {
    const { name, value } = e.target;
    setDateRange(prev => ({ ...prev, [name]: value }));
  };

  // Quick date range presets
  const applyDatePreset = (days) => {
    const start = moment().subtract(days, 'days').format('YYYY-MM-DD');
    let end;
    
    if (days === 1) {
      end = moment().add(12, 'hours').format('YYYY-MM-DD HH:mm');
    } else if (days === 7) {
      end = moment().add(1, 'day').format('YYYY-MM-DD');
    } else if (days === 30) {
      end = moment().add(4, 'days').format('YYYY-MM-DD');
    } else {
      end = moment().format('YYYY-MM-DD');
    }

    setDateRange({ start, end });
  };

  // Format X-axis timestamps
  const formatXAxis = (tickItem) => {
    return moment(tickItem).format(timeScale.tickFormat);
  };

  // Determine if current time is within chart range
  const currentTime = moment().valueOf();
  const currentTimeInRange = currentTime >= timeScale.start && currentTime <= timeScale.end;
  
  // Generate ticks for the chart
  const ticks = generateTicks();

  return (
    <div className="base-visualization">
      <h2 className="title">{title}</h2>

      {/* Timezone info display */}
      <div className="timezone-info">
        Your timezone: {userTimeZone}
        <span className="timezone-note"> (all times displayed in your local timezone)</span>
      </div>

      <div className="view-toggle">
        <button
          className={`toggle-btn ${activeView === 'chart' ? 'active' : ''}`}
          onClick={() => setActiveView('chart')}
        >
          Chart View
        </button>
        {showTable && (
          <button
            className={`toggle-btn ${activeView === 'table' ? 'active' : ''}`}
            onClick={() => setActiveView('table')}
          >
            Table View
          </button>
        )}
      </div>

      <div className="controls">
        <div className="date-controls">
          <div className="date-input-group">
            <label htmlFor="start-date">From:</label>
            <input
              id="start-date"
              type="date"
              name="start"
              value={dateRange?.start || ''}
              onChange={handleDateChange}
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="end-date">To:</label>
            <input
              id="end-date"
              type="date"
              name="end"
              value={dateRange?.end || ''}
              onChange={handleDateChange}
            />
          </div>
        </div>

        <div className="quick-ranges">
          <button onClick={() => applyDatePreset(1)}>Last 24h</button>
          <button onClick={() => applyDatePreset(7)}>Last Week</button>
          <button onClick={() => applyDatePreset(30)}>Last Month</button>
        </div>

        <button className="update-btn" onClick={onFetchData}>Update Data</button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading">Loading data...</div>
      ) : (
        <div className="content-container">
          {activeView === 'chart' && (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart
                  margin={{ top: 20, right: 40, bottom: 30, left: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    dataKey="timestamp"
                    name="Time"
                    domain={[timeScale.start, timeScale.end]}
                    ticks={ticks}
                    tickFormatter={formatXAxis}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    scale="time"
                    interval={0}
                  />
                  
                  {/* Render Y-axes based on config */}
                  {yAxisConfig.map((config, index) => (
                    <YAxis 
                      key={`y-axis-${index}`}
                      yAxisId={config.id}
                      label={config.label}
                      orientation={config.orientation || 'left'}
                      domain={config.domain || ['auto', 'auto']}
                      tickFormatter={config.formatter}
                    />
                  ))}
                  
                  {/* Render custom tooltip */}
                  <Tooltip content={renderTooltip} />
                  
                  <Legend />

                  {/* Render reference lines */}
                  {referenceLines.map((line, index) => (
                    <ReferenceLine
                      key={`ref-line-${index}`}
                      {...line}
                    />
                  ))}

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

                  {/* Render data lines/areas/bars */}
                  {renderLines(data)}
                </LineChart>
              </ResponsiveContainer>

              {/* Custom legend content */}
              {renderLegend()}
            </div>
          )}

          {activeView === 'table' && showTable && (
            <div className="table-container">
              {renderTable(data)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BaseTimeSeriesVisualization;