import React from 'react';

export default function Overlay(props) {
  return (
    <div>
      <div className="overlay" />
      <div style={{
        width: '100%',
        position: 'absolute',
        top: 50,
        'z-index': 2000,
      }}
      >
        <div className="well well-lg" style={{ width: '70%', margin: 'auto' }}>
          {...props.children}
        </div>
      </div>
    </div>
  );
}
