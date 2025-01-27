import React, { useState, useEffect } from 'react';

const ServingHandler = ({ food, onPortionChange }) => {
  const [portion, setPortion] = useState({
    amount: 1,
    unit: 'serving',
    measurementType: 'weight'
  });

  useEffect(() => {
    // Initialize with default serving size from food details
    if (food?.details) {
      // Check for volume-based serving first
      if (food.details.volume_serving) {
        setPortion({
          amount: food.details.volume_serving.amount,
          unit: food.details.volume_serving.unit,
          measurementType: 'volume',
          baseAmount: food.details.volume_serving.amount
        });
      }
      // Check for weight-based serving
      else if (food.details.weight_serving) {
        setPortion({
          amount: food.details.weight_serving.amount,
          unit: food.details.weight_serving.unit,
          measurementType: 'weight',
          baseAmount: food.details.weight_serving.amount
        });
      }
    }
  }, [food]);

  // Handle portion changes and propagate to parent
  const handlePortionChange = (newPortion) => {
    setPortion(newPortion);
    onPortionChange(newPortion);
  };

  return portion;
};

export const useFoodSelection = () => {
  const handleFoodSelect = (food) => {
    let defaultPortion = {
      amount: 1,
      unit: 'serving',
      measurementType: 'weight'
    };

    // Determine the default serving size and measurement type
    if (food.details) {
      if (food.details.volume_serving) {
        defaultPortion = {
          amount: food.details.volume_serving.amount,
          unit: food.details.volume_serving.unit,
          measurementType: 'volume',
          baseAmount: food.details.volume_serving.amount,
          baseUnit: food.details.volume_serving.unit
        };
      } else if (food.details.weight_serving) {
        defaultPortion = {
          amount: food.details.weight_serving.amount,
          unit: food.details.weight_serving.unit,
          measurementType: 'weight',
          baseAmount: food.details.weight_serving.amount,
          baseUnit: food.details.weight_serving.unit
        };
      }
    }

    return {
      ...food,
      id: Date.now(),
      portion: defaultPortion
    };
  };

  return { handleFoodSelect };
};

// Helper function to get available measurements based on food type
export const getAvailableMeasurements = (food) => {
  const measurements = {
    volume: [],
    weight: [],
    standard: []
  };

  if (!food?.details) return measurements;

  // Add volume measurements if food has volume serving
  if (food.details.volume_serving) {
    measurements.volume = ['ml', 'cup', 'tablespoon', 'teaspoon'];
  }

  // Add weight measurements if food has weight serving
  if (food.details.weight_serving) {
    measurements.weight = ['g', 'kg'];
  }

  // Add standard portions based on food type
  // These are common visual measurements that can be used for most foods
  measurements.standard = ['palm', 'handful', 'fist', 'plate'];

  return measurements;
};

// Helper to convert between measurement units
export const convertMeasurement = (amount, fromUnit, toUnit, food) => {
  if (fromUnit === toUnit) return amount;

  const VOLUME_TO_ML = {
    'cup': 240,
    'tablespoon': 15,
    'teaspoon': 5,
    'ml': 1
  };

  const WEIGHT_TO_G = {
    'g': 1,
    'kg': 1000,
    'palm': 85,
    'handful': 30,
    'fist': 150,
    'plate': 300
  };

  // Get base conversion values from food details
  const volumeServing = food.details.volume_serving;
  const weightServing = food.details.weight_serving;

  // Convert to base unit first (ml for volume, g for weight)
  let baseAmount;
  if (VOLUME_TO_ML[fromUnit]) {
    baseAmount = amount * VOLUME_TO_ML[fromUnit];
  } else if (WEIGHT_TO_G[fromUnit]) {
    baseAmount = amount * WEIGHT_TO_G[fromUnit];
  }

  // Convert to target unit
  if (VOLUME_TO_ML[toUnit]) {
    return baseAmount / VOLUME_TO_ML[toUnit];
  } else if (WEIGHT_TO_G[toUnit]) {
    return baseAmount / WEIGHT_TO_G[toUnit];
  }

  return amount; // If conversion not possible, return original amount
};

export default ServingHandler;