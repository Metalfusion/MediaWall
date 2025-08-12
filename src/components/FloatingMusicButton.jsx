import React from 'react';
import './FloatingMusicButton.css';

const FloatingMusicButton = ({ visible, onPlay }) => {
  if (!visible) return null;

  return (
    <div 
      className="floating-music-button"
      onClick={onPlay}
      title="Start Music"
    >
      🎵
    </div>
  );
};

export default FloatingMusicButton;
