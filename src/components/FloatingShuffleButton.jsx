import React from 'react';
import './FloatingShuffleButton.css';

const FloatingShuffleButton = ({ visible, onShuffle }) => {
  if (!visible) return null;

  return (
    <div 
      className="floating-shuffle-button"
      onClick={onShuffle}
      title="Shuffle"
    >
      🔀
    </div>
  );
};

export default FloatingShuffleButton;
