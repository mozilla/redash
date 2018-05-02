import React from 'react';
import PropTypes from 'prop-types';
import Destination from './Destination';

export default function DestinationValue(props) {
  return (
    <div className="Select-value">
      <span className="Select-value-label" title={props.value.title}>
        <Destination destination={props.value.destination} />
      </span>
    </div>
  );
}

DestinationValue.propTypes = {
  value: PropTypes.shape({
    destination: PropTypes.shape({
      icon: PropTypes.string,
      name: PropTypes.string,
    }),
    user: PropTypes.shape({
      name: PropTypes.string,
    }),
  }).isRequired,
};
