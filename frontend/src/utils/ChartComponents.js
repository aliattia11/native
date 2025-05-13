/**
 * ChartComponents.js
 * 
 * Reusable chart components for the MealVisualization system, including
 * tooltips, custom dots, and other UI elements.
 */
import React from 'react';

/**
 * Custom tooltip component for meal and insulin visualization
 */
export const CustomMealTooltip = ({ active, payload, label, targetGlucose }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const now = new Date().getTime();
    const isHistorical = data.timestamp < now;

    // Validate all critical data values
    const bloodSugar = isHistorical
      ? (!isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A')
      : (!isNaN(data.bloodSugar) ? Math.round(data.bloodSugar) : 'N/A');

    const estimatedBS = !isNaN(data.estimatedBloodSugar) ? Math.round(data.estimatedBloodSugar) : 'N/A';
    const bloodSugarWithEffect = !isNaN(data.bloodSugarWithMealEffect) ?
      Math.round(data.bloodSugarWithMealEffect) : bloodSugar;
    const targetWithEffect = !isNaN(data.targetWithMealEffect) ?
      Math.round(data.targetWithMealEffect) : 'N/A';

    const mealImpact = data.mealImpactMgdL ||
      (data.totalMealEffect && !isNaN(data.totalMealEffect) ?
        parseFloat((data.totalMealEffect * 1.0).toFixed(1)) : 0);
        
    // Calculate insulin impact if available
    const insulinImpact = data.insulinImpactMgdL ||
      (data.totalInsulinEffect && !isNaN(data.totalInsulinEffect) ?
        parseFloat((data.totalInsulinEffect * 50).toFixed(1)) : 0); // 50 mg/dL per unit
        
    // Calculate net impact if both meal and insulin effects are present
    const hasNetEffect = data.totalMealEffect > 0 && data.totalInsulinEffect > 0;
    const netEffect = hasNetEffect ? 
      Math.round(mealImpact - insulinImpact) : null;

    return (
      <div className="meal-effect-tooltip">
        <p className="tooltip-time">{data.formattedTime}</p>

        {/* Show meal effect information if present */}
        {data.totalMealEffect > 0 && (
          <div className="tooltip-section tooltip-meal-section">
            <h4>Meal Impact:</h4>
            <p className="tooltip-meal-impact">
              Raw effect: <strong>+{mealImpact.toFixed(1)} mg/dL</strong>
            </p>
          </div>
        )}
        
        {/* Show insulin effect information if present */}
        {data.totalInsulinEffect > 0 && (
          <div className="tooltip-section tooltip-insulin-section">
            <h4>Insulin Impact:</h4>
            <p className="tooltip-insulin-impact">
              Active insulin: <strong>{data.totalInsulinEffect.toFixed(2)} units</strong>
              <br />
              Expected BG impact: <strong>-{Math.round(insulinImpact)} mg/dL</strong>
            </p>
            {data.insulinDetails && data.insulinDetails.length > 0 && (
              <div className="insulin-details">
                <p><strong>Active doses:</strong></p>
                {data.insulinDetails.map((dose, i) => (
                  <p key={i} className="insulin-dose">
                    {dose.dose} units {dose.type.replace(/_/g, ' ')}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        
        {/* Show net effect if both meal and insulin effects are present */}
        {hasNetEffect && (
          <div className="tooltip-section tooltip-net-section">
            <h4>Net Effect:</h4>
            <p className={`tooltip-net-impact ${netEffect >= 0 ? 'positive' : 'negative'}`}>
              <strong>{netEffect >= 0 ? '+' : ''}{netEffect} mg/dL</strong>
            </p>
          </div>
        )}

        {/* Indicate if showing historical or future data */}
        <p className="tooltip-data-type">
          {isHistorical ?
            <em>Showing historical data {!data.isActualReading && "(baseline estimate)"}</em> :
            <em>Showing future projection with meal effects</em>}
        </p>

        {/* Blood glucose information */}
        <div className="tooltip-section">
          <h4>Blood Glucose:</h4>
          {data.isActualReading ? (
            <p>Measured: <strong>{bloodSugar} mg/dL</strong></p>
          ) : (
            <>
              <p>Baseline estimate: {estimatedBS} mg/dL</p>
              {data.totalMealEffect > 0 && (
                <p className="tooltip-projected">
                  With meal effect: <strong>{isHistorical ? bloodSugarWithEffect : bloodSugar} mg/dL</strong>
                </p>
              )}
              {data.totalInsulinEffect > 0 && data.predictedBloodSugar && (
                <p className="tooltip-predicted">
                  Predicted with insulin: <strong>{Math.round(data.predictedBloodSugar)} mg/dL</strong>
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
            <h4>Target Impact:</h4>
            <p>Target glucose: {targetGlucose} mg/dL</p>
            <p className="tooltip-target-impact">
              With same meal: <strong>{targetWithEffect} mg/dL</strong>
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
      </div>
    );
  }
  return null;
};

/**
 * Custom dot for blood sugar readings on chart
 */
export const CustomBloodSugarDot = (props) => {
  const { cx, cy, payload, index, targetGlucose } = props;

  // Only render dots for actual readings
  if (!payload || !payload.isActualReading || !cx || !cy) return null;

  // Determine dot properties based on reading type and relation to target
  const target = targetGlucose || 100;
  const targetDiff = payload.bloodSugar - target;
  const radius = 4;
  const strokeWidth = 2;

  // Base color on relationship to target
  let strokeColor;
  if (targetDiff > target * 0.3) {
    strokeColor = '#ff4444'; // High
  } else if (targetDiff < -target * 0.3) {
    strokeColor = '#ff8800'; // Low
  } else {
    strokeColor = '#8031A7'; // Normal
  }

  let fillColor = "#ffffff"; // White fill for all actual readings

  return (
    <circle
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
 * Custom dot for insulin doses on chart
 */
export const CustomInsulinDot = (props) => {
  const { cx, cy, payload, index } = props;
  
  // Only render dots for insulin doses
  if (!payload || !payload.totalInsulinEffect || !cx || !cy) return null;
  
  // Make sure we're looking at the negative Y value (insulin is shown at bottom)
  const actualCy = cy < 0 ? -cy : cy;
  
  return (
    <polygon
      points={`${cx},${actualCy} ${cx-4},${actualCy+6} ${cx+4},${actualCy+6}`}
      fill="#0088FE"
      stroke="#0088FE"
      strokeWidth={1}
    />
  );
};