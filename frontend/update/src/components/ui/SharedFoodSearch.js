// SharedFoodSearch.js
import React, { useState, useEffect } from 'react';
import { FaPlus, FaHeart, FaSearch, FaStar } from 'react-icons/fa';
import axios from 'axios';

const SharedFoodSearch = ({ onFoodSelect, className = '' }) => {
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

  const searchFoods = async () => {
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
  };

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
              aria-label="Search foods"
            />
            <select
              className="p-2 border rounded"
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

          <div className="space-y-2">
            {searchResults.map((food) => (
              <div key={food.id || food.name} className="p-3 border rounded flex justify-between items-center">
                <span>{food.name}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddToFavorites(food)}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Add to favorites"
                  >
                    <FaHeart />
                  </button>
                  <button
                    onClick={() => onFoodSelect({ ...food, portionTypes })}
                    className="text-blue-500 hover:text-blue-700"
                    aria-label="Add food"
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
                onClick={() => onFoodSelect({ ...food, portionTypes })}
                className="text-blue-500 hover:text-blue-700"
                aria-label="Add food"
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

export default SharedFoodSearch;