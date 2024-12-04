import axios from 'axios';
import { useState, useEffect } from 'react';

class MeasurementConverter {
    constructor(volumeMeasurements, weightMeasurements) {
        this.volumeBase = Object.entries(volumeMeasurements).reduce((acc, [key, value]) => {
            acc[key] = value.ml;
            return acc;
        }, {});

        this.weightBase = Object.entries(weightMeasurements).reduce((acc, [key, value]) => {
            if ('grams' in value) {
                acc[key] = value.grams;
            }
            return acc;
        }, {});
    }

    convertToStandard(amount, fromUnit) {
        if (fromUnit in this.volumeBase) {
            return amount * this.volumeBase[fromUnit];
        }
        if (fromUnit in this.weightBase) {
            return amount * this.weightBase[fromUnit];
        }
        return null;
    }

    convertBetweenUnits(amount, fromUnit, toUnit) {
        const baseAmount = this.convertToStandard(amount, fromUnit);
        if (baseAmount === null) return null;

        if (toUnit in this.volumeBase) {
            return baseAmount / this.volumeBase[toUnit];
        }
        if (toUnit in this.weightBase) {
            return baseAmount / this.weightBase[toUnit];
        }
        return null;
    }

    getMeasurementSystem(unit) {
        if (unit in this.volumeBase) return 'volume';
        if (unit in this.weightBase) return 'weight';
        return null;
    }
}

export class ConstantsManager {
    static SHARED_CONSTANTS = {
        MEASUREMENT_SYSTEMS: {
            VOLUME: 'volume',
            WEIGHT: 'weight'
        },

        VOLUME_MEASUREMENTS: {
            cup: { ml: 240, display_name: 'Cup' },
            half_cup: { ml: 120, display_name: '½ Cup' },
            quarter_cup: { ml: 60, display_name: '¼ Cup' },
            tablespoon: { ml: 15, display_name: 'Tablespoon' },
            teaspoon: { ml: 5, display_name: 'Teaspoon' },
            bowl: { ml: 400, display_name: 'Medium Bowl' },
            v_plate: { ml: 350, display_name: 'Full Plate (Volume)' },
            v_small_plate: { ml: 175, display_name: 'Small Plate (Volume)' },
            ml: { ml: 1, display_name: 'Milliliter' }
        },

        WEIGHT_MEASUREMENTS: {
            palm: { grams: 85, display_name: 'Palm-sized' },
            handful: { grams: 30, display_name: 'Handful' },
            fist: { grams: 150, display_name: 'Fist-sized' },
            w_plate: { grams: 300, display_name: 'Full Plate (Weight)' },
            w_small_plate: { grams: 150, display_name: 'Small Plate (Weight)' },
            g: { grams: 1, display_name: 'Grams' },
            kg: { grams: 1000, display_name: 'Kilograms' }
        },

        ACTIVITY_LEVELS: [
            { value: -2, label: 'Sleep', impact: -0.2, duration_weight: 0.7 },
            { value: -1, label: 'Very Low Activity', impact: -0.1, duration_weight: 0.8 },
            { value: 0, label: 'Normal Activity', impact: 0, duration_weight: 1.0 },
            { value: 1, label: 'High Activity', impact: 0.1, duration_weight: 1.2 },
            { value: 2, label: 'Vigorous Activity', impact: 0.2, duration_weight: 1.5 }
        ],

        MEAL_TYPES: [
            { value: 'breakfast', label: 'Breakfast' },
            { value: 'lunch', label: 'Lunch' },
            { value: 'dinner', label: 'Dinner' },
            { value: 'snack', label: 'Snack' }
        ],

        MEAL_TIMING_FACTORS: {
            breakfast: 1.2,
            lunch: 1.0,
            dinner: 0.9,
            snack: 1.0
        }
    };

    static DEFAULT_PATIENT_CONSTANTS = {
        insulin_to_carb_ratio: 10,
        correction_factor: 50,
        target_glucose: 100,
        protein_factor: 0.5,
        fat_factor: 0.2,
        activity_impact_threshold: 2, // Maximum hours to consider for full impact
        activity_decay_rate: 0.8, // Rate at which activity impact diminishes
        activity_coefficients: {
            '-2': 0.2,
            '-1': 0.1,
            '0': 0,
            '1': -0.1,
            '2': -0.2
        },
        absorption_modifiers: {
            very_slow: 0.6,
            slow: 0.8,
            medium: 1.0,
            fast: 1.2,
            very_fast: 1.4
        },
        insulin_timing_guidelines: {
            very_slow: { timing_minutes: 0, description: 'Take insulin at the start of meal' },
            slow: { timing_minutes: 5, description: 'Take insulin 5 minutes before meal' },
            medium: { timing_minutes: 10, description: 'Take insulin 10 minutes before meal' },
            fast: { timing_minutes: 15, description: 'Take insulin 15 minutes before meal' },
            very_fast: { timing_minutes: 20, description: 'Take insulin 20 minutes before meal' }
        }
    };

    constructor() {
        this.converter = new MeasurementConverter(
            ConstantsManager.SHARED_CONSTANTS.VOLUME_MEASUREMENTS,
            ConstantsManager.SHARED_CONSTANTS.WEIGHT_MEASUREMENTS
        );
    }

