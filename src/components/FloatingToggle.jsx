import React from 'react';
import './FloatingToggle.css';

const FloatingToggle = ({ collapsed, onToggle }) => {
  return (
    <div 
      className={`floating-toggle ${collapsed ? 'collapsed' : ''}`}
      onClick={onToggle}
    >
      ⚙️
    </div>
  );
};

export default FloatingToggle;
