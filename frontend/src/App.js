import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SignIn from './components/SignIn';
import Register from './components/Register';
import PatientDashboard from './components/PatientDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import { ConstantsProvider } from './contexts/ConstantsContext';
import axios from 'axios';
import './App.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);

  // Verify authentication and get user data
  const verifyAuth = useCallback(async () => {
    const token = localStorage.getItem('token');
    const storedUserType = localStorage.getItem('userType');

    if (!token || !storedUserType) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get('http://localhost:5000/api/auth/user', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.user) {
        setLoggedIn(true);
        setUserType(storedUserType);
        setUserData(response.data.user);
      } else {
        handleLogout();
      }
    } catch (error) {
      console.error('Auth verification failed:', error);
      handleLogout();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    localStorage.removeItem('userId');
    setLoggedIn(false);
    setUserType(null);
    setUserData(null);
  };

  const handleLogin = (token, type, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('userType', type);
    localStorage.setItem('userId', user._id);
    setLoggedIn(true);
    setUserType(type);
    setUserData(user);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <ConstantsProvider userData={userData}>
        <div className="App">
          <Routes>
            <Route
              path="/login"
              element={
                loggedIn ? (
                  <Navigate to="/dashboard" />
                ) : (
                  <SignIn
                    onLogin={handleLogin}
                    setLoggedIn={setLoggedIn}
                    setUserType={setUserType}
                  />
                )
              }
            />
            <Route
              path="/register"
              element={
                loggedIn ? (
                  <Navigate to="/dashboard" />
                ) : (
                  <Register />
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                loggedIn ? (
                  userType === 'patient' ? (
                    <PatientDashboard
                      handleLogout={handleLogout}
                      userData={userData}
                    />
                  ) : (
                    <DoctorDashboard
                      handleLogout={handleLogout}
                      userData={userData}
                    />
                  )
                ) : (
                  <Navigate to="/login" />
                )
              }
            />
            <Route
              path="/"
              element={<Navigate to="/login" />}
            />
            {/* Add a catch-all route for 404 */}
            <Route
              path="*"
              element={
                <div className="not-found">
                  <h1>404: Page Not Found</h1>
                  <button onClick={() => window.history.back()}>Go Back</button>
                </div>
              }
            />
          </Routes>
        </div>
      </ConstantsProvider>
    </Router>
  );
}

export default App;