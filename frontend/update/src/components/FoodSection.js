import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus, FaHeart, FaSearch, FaStar } from 'react-icons/fa';
import { ConstantsManager, usePatientConstants } from '../constants/EnhancedConstants';
import styles from './MealInput.module.css';

const FoodItem = ({ item, updatePortion, removeItem, onPortionChange }) => {
  const { constantsManager } = usePatientConstants();
  const [amount, setAmount] = React.useState(() => {
    return item.portion?.activeMeasurement === 'volume'
      ? item.portion?.amount || 1
      : item.portion?.w_amount || item.details?.serving_size?.w_amount || 1;
  });

  const [unit, setUnit] = React.useState(() => {
    return item.portion?.activeMeasurement === 'volume'
      ? item.portion?.unit || 'ml'
      : item.portion?.w_unit || item.details?.serving_size?.w_unit || 'g';
  });

  const [measurementSystem, setMeasurementSystem] = React.useState(
    item.portion?.activeMeasurement || 'weight'
  );

  const [nutrients, setNutrients] = React.useState({ carbs: 0, protein: 0, fat: 0 });

  const getMeasurementData = useCallback((system) => {
    return system === 'volume'
      ? ConstantsManager.SHARED_CONSTANTS.VOLUME_MEASUREMENTS
      : ConstantsManager.SHARED_CONSTANTS.WEIGHT_MEASUREMENTS;
  }, []);

  const calculateNutrients = useCallback(() => {
    if (!item.details) return { carbs: 0, protein: 0, fat: 0 };

    const servingSize = item.details.serving_size || { amount: 1, unit: 'serving' };
    let conversionFactor = 1;

    if (measurementSystem === 'volume') {
      const baseAmount = constantsManager.converter.convertToStandard(
        servingSize.amount,
        servingSize.unit
      );
      const portionAmount = constantsManager.converter.convertToStandard(
        amount,
        unit
      );
      conversionFactor = portionAmount / baseAmount;
    } else {
      const baseAmount = constantsManager.converter.convertToStandard(
        servingSize.w_amount || servingSize.amount,
        servingSize.w_unit || servingSize.unit
      );
      const portionAmount = constantsManager.converter.convertToStandard(
        amount,
        unit
      );
      conversionFactor = portionAmount / baseAmount;
    }

    return {
      carbs: (item.details.carbs * conversionFactor).toFixed(1),
      protein: (item.details.protein * conversionFactor).toFixed(1),
      fat: (item.details.fat * conversionFactor).toFixed(1)
    };
  }, [amount, unit, measurementSystem, item.details, constantsManager.converter]);

  const updateItemPortion = useCallback(() => {
    const newPortion = {
      amount: measurementSystem === 'volume' ? amount : item.portion.amount,
      unit: measurementSystem === 'volume' ? unit : item.portion.unit,
      w_amount: measurementSystem === 'weight' ? amount : item.portion.w_amount,
      w_unit: measurementSystem === 'weight' ? unit : item.portion.w_unit,
      activeMeasurement: measurementSystem
    };

    updatePortion(item.id, newPortion);
    onPortionChange?.(item.id, newPortion);
  }, [amount, unit, measurementSystem, item.id, item.portion, updatePortion, onPortionChange]);

  React.useEffect(() => {
    const newNutrients = calculateNutrients();
    setNutrients(newNutrients);
    updateItemPortion();
  }, [calculateNutrients, updateItemPortion]);

  const handleMeasurementSystemChange = (newSystem) => {
    if (newSystem === measurementSystem) return;

    // Convert the current amount to the new system using the converter
    const currentAmount = constantsManager.converter.convertToStandard(amount, unit);
    const newUnit = newSystem === 'volume' ? 'ml' : 'g';

    // The amount stays the same since we're using base units (ml/g)
    setAmount(currentAmount);
    setUnit(newUnit);
    setMeasurementSystem(newSystem);
  };

  const handleAmountChange = (newAmount) => {
    const validAmount = Math.max(0.5, Number(newAmount) || 0.5);
    setAmount(validAmount);
  };

  const handleUnitChange = (newUnit) => {
    const currentBaseAmount = constantsManager.converter.convertToStandard(amount, unit);
    const convertedAmount = constantsManager.converter.convertBetweenUnits(
      currentBaseAmount,
      measurementSystem === 'volume' ? 'ml' : 'g',
      newUnit
    );

    setAmount(parseFloat(convertedAmount.toFixed(2)));
    setUnit(newUnit);
  };

  const getAvailableUnits = () => {
    const measurements = getMeasurementData(measurementSystem);
    return Object.entries(measurements).map(([key, value]) => ({
      value: key,
      label: value.display_name
    }));
  };

  // Rest of the component remains the same
  return (
    <div className={styles.foodItem}>
      <div className={styles.foodItemHeader}>
        <h4 className={styles.foodItemTitle}>{item.name}</h4>
        <button
          onClick={() => removeItem(item.id)}
          className={styles.buttonRemove}
        >
          <FaMinus />
        </button>
      </div>

      <div className={styles.measurementToggle}>
        <div className={styles.toggleButtons}>
          <button
            onClick={() => handleMeasurementSystemChange('weight')}
            className={`${styles.toggleButton} ${
              measurementSystem === 'weight' ? styles.active : ''
            }`}
          >
            Weight
          </button>
          <button
            onClick={() => handleMeasurementSystemChange('volume')}
            className={`${styles.toggleButton} ${
              measurementSystem === 'volume' ? styles.active : ''
            }`}
          >
            Volume
          </button>
        </div>
      </div>

      <div className={styles.portionControl}>
        <div className={styles.amountControl}>
          <button
            onClick={() => handleAmountChange(amount - 0.5)}
            className={styles.controlButton}
          >
            <FaMinus className={styles.buttonIcon} />
          </button>

          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            step="0.5"
            min="0.5"
            className={styles.portionInput}
          />

          <button
            onClick={() => handleAmountChange(amount + 0.5)}
            className={styles.controlButton}
          >
            <FaPlus className={styles.buttonIcon} />
          </button>
        </div>

        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value)}
          className={styles.unitSelect}
        >
          {getAvailableUnits().map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.nutrientsDisplay}>
        <div className={styles.nutrientItem}>
          <span className={styles.nutrientLabel}>Carbs</span>
          <span className={styles.nutrientValue}>{nutrients.carbs}g</span>
        </div>
        <div className={styles.nutrientItem}>
          <span className={styles.nutrientLabel}>Protein</span>
          <span className={styles.nutrientValue}>{nutrients.protein}g</span>
        </div>
        <div className={styles.nutrientItem}>
          <span className={styles.nutrientLabel}>Fat</span>
          <span className={styles.nutrientValue}>{nutrients.fat}g</span>
        </div>
      </div>
    </div>
  );
};

