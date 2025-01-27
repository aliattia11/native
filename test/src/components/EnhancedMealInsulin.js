import React, { useState, useEffect } from 'react';
import { FaPlus, FaMinus, FaHeart, FaSearch, FaStar } from 'react-icons/fa';

// Constants for unit conversions and standard portions
const STANDARD_PORTIONS = {
  // Volume-based measurements
  cup: { ml: 240, display_name: "Cup" },
  half_cup: { ml: 120, display_name: "½ Cup" },
  quarter_cup: { ml: 60, display_name: "¼ Cup" },
  tablespoon: { ml: 15, display_name: "Tablespoon" },
  teaspoon: { ml: 5, display_name: "Teaspoon" },

  // Visual size references
  palm: { grams: 85, display_name: "Palm-sized" },
  handful: { grams: 30, display_name: "Handful" },
  fist: { grams: 150, display_name: "Fist-sized" },
  piece: { grams: 1, display_name: "Piece" },
  plate: { grams: 300, display_name: "Full Plate" },
  small_plate: { grams: 150, display_name: "Small Plate" },
  bowl: { ml: 400, display_name: "Medium Bowl" },
  soup_bowl: { ml: 240, display_name: "Soup Bowl" },
  slice: { grams: 30, display_name: "Slice" }, // Added for bread
  burger: { grams: 150, display_name: "Burger" } // Added for burgers
};

const UNIT_CONVERSIONS = {
  volume: {
    cup: 240,
    tablespoon: 15,
    teaspoon: 5,
    ml: 1
  },
  weight: {
    g: 1,
    kg: 1000,
    oz: 28.35,
    lb: 453.6
  }
};
const convertToStandard = (value, fromUnit) => {
  // Handle standard portions first
  if (STANDARD_PORTIONS[fromUnit]) {
    if (STANDARD_PORTIONS[fromUnit].grams) {
      return value * STANDARD_PORTIONS[fromUnit].grams;
    }
    if (STANDARD_PORTIONS[fromUnit].ml) {
      return value * STANDARD_PORTIONS[fromUnit].ml;
    }
  }

  // Handle basic volume conversions
  if (UNIT_CONVERSIONS.volume[fromUnit]) {
    return value * UNIT_CONVERSIONS.volume[fromUnit];
  }

  // Handle basic weight conversions
  if (UNIT_CONVERSIONS.weight[fromUnit]) {
    return value * UNIT_CONVERSIONS.weight[fromUnit];
  }

  return value; // Default to no conversion if unit not found
};

