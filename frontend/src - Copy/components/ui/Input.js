import React from 'react';

const Input = ({ type = 'text', value, onChange, placeholder }) => {
  return (
    <input
      type={type}
      className="input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
};

export { Input };
