import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import './SignIn.css';

function SignIn({ setLoggedIn, setUserType }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    user_type: 'patient'
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Clear error when user starts typing
    if (error) setError('');
  };

const handleSubmit = async (e) => {
  e.preventDefault();
  setIsLoading(true);
  setError('');

  try {
    const response = await axios.post('http://localhost:5000/login',
      formData,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        withCredentials: true // Add this
      }
    );

    if (response.data.token) {
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('userType', response.data.user_type);
      localStorage.setItem('firstName', response.data.firstName);
      localStorage.setItem('lastName', response.data.lastName);

      setLoggedIn(true);
      setUserType(response.data.user_type);
      navigate('/dashboard');
    } else {
      setError('Invalid response from server');
    }
  } catch (error) {
    console.error('Login error:', error);
    setError(
      error.response?.data?.error ||
      error.response?.data?.message ||
      'Unable to connect to server. Please check if the server is running.'
    );
  } finally {
    setIsLoading(false);
  }
};

  return (
    <div className="signin-container">
      <h2>Sign In</h2>
      {error && <p className="error-message">{error}</p>}
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          name="username"
          placeholder="Username"
          value={formData.username}
          onChange={handleChange}
          required
          disabled={isLoading}
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={formData.password}
          onChange={handleChange}
          required
          disabled={isLoading}
        />
        <select
          name="user_type"
          value={formData.user_type}
          onChange={handleChange}
          required
          disabled={isLoading}
        >
          <option value="patient">Patient</option>
          <option value="doctor">Doctor</option>
        </select>
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
      <p className="register-link">
        Don't have an account? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}

export default SignIn;