       calculateActivityImpact(activities) {
        if (!activities || activities.length === 0) return 0;

        const activityImpacts = activities.map(activity => {
            // Get the activity level details
            const activityLevel = ConstantsManager.SHARED_CONSTANTS.ACTIVITY_LEVELS.find(
                level => level.value === parseInt(activity.level)
            );
            if (!activityLevel) return 0;

            // Convert duration to hours if it's a string
            const duration = typeof activity.duration === 'string'
                ? this.parseDurationToHours(activity.duration)
                : activity.duration;

            // Calculate diminishing returns based on duration
            const thresholdHours = this.patientConstants?.activity_impact_threshold || 2;
            const decayRate = this.patientConstants?.activity_decay_rate || 0.8;

            // Apply diminishing returns formula
            const durationFactor = duration <= thresholdHours
                ? duration / thresholdHours
                : 1 + (Math.log(duration / thresholdHours) * decayRate);

            // Calculate weighted impact
            const baseImpact = activityLevel.impact * activityLevel.duration_weight;
            return baseImpact * durationFactor;
        });

        // Combine multiple activity impacts with diminishing returns
        return activityImpacts.reduce((total, impact) => {
            const combinedImpact = total + impact;
            // Prevent extreme impact values
            return Math.max(-0.5, Math.min(0.5, combinedImpact));
        }, 0);
    }
    parseDurationToHours(duration) {
        const [hours, minutes] = duration.split(':').map(Number);
        return hours + (minutes / 60);
    }

getMealTimingFactor(mealType, time = null) {
    const baseFactor = ConstantsManager.SHARED_CONSTANTS.MEAL_TIMING_FACTORS[mealType] || 1.0;

    if (!time) return baseFactor;



        return baseFactor;
    }
}

export const usePatientConstants = () => {
    const [constantsManager] = useState(() => new ConstantsManager());
    const [patientConstants, setPatientConstants] = useState(ConstantsManager.DEFAULT_PATIENT_CONSTANTS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchPatientConstants = async () => {
            try {
                const token = localStorage.getItem('token');
                const response = await axios.get('/api/patient/constants', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (response.data.constants) {
                    const newConstants = {
                        ...ConstantsManager.DEFAULT_PATIENT_CONSTANTS,
                        ...response.data.constants
                    };
                    setPatientConstants(newConstants);
                    constantsManager.patientConstants = newConstants;
                }
                setLoading(false);
            } catch (err) {
                setError(err.message);
                setLoading(false);
            }
        };

        fetchPatientConstants();
    }, [constantsManager]);

    const updatePatientConstants = async (newConstants) => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.put('/api/patient/constants', newConstants, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.data.success) {
                const updatedConstants = {
                    ...patientConstants,
                    ...newConstants
                };
                setPatientConstants(updatedConstants);
                constantsManager.patientConstants = updatedConstants;
                return true;
            }
            return false;
        } catch (err) {
            setError(err.message);
            return false;
        }
    };

    return {
        constantsManager,
        patientConstants,
        loading,
        error,
        updatePatientConstants
    };
};

export const calculateInsulinDose = ({
    carbs,
    protein,
    fat,
    bloodSugar,
    activities,
    absorptionType = 'medium',
    mealType,
    mealTime,
    patientConstants,
    constantsManager
}) => {
    const {
        insulin_to_carb_ratio,
        correction_factor,
        target_glucose,
        protein_factor,
        fat_factor,
        absorption_modifiers
    } = patientConstants;

  const carbInsulin = carbs / insulin_to_carb_ratio;

    // Calculate protein and fat contribution
    const proteinContribution = (protein * protein_factor) / insulin_to_carb_ratio;
    const fatContribution = (fat * fat_factor) / insulin_to_carb_ratio;

    // Calculate activity impact with the enhanced formula
    const activityImpact = constantsManager.calculateActivityImpact(activities);

    // Get meal timing factor
    const timingFactor = constantsManager.getMealTimingFactor(mealType, mealTime);

    // Calculate correction insulin if blood sugar is provided
    const correctionInsulin = bloodSugar
        ? Math.max(0, (bloodSugar - target_glucose) / correction_factor)
        : 0;

    // Apply absorption factor
    const absorptionFactor = absorption_modifiers[absorptionType] || 1.0;

    // Calculate total insulin with enhanced activity impact
    const baseInsulin = (carbInsulin + proteinContribution + fatContribution) * absorptionFactor * timingFactor;

    // Apply activity impact to both base insulin and correction insulin
    const activityAdjustedInsulin = baseInsulin * (1 - activityImpact); // Note: Changed to subtract impact
    const activityAdjustedCorrection = correctionInsulin * (1 - activityImpact);

    const totalInsulin = activityAdjustedInsulin + activityAdjustedCorrection;

    return {
        total: Math.round(Math.max(0, totalInsulin) * 10) / 10,
        breakdown: {
            carbInsulin: Math.round(carbInsulin * 100) / 100,
            proteinContribution: Math.round(proteinContribution * 100) / 100,
            fatContribution: Math.round(fatContribution * 100) / 100,
            activityImpact,
            timingFactor,
            correctionInsulin: Math.round(correctionInsulin * 100) / 100,
            absorptionFactor,
            activityAdjustedInsulin: Math.round(activityAdjustedInsulin * 100) / 100,
            activityAdjustedCorrection: Math.round(activityAdjustedCorrection * 100) / 100
        }
    };
};