import React from 'react';
import './Header.css';

const Header = ({ status, videoCount, imageCount }) => {
  return (
    <div className="header">
      <h1>📹 Video Grid Viewer</h1>
      <p>Display and play videos from the server</p>
      
      <div className={`status ${status.type}`}>
        {status.message}
      </div>
      <div style={{ marginTop: '8px', opacity: 0.8, fontSize: '0.9em' }}>
        Videos: {videoCount}{imageCount !== undefined ? ` · Images: ${imageCount}` : ''}
      </div>
    </div>
  );
};

export default Header;
