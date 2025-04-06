import { SHARED_CONSTANTS } from '../constants/shared_constants';

// Get all available insulin types (excluding non-insulin medications)
export const getAvailableInsulinTypes = () => {
  const medicationFactors = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors;
  
  // Filter to include only insulin types (those with type containing "acting")
  return Object.entries(medicationFactors)
    .filter(([key, value]) => value.type && value.type.includes('acting'))
    .map(([key, value]) => ({
      id: key,
      name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      ...value,
      displayName: `${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${value.type.split('_')[0]} acting)`
    }))
    .sort((a, b) => {
      // Sort by action type: rapid, short, intermediate, long, mixed
      const typeOrder = {
        'rapid': 1,
        'short': 2,
        'intermediate': 3,
        'long': 4,
        'mixed': 5
      };
      
      const typeA = a.type.split('_')[0];
      const typeB = b.type.split('_')[0];
      
      return typeOrder[typeA] - typeOrder[typeB];
    });
};

// Recommend insulin type based on meal context
export const recommendInsulinType = (mealType, foods, currentTime) => {
  // Get hour of day (0-23)
  const hour = new Date(currentTime || Date.now()).getHours();
  
  // Default to regular insulin
  let recommended = 'regular_insulin';
  
  // Check if any food has very fast absorption
  const hasFastFood = foods.some(food => 
    food.details.absorption_type === 'very_fast' || food.details.absorption_type === 'fast'
  );
  
  // Check if any food has very slow absorption
  const hasSlowFood = foods.some(food => 
    food.details.absorption_type === 'very_slow' || food.details.absorption_type === 'slow'
  );
  
  // Morning meals often need rapid insulin due to dawn phenomenon
  if (mealType === 'breakfast' || (hour >= 6 && hour <= 10)) {
    if (hasFastFood) {
      return 'insulin_aspart'; // Fast food in morning needs very rapid insulin
    } else {
      return 'insulin_lispro'; // Regular breakfast
    }
  }
  
  // For slower absorbing dinner meals, regular insulin may be better
  if (mealType === 'dinner' && hasSlowFood) {
    return 'regular_insulin';
  }
  
  // For most meals with fast carbs, rapid insulins are preferred
  if (hasFastFood) {
    return 'insulin_lispro';
  }
  
  // For slow absorbing foods at any time
  if (hasSlowFood) {
    return 'regular_insulin'; // Longer action profile matches slower absorption
  }
  
  // Default recommendation based on meal type
  const mealTypeRecommendations = {
    'breakfast': 'insulin_lispro',
    'lunch': 'insulin_aspart',
    'dinner': 'insulin_glulisine',
    'snack': 'insulin_aspart'
  };
  
  return mealTypeRecommendations[mealType] || recommended;
};

// Format insulin name for display
export const formatInsulinName = (insulinType) => {
  if (!insulinType) return '';
  
  const insulin = SHARED_CONSTANTS.DEFAULT_PATIENT_CONSTANTS.medication_factors[insulinType];
  if (!insulin) return insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  return `${insulinType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${insulin.type.split('_')[0]} acting)`;
};

// Group insulin types by action profile
export const getInsulinTypesByCategory = () => {
  const insulinTypes = getAvailableInsulinTypes();
  
  return insulinTypes.reduce((acc, insulin) => {
    const category = insulin.type.split('_')[0];
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(insulin);
    return acc;
  }, {});
};