const FoodSearch = ({ onFoodSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [categories, setCategories] = useState({});
  const [favorites, setFavorites] = useState([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [message, setMessage] = useState('');
  const [portionTypes, setPortionTypes] = useState({
    volume: ['ml', 'cup', 'tablespoon', 'teaspoon'],
    weight: ['g', 'kg'],
    standard_portions: {}
  });

  useEffect(() => {
    fetchCategories();
    fetchFavorites();
    fetchPortionTypes();
  }, []);

  const fetchPortionTypes = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/food/measurements', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setPortionTypes(response.data);
      }
    } catch (error) {
      console.error('Error loading portion types:', error);
      setMessage('Failed to load measurement types');
    }
  };

  const fetchCategories = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/food/categories', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCategories(response.data.categories);
    } catch (error) {
      console.error('Error loading categories:', error);
      setMessage('Failed to load categories');
    }
  };

  const fetchFavorites = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/food/favorite', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFavorites(response.data);
    } catch (error) {
      console.error('Error loading favorites:', error);
      setMessage('Failed to load favorites');
    }
  };

  const searchFoods = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const queryParams = new URLSearchParams({
        q: searchQuery,
        ...(selectedCategory && { category: selectedCategory })
      });
      const response = await axios.get(`http://localhost:5000/api/food/search?${queryParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching foods:', error);
      setMessage('Search failed. Please try again.');
    }
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery || selectedCategory) {
        searchFoods();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedCategory, searchFoods]);

  const handleAddToFavorites = async (food) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('http://localhost:5000/api/food/favorite',
        { food_name: food.name },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessage('Added to favorites');
      fetchFavorites();
    } catch (error) {
      setMessage('Error adding to favorites');
    }

    setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className={styles.foodSearch}>
      <div className={styles.searchButtons}>
        <button
          className={`${styles.tabButton} ${!showFavorites ? styles.active : ''}`}
          onClick={() => setShowFavorites(false)}
        >
          <FaSearch className={styles.buttonIcon} /> Search Foods
        </button>
        <button
          className={`${styles.tabButton} ${showFavorites ? styles.active : ''}`}
          onClick={() => setShowFavorites(true)}
        >
          <FaStar className={styles.buttonIcon} /> Favorites
        </button>
      </div>

      {!showFavorites ? (
        <div className={styles.searchContainer}>
          <div className={styles.searchControls}>
            <input
              type="text"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for food..."
              aria-label="Search foods"
            />
            <select
              className={styles.categorySelect}
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Select category"
            >
              <option value="">All Categories</option>
              {Object.keys(categories).map((category) => (
                <option key={category} value={category}>
                  {category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.searchResults}>
            {searchResults.map((food) => (
              <div key={food.id || food.name} className={styles.foodCardSimple}>
                <div className={styles.foodCardHeader}>
                  <h4 className={styles.foodCardTitle}>{food.name}</h4>
                  <div className={styles.foodCardActions}>
                    <button
                      className={styles.favoriteButton}
                      onClick={() => handleAddToFavorites(food)}
                      aria-label="Add to favorites"
                    >
                      <FaHeart />
                    </button>
                    <button
                      className={styles.addButton}
                      onClick={() => onFoodSelect({ ...food, portionTypes })}
                      aria-label="Add food"
                    >
                      <FaPlus /> Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.favoritesGrid}>
          {favorites.map((food) => (
            <div key={food.id || food.name} className={styles.foodCardSimple}>
              <div className={styles.foodCardHeader}>
                <h4 className={styles.foodCardTitle}>{food.name}</h4>
                <button
                  className={styles.addButton}
                  onClick={() => onFoodSelect({ ...food, portionTypes })}
                  aria-label="Add food"
                >
                  <FaPlus /> Add
                </button>
              </div>
            </div>
          ))}
          {favorites.length === 0 && (
            <p className={styles.emptyMessage}>No favorites yet</p>
          )}
        </div>
      )}
      {message && <p className={styles.message}>{message}</p>}
    </div>
  );
};
const FoodSection = ({ selectedFoods, onFoodSelect, onUpdatePortion, onRemoveFood, onPortionChange }) => {
  return (
    <div className={styles.foodSection}>
      <FoodSearch onFoodSelect={onFoodSelect} />
      {selectedFoods.length > 0 && (
        <div className={styles.selectedFoods}>
          <h3 className={styles.sectionTitle}>Selected Foods</h3>
          {selectedFoods.map((food) => (
            <FoodItem
              key={food.id}
              item={food}
              updatePortion={onUpdatePortion}
              removeItem={onRemoveFood}
              onPortionChange={onPortionChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FoodSection;