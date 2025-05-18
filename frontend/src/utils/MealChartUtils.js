import React from 'react';
import { formatInsulinName } from '../utils/insulinUtils';
import { FaInfoCircle } from 'react-icons/fa';

/**
 * Enhanced tooltip component for the meal effect chart
 * Displays detailed information about meals, insulin, and blood glucose at a specific time point
 */
export const EnhancedTooltip = ({
  active,
  payload,
  label,
  stickyData,
  position,
  isSticky,
  onClose,
  patientConstants,
  targetGlucose
}) => {
  // Use either sticky data or regular tooltip data
  const data = isSticky ? stickyData : (active && payload && payload.length ? payload[0].payload : null);

  if (!data) return null;

  const now = new Date().getTime();
  const isHistorical = data.timestamp < now;

  // Calculate all the values for display
  const bloodSugar = isHistorical
    ? (!isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A')
    : (!isNaN(data.bloodSugar) ? Math.round(data.bloodSugar) : 'N/A');

  const estimatedBS = !isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A';
  const bloodSugarWithEffect = !isNaN(data.bloodSugarWithMealEffect) ?
    Math.round(data.bloodSugarWithMealEffect) : bloodSugar;
  const targetWithEffect = !isNaN(data.targetWithMealEffect) ?
    Math.round(data.targetWithMealEffect) : 'N/A';
  const expectedWithNetEffect = !isNaN(data.expectedBloodSugarWithNetEffect) ?
    Math.round(data.expectedBloodSugarWithNetEffect) : bloodSugar;

  const mealImpact = data.mealImpactMgdL ||
    (data.totalMealEffect && !isNaN(data.totalMealEffect) ?
      parseFloat((data.totalMealEffect * (patientConstants?.carb_to_bg_factor || 4.0)).toFixed(1)) : 0);

  const insulinDose = data.insulinDose ||
    (data.insulinDoses && Object.values(data.insulinDoses).reduce((sum, dose) => sum + dose, 0)) || 0;
  const activeInsulin = Math.abs(data.activeInsulin) || 0;
  const insulinImpact = Math.abs(data.insulinImpactMgdL) || 0;
  const netEffect = data.netEffectMgdL || 0;

  // Calculate position styles for sticky tooltip
  const style = isSticky ? {
    position: 'absolute',
    left: position.left + 'px',
    top: position.top + 'px',
    transform: 'translate(-50%, -100%)', // Position above the point
    opacity: 1
  } : {};

  return (
    <div
      className={`meal-effect-tooltip ${isSticky ? 'sticky' : ''}`}
      style={style}
    >
      {isSticky && (
        <button className="tooltip-close-btn" onClick={onClose}>
          ✕
        </button>
      )}

      <p className="tooltip-time">{data.formattedTime}</p>

      {/* Show insulin information if present */}
      {insulinDose > 0 && (
        <div className="tooltip-section tooltip-insulin-section">
          <h4>Insulin:</h4>
          <p className="tooltip-insulin-dose">
            Dose: <strong>{insulinDose.toFixed(1)} units</strong>
          </p>
          {activeInsulin > 0 && (
            <p className="tooltip-active-insulin">
              Active: <strong>{activeInsulin.toFixed(2)} units</strong>
            </p>
          )}
          {insulinImpact < 0 && (
            <p className="tooltip-insulin-impact">
              Impact: <strong>{insulinImpact.toFixed(1)} mg/dL</strong>
            </p>
          )}
        </div>
      )}

      {/* Show meal effect information if present */}
      {data.totalMealEffect > 0 && (
        <div className="tooltip-section tooltip-meal-section">
          <h4>Meal Impact:</h4>
          <p className="tooltip-meal-impact">
            Effect: <strong>+{mealImpact.toFixed(1)} mg/dL</strong>
          </p>
        </div>
      )}

      {/* Show net effect if both insulin and meal effects are present */}
      {(insulinImpact < 0 || mealImpact > 0) && (
        <div className="tooltip-section tooltip-net-section">
          <h4>Net Effect:</h4>
          <p className="tooltip-net-impact">
            Combined: <strong>{netEffect > 0 ? '+' : ''}{netEffect.toFixed(1)} mg/dL</strong>
          </p>
          {!isHistorical && (
            <p className="tooltip-projected">
              Projected BG: <strong>{expectedWithNetEffect} mg/dL</strong>
            </p>
          )}
        </div>
      )}

      {/* Meal nutritional details section - FIXED FOR BOTH OBJECT AND NUMBER FORMATS */}
      {data.meals && data.meals.length > 0 && (
        <div className="tooltip-section tooltip-meal-details">
          <h4>Meal Details:</h4>
          {data.meals.map((meal, idx) => (
            <div key={idx} className="tooltip-meal">
              <p className="tooltip-meal-type">{meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}</p>
              <table className="tooltip-meal-table">
                <tbody>
                  <tr>
                    <td>Carbs:</td>
                    <td><strong>{meal.carbs.toFixed(1)}g</strong></td>
                  </tr>
                  <tr>
                    <td>Protein equiv:</td>
                    <td><strong>{(meal.protein * (patientConstants?.protein_factor || 0.5)).toFixed(1)}g</strong></td>
                  </tr>
                  <tr>
                    <td>Fat equiv:</td>
                    <td><strong>{(meal.fat * (patientConstants?.fat_factor || 0.2)).toFixed(1)}g</strong></td>
                  </tr>
                  <tr className="total-row">
                    <td>Total equiv:</td>
                    <td><strong>
                      {(typeof meal.totalCarbEquiv === 'object' ?
                        meal.totalCarbEquiv.totalCarbEquiv :
                        meal.totalCarbEquiv).toFixed(1)}g
                    </strong></td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* Rest of the component remains the same */}
      {/* Indicate if showing historical or future data */}
      <p className="tooltip-data-type">
        {isHistorical ?
          <em>Showing historical data {!data.isActualReading && "(baseline estimate)"}</em> :
          <em>Showing future projection with combined effects</em>}
      </p>

      {/* Blood glucose information */}
      <div className="tooltip-section">
        <h4>Blood Glucose:</h4>
        {data.isActualReading ? (
          <p>Measured: <strong>{bloodSugar} mg/dL</strong></p>
        ) : (
          <>
            <p>Baseline estimate: {estimatedBS} mg/dL</p>
            {/* Only show meal effect for future data, not historical */}
            {(data.totalMealEffect > 0 || insulinImpact < 0) && !isHistorical && (
              <p className="tooltip-projected">
                With all effects: <strong>{bloodSugar} mg/dL</strong>
              </p>
            )}
          </>
        )}
        {data.status && (
          <p className="status" style={{ color: data.status.color }}>
            Status: {data.status.label}
          </p>
        )}
      </div>

      {/* Target glucose information (second visualization) */}
      {data.totalMealEffect > 0 && (
        <div className="tooltip-section tooltip-target-section">
          <h4>Default Impact:</h4>
          <p>Target glucose: {targetGlucose} mg/dL</p>
          <p className="tooltip-target-impact">
            With meal effect: <strong>{targetWithEffect} mg/dL</strong>
            <span className="tooltip-percent">
              ({Math.round((targetWithEffect/targetGlucose)*100)}% of target)
            </span>
          </p>

          {/* Target status classification */}
          {targetWithEffect > targetGlucose * 1.3 ? (
            <p className="tooltip-status high">HIGH</p>
          ) : targetWithEffect < targetGlucose * 0.7 ? (
            <p className="tooltip-status low">LOW</p>
          ) : (
            <p className="tooltip-status normal">IN RANGE</p>
          )}
        </div>
      )}

      {/* Meal effects details */}
      {data.mealEffects && Object.keys(data.mealEffects).length > 0 && (
        <div className="tooltip-section">
          <h4>Active Meal Effects:</h4>
          {Object.entries(data.mealEffects).map(([mealId, effect], idx) => (
            <p key={idx} className="tooltip-meal-effect">
              Meal {idx+1}: Impact {!isNaN(effect) ? effect.toFixed(1) : '0'} units
            </p>
          ))}
          <p className="tooltip-total-effect">
            Total effect: {!isNaN(data.totalMealEffect) ? data.totalMealEffect.toFixed(1) : '0'} units
          </p>
        </div>
      )}

      {/* Insulin contributions details */}
      {data.insulinContributions && data.insulinContributions.length > 0 && (
        <div className="tooltip-section">
          <h4>Active Insulin Doses:</h4>
          {data.insulinContributions.map((contrib, idx) => (
            <p key={idx} className="tooltip-insulin-contribution">
              {formatInsulinName(contrib.insulinType)}: {contrib.activeUnits.toFixed(2)} units
              ({Math.round(contrib.activityPercent)}% active)
            </p>
          ))}
        </div>
      )}
    </div>
  );
};


/**
 * Custom dot renderer for blood sugar readings on chart
 */
export const CustomBloodSugarDot = (props, targetGlucose = 100) => {
  const { cx, cy, payload, index } = props;

  // Only render dots for actual readings
  if (!payload || !payload.isActualReading || !cx || !cy) return null;

  // Determine dot properties based on reading type and relation to target
  const targetDiff = payload.bloodSugar - targetGlucose;
  const radius = 4;
  const strokeWidth = 2;

  // Base color on relationship to target
  let strokeColor;
  if (targetDiff > targetGlucose * 0.3) {
    strokeColor = '#ff4444'; // High
  } else if (targetDiff < -targetGlucose * 0.3) {
    strokeColor = '#ff8800'; // Low
  } else {
    strokeColor = '#8031A7'; // Normal
  }

  let fillColor = "#ffffff"; // White fill for all actual readings

  // Add key prop to solve React warning
  return (
    <circle
      key={`dot-${index}-${payload.timestamp || Date.now()}`}
      cx={cx}
      cy={cy}
      r={radius}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
      fill={fillColor}
    />
  );
};

/**
 * Custom dot renderer for insulin doses on chart
 */
export const CustomInsulinDot = (props) => {
  const { cx, cy, payload, index } = props;

  // Only render for points with insulin doses
  if (!payload || !payload.insulinDose || payload.insulinDose <= 0 || !cx || !cy) return null;

  const radius = 5;
  const strokeColor = '#4a90e2'; // Blue for insulin
  const fillColor = '#ffffff'; // White fill

  // Add key prop to solve React warning
  return (
    <svg
      key={`insulin-dot-${index}-${payload.timestamp || Date.now()}`}
      x={cx - radius}
      y={cy - radius}
      width={radius * 2}
      height={radius * 2}
    >
      {/* Diamond shape for insulin */}
      <polygon
        points={`${radius},0 ${radius*2},${radius} ${radius},${radius*2} 0,${radius}`}
        stroke={strokeColor}
        strokeWidth={1.5}
        fill={fillColor}
      />
    </svg>
  );
};

/**
 * Format legend text to clean up labels
 */
export const formatLegendText = (value) => {
  // Format specific data series properly
  if (value === 'bloodSugar') {
    return 'Blood Sugar (with effects, future)';
  } else if (value === 'estimatedBloodSugar') {
    return 'Baseline Blood Sugar (historical)';
  } else if (value === 'targetWithMealEffect') {
    return 'Default + Meal Effect';
  } else if (value === 'totalMealEffect') {
    return 'Meal Effect';
  } else if (value === 'activeInsulin') {
    return 'Active Insulin';
  } else if (value === 'insulinDose') {
    return 'Insulin Doses';
  } else if (value === 'insulinImpact') {
    return 'Insulin Impact';
  } else if (value === 'expectedBloodSugarWithNetEffect') {
    return 'Net Effect (Meals + Insulin)';
  }

  // Handle meal-related entries
  if (value.includes('mealCarbs.')) {
    return 'Meal Carbs';  // All meal carbs now have the same legend label
  } else if (value.includes('mealEffect.')) {
    return 'Meal Effect';
  } else if (value.includes('insulinDoses.')) {
    return 'Insulin Dose';
  }

  return value;
};

/**
 * Information panel about meal and insulin effects
 */
export const InfoPanel = ({ showFactorInfo, setShowFactorInfo, patientConstants }) => (
  <div className="carb-equivalent-info">
    <button
      className="info-button"
      onClick={() => setShowFactorInfo(!showFactorInfo)}
    >
      <FaInfoCircle /> About Meal & Insulin Effects
    </button>

    {showFactorInfo && (
      <div className="info-panel">
        <h4>Meal & Insulin Effect Visualization Explained</h4>
        <p>
          This chart shows how your meals and insulin doses impact blood glucose over time:
        </p>
        <ul>
          <li><strong>Blue bars:</strong> Represent meal carbohydrate content</li>
          <li><strong>Green area:</strong> Shows the meal's projected effect on blood glucose</li>
          <li><strong>Purple line:</strong> Blood glucose values (actual readings shown as dots)</li>
          <li><strong>Blue area:</strong> Active insulin amount over time</li>
          <li><strong>Dashed line:</strong> Net effect combining meals and insulin</li>
        </ul>
        <p>
          Meal effects are calculated based on carbohydrates, protein, fat, and absorption type.
          Protein and fat are converted to "carbohydrate equivalents" using your personalized factors:
        </p>
        <ul>
          <li><strong>Protein:</strong> 1g protein = {patientConstants?.protein_factor || 0.5}g carbohydrate equivalent</li>
          <li><strong>Fat:</strong> 1g fat = {patientConstants?.fat_factor || 0.2}g carbohydrate equivalent</li>
        </ul>
        <p>
          Insulin effects are calculated based on your insulin's pharmacokinetic profile:
        </p>
        <ul>
          <li><strong>Onset:</strong> When insulin begins to work</li>
          <li><strong>Peak:</strong> When insulin is most active</li>
          <li><strong>Duration:</strong> How long insulin continues to have an effect</li>
        </ul>
        <button
          className="close-button"
          onClick={() => setShowFactorInfo(false)}
        >
          Close
        </button>
      </div>
    )}
  </div>
);

/**
 * Return a consistent color for meal bars
 */
export const getMealColor = () => '#4287f5'; // A nice blue color

/**
 * Return a consistent color for insulin elements
 */
export const getInsulinColor = () => '#4a90e2'; // A nice blue color for insulin