import React, { useState } from 'react';

const Tabs = ({ children, value, onValueChange }) => {
  return (
    <div className="tabs">
      {React.Children.map(children, (child) => 
        React.cloneElement(child, { value, onValueChange })
      )}
    </div>
  );
};

const TabsList = ({ children }) => {
  return (
    <div className="tabs-list">
      {children}
    </div>
  );
};

const TabsTrigger = ({ value, children, onValueChange }) => {
  return (
    <button
      className={`tabs-trigger ${value === children ? 'active' : ''}`}
      onClick={() => onValueChange(children)}
    >
      {children}
    </button>
  );
};

const TabsContent = ({ value, children }) => {
  return (
    <div className="tabs-content">
      {children}
    </div>
  );
};

export { Tabs, TabsList, TabsTrigger, TabsContent };