// FoodSearch Component
const FoodSearch = ({ onFoodSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [categories, setCategories] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchCategories();
    fetchFavorites();
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery || selectedCategory) {
        searchFoods();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedCategory]);

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/food/categories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setCategories(data.categories);
    } catch (error) {
      setMessage('Failed to load categories');
    }
  };

  const fetchFavorites = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/food/favorite', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setFavorites(data);
    } catch (error) {
      setMessage('Failed to load favorites');
    }
  };

  const searchFoods = async () => {
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams({
        q: searchQuery,
        ...(selectedCategory && { category: selectedCategory })
      });
      const response = await fetch(`http://localhost:5000/api/food/search?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      setMessage('Search failed. Please try again.');
    }
  };

  const handleAddToFavorites = async (food) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('http://localhost:5000/api/food/favorite', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ food_name: food.name })
      });
      setMessage('Added to favorites');
      fetchFavorites();
    } catch (error) {
      setMessage('Error adding to favorites');
    }
  };

  return (
    <div className="mb-6">
      <div className="flex gap-4 mb-4">
        <button
          className={`px-4 py-2 rounded ${!showFavorites ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setShowFavorites(false)}
        >
          <FaSearch className="inline mr-2" /> Search Foods
        </button>
        <button
          className={`px-4 py-2 rounded ${showFavorites ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
          onClick={() => setShowFavorites(true)}
        >
          <FaStar className="inline mr-2" /> Favorites
        </button>
      </div>

      {!showFavorites ? (
        <div>
          <div className="flex gap-4 mb-4">
            <input
              type="text"
              className="flex-1 p-2 border rounded"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for food..."
            />
            <select
              className="p-2 border rounded"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {Object.entries(categories).map(([key, value]) => (
                <option key={key} value={key}>
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            {searchResults.map((food) => (
              <div key={food.id || food.name} className="p-3 border rounded flex justify-between items-center">
                <span>{food.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddToFavorites(food)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <FaHeart />
                  </button>
                  <button
                    onClick={() => onFoodSelect(food)}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <FaPlus />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {favorites.map((food) => (
            <div key={food.id || food.name} className="p-3 border rounded flex justify-between items-center">
              <span>{food.name}</span>
              <button
                onClick={() => onFoodSelect(food)}
                className="text-blue-500 hover:text-blue-700"
              >
                <FaPlus />
              </button>
            </div>
          ))}
          {favorites.length === 0 && (
            <p className="text-gray-500">No favorites yet</p>
          )}
        </div>
      )}
      {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
    </div>
  );
};

// FoodItem Component with improved portion handling
const FoodItem = ({ item, updatePortion, removeItem }) => {
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('g');

  useEffect(() => {
    // Set initial portion based on food's standard serving size or amount
    if (item.details?.serving_size) {
      setAmount(item.details.serving_size.amount);
      setUnit(item.details.serving_size.unit);
    } else if (item.details?.amount) {
      setAmount(item.details.amount);
      setUnit(item.details.unit || 'g');
    }
  }, [item]);

  const getAvailableUnits = () => {
    const baseUnits = ['g', 'ml'];
    const customUnits = [];

    // Add food-specific standard portion if available
    if (item.details?.serving_size?.unit) {
      customUnits.push(item.details.serving_size.unit);
    }

    // Add relevant standard portions based on food type
    Object.entries(STANDARD_PORTIONS).forEach(([key, value]) => {
      if ((value.grams && item.details?.serving_size?.unit !== 'ml') ||
          (value.ml && item.details?.serving_size?.unit === 'ml')) {
        customUnits.push(key);
      }
    });

    return [...new Set([...baseUnits, ...customUnits])];
  };

  const convertToStandard = (value, fromUnit) => {
    // Handle standard portions
    if (STANDARD_PORTIONS[fromUnit]) {
      if (STANDARD_PORTIONS[fromUnit].grams) {
        return value * STANDARD_PORTIONS[fromUnit].grams;
      }
      if (STANDARD_PORTIONS[fromUnit].ml) {
        // For liquid measurements, convert ml to g (assuming density ≈ 1)
        return value * STANDARD_PORTIONS[fromUnit].ml;
      }
    }

    // Handle basic weight/volume conversions
    if (UNIT_CONVERSIONS.weight[fromUnit]) {
      return value * UNIT_CONVERSIONS.weight[fromUnit];
    }
    if (UNIT_CONVERSIONS.volume[fromUnit]) {
      return value * UNIT_CONVERSIONS.volume[fromUnit];
    }

    return value; // Default to no conversion
  };

   const getNutritionValue = (baseValue) => {
    const standardServing = item.details.serving_size ||
                          { amount: item.details.amount || 1,
                            unit: item.details.unit || 'g' };

    const standardAmount = convertToStandard(standardServing.amount, standardServing.unit);
    const currentAmount = convertToStandard(amount, unit);

    // Prevent division by zero
    if (standardAmount === 0) return 0;

    const multiplier = currentAmount / standardAmount;
    return (baseValue * multiplier).toFixed(1);
  };

  const handleAmountChange = (newAmount) => {
    const validAmount = Math.max(0.1, Number(newAmount) || 0.1);
    setAmount(validAmount);
    updatePortion(item.id, {
      amount: validAmount,
      unit,
      standardAmount: convertToStandard(validAmount, unit)
    });
  };

  const handleUnitChange = (newUnit) => {
    setUnit(newUnit);
    updatePortion(item.id, {
      amount,
      unit: newUnit,
      standardAmount: convertToStandard(amount, newUnit)
    });
  };

  const getUnitDisplay = (unitKey) => {
    if (STANDARD_PORTIONS[unitKey]) {
      return STANDARD_PORTIONS[unitKey].display_name;
    }
    return unitKey;
  };

  return (
    <div className="p-4 border rounded-lg mb-4 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-lg">{item.name}</h4>
        <button
          onClick={() => removeItem(item.id)}
          className="text-red-500 hover:text-red-700"
        >
          <FaMinus />
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAmountChange(amount - 0.1)}
            className="p-1 text-blue-500 hover:text-blue-700"
          >
            <FaMinus />
          </button>
          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="w-20 p-1 border rounded text-center"
            step="0.1"
            min="0.1"
          />
          <button
            onClick={() => handleAmountChange(amount + 0.1)}
            className="p-1 text-blue-500 hover:text-blue-700"
          >
            <FaPlus />
          </button>
        </div>

        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value)}
          className="border rounded p-1"
        >
          {getAvailableUnits().map(unitKey => (
            <option key={unitKey} value={unitKey}>
              {getUnitDisplay(unitKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>Carbs: {getNutritionValue(item.details.carbs)}g</div>
        <div>Protein: {getNutritionValue(item.details.protein)}g</div>
        <div>Fat: {getNutritionValue(item.details.fat)}g</div>
      </div>
    </div>
  );
};

// Main InsulinCalculator component
const InsulinCalculator = () => {
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [totalNutrients, setTotalNutrients] = useState({ carbs: 0, protein: 0, fat: 0 });
  const [suggestedInsulin, setSuggestedInsulin] = useState(0);

  const calculateInsulin = (foods) => {
    const CARB_TO_INSULIN_RATIO = 10;
    const PROTEIN_FACTOR = 0.5;
    const FAT_FACTOR = 0.2;

    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    foods.forEach(food => {
      const portion = food.portion;
      let standardAmount;
      let standardServingAmount;

      // Handle both serving_size and direct amount specifications
      if (food.details.serving_size) {
        standardServingAmount = convertToStandard(
          food.details.serving_size.amount,
          food.details.serving_size.unit
        );
      } else {
        standardServingAmount = convertToStandard(
          food.details.amount || 1,
          food.details.unit || 'g'
        );
      }

      standardAmount = convertToStandard(portion.amount, portion.unit);

      // Prevent division by zero
      if (standardServingAmount === 0) return;

      const conversionRatio = standardAmount / standardServingAmount;

      const absorptionModifier = {
        'slow': 0.8,
        'medium': 1.0,
        'fast': 1.2,
        'very_fast': 1.4
      }[food.details.absorption_type || 'medium'];

      totalCarbs += (food.details.carbs * conversionRatio * absorptionModifier);
      totalProtein += (food.details.protein * conversionRatio * absorptionModifier);
      totalFat += (food.details.fat * conversionRatio * absorptionModifier);
    });

    setTotalNutrients({
      carbs: totalCarbs.toFixed(1),
      protein: totalProtein.toFixed(1),
      fat: totalFat.toFixed(1)
    });

    const insulinNeeded = (totalCarbs / CARB_TO_INSULIN_RATIO) +
      ((totalProtein * PROTEIN_FACTOR) / CARB_TO_INSULIN_RATIO) +
      ((totalFat * FAT_FACTOR) / CARB_TO_INSULIN_RATIO);

    setSuggestedInsulin(Math.round(insulinNeeded * 10) / 10);
  };

  useEffect(() => {
    if (selectedFoods.length > 0) {
      calculateInsulin(selectedFoods);
    } else {
      setTotalNutrients({ carbs: 0, protein: 0, fat: 0 });
      setSuggestedInsulin(0);
    }
  }, [selectedFoods]);

  const handleFoodSelect = (food) => {
    const foodWithPortion = {
      ...food,
      id: Date.now(),
      portion: {
        amount: food.details.serving_size?.amount || 1,
        unit: food.details.serving_size?.unit || 'g',
        standardAmount: food.details.serving_size?.amount || 1
      }
    };
    setSelectedFoods(prev => [...prev, foodWithPortion]);
  };

  const updateFoodPortion = (foodId, newPortion) => {
    setSelectedFoods(prev => prev.map(item => {
      if (item.id === foodId) {
        return { ...item, portion: newPortion };
      }
      return item;
    }));
  };

  const removeFood = (foodId) => {
    setSelectedFoods(prev => prev.filter(item => item.id !== foodId));
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Insulin Calculator</h2>

      <FoodSearch onFoodSelect={handleFoodSelect} />

      <div className="space-y-4">
        {selectedFoods.map(food => (
          <FoodItem
            key={food.id}
            item={food}
            updatePortion={updateFoodPortion}
            removeItem={removeFood}
          />
        ))}
      </div>

      {selectedFoods.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold mb-4">Total Nutrients</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>Carbs: {totalNutrients.carbs}g</div>
            <div>Protein: {totalNutrients.protein}g</div>
            <div>Fat: {totalNutrients.fat}g</div>
          </div>
          <div className="text-lg font-semibold">
            Suggested Insulin: {suggestedInsulin} units
          </div>
        </div>
      )}
    </div>
  );
};

export default InsulinCalculator;