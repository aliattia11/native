import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import SignIn from './components/SignIn';
import Register from './components/Register';
import PatientDashboard from './components/PatientDashboard';
import DoctorDashboard from './components/DoctorDashboard';
import { ConstantsProvider } from './contexts/ConstantsContext';
import { BloodSugarDataProvider } from './contexts/BloodSugarDataContext';
import { TimeProvider } from './contexts/TimeContext';
import './App.css';

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [userType, setUserType] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUserType = localStorage.getItem('userType');
    if (token && storedUserType) {
      setLoggedIn(true);
      setUserType(storedUserType);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('userType');
    setLoggedIn(false);
    setUserType(null);
  };

  return (
    <Router>
      <TimeProvider>
        <ConstantsProvider>
          <BloodSugarDataProvider>
            <div className="App">
              <Routes>
                <Route path="/login" element={
                  loggedIn ? <Navigate to="/dashboard" /> : <SignIn setLoggedIn={setLoggedIn} setUserType={setUserType} />
                } />
                <Route path="/register" element={<Register />} />
                <Route path="/dashboard" element={
                  loggedIn ? (
                    userType === 'patient' ? (
                      <PatientDashboard handleLogout={handleLogout} />
                    ) : (
                      <DoctorDashboard handleLogout={handleLogout} />
                    )
                  ) : (
                    <Navigate to="/login" />
                  )
                } />
                <Route path="/" element={<Navigate to="/login" />} />
              </Routes>
            </div>
          </BloodSugarDataProvider>
        </ConstantsProvider>
      </TimeProvider>
    </Router>
  );
}

export default App;