import React from 'react';

interface LoadingScreenProps {
  message?: string;
  fullScreen?: boolean;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = "Preparing your workspace",
  fullScreen = true 
}) => {
  return (
    <div className={fullScreen ? "loading-screen" : "loading-inline"}>
      <div className="loading-content">
        <div className="brand-redesign loading-logo">
          <div className="logo-text">
            <span className="logo-lpo">LocalMile</span>
            <span className="logo-plus">.Plus</span>
          </div>
          <div className="logo-platform">A MAILPLUS PLATFORM</div>
        </div>
        <div className="loading-bar-container">
          <div className="loading-bar"></div>
        </div>
        <p className="loading-text">{message}</p>
      </div>
    </div>
  );
};

export default LoadingScreen;
