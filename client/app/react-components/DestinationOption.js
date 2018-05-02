import React from 'react';
import PropTypes from 'prop-types';
import Destination from './Destination';

export default class DestinationOption extends React.Component {
  handleMouseDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    this.props.onSelect(this.props.option, event);
  }

  handleMouseEnter = (event) => {
    this.props.onFocus(this.props.option, event);
  }

  handleMouseMove = (event) => {
    if (this.props.isFocused) return;
    this.props.onFocus(this.props.option, event);
  }
  render() {
    return (
      <div
        className={this.props.className}
        onMouseDown={this.handleMouseDown}
        onMouseEnter={this.handleMouseEnter}
        onMouseMove={this.handleMouseMove}
        title="anOpt"
        role="option"
        tabIndex="-1"
        aria-selected={this.props.isSelected}
      >
        <Destination destination={(console.log(this.props.option.destination), this.props.option.destination)} />
      </div>
    );
  }
}

DestinationOption.propTypes = {
  className: PropTypes.string.isRequired,
  // isDisabled: PropTypes.bool.isRequired,
  isFocused: PropTypes.bool.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onFocus: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
  option: PropTypes.shape({
    destination: PropTypes.shape({
      destination: PropTypes.shape({
        icon: PropTypes.string,
        name: PropTypes.string,
      }),
      user: PropTypes.shape({
        name: PropTypes.string,
      }),
    }),
  }).isRequired,
};
