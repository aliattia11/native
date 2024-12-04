import React from 'react';

const Select = ({ children, value, onChange }) => {
  return (
    <select className="select" value={value} onChange={onChange}>
      {children}
    </select>
  );
};

export { Select };
