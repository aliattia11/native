import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaPlus, FaMinus, FaHeart, FaSearch, FaStar } from 'react-icons/fa';
import {  calculateNutrients } from './EnhancedPatientConstantsCalc';
import { MEASUREMENT_SYSTEMS, VOLUME_MEASUREMENTS, WEIGHT_MEASUREMENTS } from '../constants';

import styles from './MealInput.module.css';

// Helper function to prevent event propagation
const preventEventPropagation = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

const FoodItem = ({ item, updatePortion, removeItem, onPortionChange }) => {
  const [amount, setAmount] = useState(() => {
    return item.portion?.activeMeasurement === MEASUREMENT_SYSTEMS.VOLUME
      ? item.portion?.amount || 1
      : item.portion?.w_amount || item.details?.serving_size?.w_amount || 1;
  });

  const [unit, setUnit] = useState(() => {
    return item.portion?.activeMeasurement === MEASUREMENT_SYSTEMS.VOLUME
      ? item.portion?.unit || 'ml'
      : item.portion?.w_unit || item.details?.serving_size?.w_unit || 'g';
  });

  const [measurementSystem, setMeasurementSystem] = useState(
    item.portion?.activeMeasurement || MEASUREMENT_SYSTEMS.WEIGHT
  );

  const [nutrients, setNutrients] = useState({ carbs: 0, protein: 0, fat: 0 });

  const getMeasurementData = useCallback((system) => {
    return system === MEASUREMENT_SYSTEMS.VOLUME ? VOLUME_MEASUREMENTS : WEIGHT_MEASUREMENTS;
  }, []);

  // Calculate nutrients when item changes
  useEffect(() => {
    const newNutrients = calculateNutrients(item);
    setNutrients({
      carbs: parseFloat(newNutrients.carbs).toFixed(1),
      protein: parseFloat(newNutrients.protein).toFixed(1),
      fat: parseFloat(newNutrients.fat).toFixed(1)
    });
  }, [item]);

  // Update portion only when amount, unit, or measurementSystem changes
  useEffect(() => {
    const newPortion = {
      amount: measurementSystem === MEASUREMENT_SYSTEMS.VOLUME ? amount : null,
      unit: measurementSystem === MEASUREMENT_SYSTEMS.VOLUME ? unit : null,
      w_amount: measurementSystem === MEASUREMENT_SYSTEMS.WEIGHT ? amount : null,
      w_unit: measurementSystem === MEASUREMENT_SYSTEMS.WEIGHT ? unit : null,
      activeMeasurement: measurementSystem
    };

    // Only update if the values have actually changed
    const hasChanged = JSON.stringify(newPortion) !== JSON.stringify(item.portion);

    if (hasChanged) {
      updatePortion(item.id, newPortion);
      if (onPortionChange) {
        onPortionChange(item.id, newPortion);
      }
    }
  }, [amount, unit, measurementSystem, item.id, updatePortion, onPortionChange]);

  const handleMeasurementSystemChange = (e, newSystem) => {
    preventEventPropagation(e);
    if (newSystem === measurementSystem) return;

    let newAmount = amount;
    let newUnit = newSystem === MEASUREMENT_SYSTEMS.VOLUME ? 'ml' : 'g';

    if (measurementSystem === MEASUREMENT_SYSTEMS.VOLUME && newSystem === MEASUREMENT_SYSTEMS.WEIGHT) {
      const currentMl = amount * (VOLUME_MEASUREMENTS[unit]?.ml || 1);
      newAmount = currentMl; // Assuming 1ml = 1g for simplification
    } else if (measurementSystem === MEASUREMENT_SYSTEMS.WEIGHT && newSystem === MEASUREMENT_SYSTEMS.VOLUME) {
      const currentGrams = amount * (WEIGHT_MEASUREMENTS[unit]?.grams || 1);
      newAmount = currentGrams; // Assuming 1g = 1ml for simplification
    }

    setAmount(newAmount);
    setUnit(newUnit);
    setMeasurementSystem(newSystem);
  };

  const handleAmountChange = (e, newAmount) => {
    if (e) {
      preventEventPropagation(e);
    }
    const validAmount = Math.max(0.5, Number(newAmount) || 0.5);
    setAmount(validAmount);
  };

  const handleUnitChange = (e) => {
    preventEventPropagation(e);
    const newUnit = e.target.value;
    const measurements = getMeasurementData(measurementSystem);
    const oldUnitValue = measurementSystem === MEASUREMENT_SYSTEMS.VOLUME
      ? measurements[unit]?.ml || 1
      : measurements[unit]?.grams || 1;
    const newUnitValue = measurementSystem === MEASUREMENT_SYSTEMS.VOLUME
      ? measurements[newUnit]?.ml || 1
      : measurements[newUnit]?.grams || 1;

    const convertedAmount = (amount * oldUnitValue) / newUnitValue;
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

  // Handle remove food item with event prevention
  const handleRemoveItem = (e) => {
    preventEventPropagation(e);
    removeItem(item.id);
  };

  return (
    <div className={styles.foodItem}>
      <div className={styles.foodItemHeader}>
        <h4 className={styles.foodItemTitle}>{item.name}</h4>
        <button
          onClick={handleRemoveItem}
          className={styles.buttonRemove}
        >
          <FaMinus />
        </button>
      </div>

      <div className={styles.measurementToggle}>
        <div className={styles.toggleButtons}>
          <button
            onClick={(e) => handleMeasurementSystemChange(e, MEASUREMENT_SYSTEMS.WEIGHT)}
            className={`${styles.toggleButton} ${
              measurementSystem === MEASUREMENT_SYSTEMS.WEIGHT ? styles.active : ''
            }`}
          >
            Weight
          </button>
          <button
            onClick={(e) => handleMeasurementSystemChange(e, MEASUREMENT_SYSTEMS.VOLUME)}
            className={`${styles.toggleButton} ${
              measurementSystem === MEASUREMENT_SYSTEMS.VOLUME ? styles.active : ''
            }`}
          >
            Volume
          </button>
        </div>
      </div>

      <div className={styles.portionControl}>
        <div className={styles.amountControl}>
          <button
            onClick={(e) => handleAmountChange(e, amount - 0.5)}
            className={styles.controlButton}
          >
            <FaMinus className={styles.buttonIcon} />
          </button>

          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                preventEventPropagation(e);
              }
            }}
            step="0.5"
            min="0.5"
            className={styles.portionInput}
          />

          <button
            onClick={(e) => handleAmountChange(e, amount + 0.5)}
            className={styles.controlButton}
          >
            <FaPlus className={styles.buttonIcon} />
          </button>
        </div>

        <select
          value={unit}
          onChange={handleUnitChange}
          onClick={preventEventPropagation}
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

  const handleAddToFavorites = async (e, food) => {
    preventEventPropagation(e);
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

  const handleFoodSelect = (e, food) => {
    preventEventPropagation(e);
    onFoodSelect({ ...food, portionTypes });
  };

  const handleSearchInputChange = (e) => {
    preventEventPropagation(e);
    setSearchQuery(e.target.value);
  };

  const handleCategoryChange = (e) => {
    preventEventPropagation(e);
    setSelectedCategory(e.target.value);
  };

  const handleToggleFavorites = (e, showFavs) => {
    preventEventPropagation(e);
    setShowFavorites(showFavs);
  };

  return (
    <div className={styles.foodSearch}>
      <div className={styles.searchButtons}>
        <button
          className={`${styles.tabButton} ${!showFavorites ? styles.active : ''}`}
          onClick={(e) => handleToggleFavorites(e, false)}
        >
          <FaSearch className={styles.buttonIcon} /> Search Foods
        </button>
        <button
          className={`${styles.tabButton} ${showFavorites ? styles.active : ''}`}
          onClick={(e) => handleToggleFavorites(e, true)}
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
              onChange={handleSearchInputChange}
              onClick={preventEventPropagation}
              onKeyDown={(e) => {
                if (e.key === 'Enter') preventEventPropagation(e);
              }}
              placeholder="Search for food..."
              aria-label="Search foods"
            />
            <select
              className={styles.categorySelect}
              value={selectedCategory}
              onChange={handleCategoryChange}
              onClick={preventEventPropagation}
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
                      onClick={(e) => handleAddToFavorites(e, food)}
                      aria-label="Add to favorites"
                    >
                      <FaHeart />
                    </button>
                    <button
                      className={styles.addButton}
                      onClick={(e) => handleFoodSelect(e, food)}
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
                  onClick={(e) => handleFoodSelect(e, food)}
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
  // Add handler to intercept and prevent bubbling events
  const handlePreventPropagation = (e) => {
    preventEventPropagation(e);
  };

  return (
    <div className={styles.foodSection} onClick={handlePreventPropagation}>
      <FoodSearch
        onFoodSelect={onFoodSelect}
      />

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