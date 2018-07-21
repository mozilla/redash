import React from 'react';
import PropTypes from 'prop-types';

const unloadMessage = 'You will lose your changes if you leave';
const confirmMessage = `${unloadMessage}\n\nAre you sure you want to leave this page?`;

export default class AlertUnsavedChanges extends React.Component {
  static propTypes = {
    isDirty: PropTypes.bool.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
  }

  componentDidMount() {
    this._onbeforeunload = window.onbeforeunload;
    window.onbeforeunload = () => (this.props.isDirty ? unloadMessage : null);
    this.props.onChangeLocation((event, next, current) => {
      if (next.split('?')[0] === current.split('?')[0] || next.split('#')[0] === current.split('#')[0]) {
        return;
      }
      // eslint-disable-next-line no-alert
      if (this.props.isDirty && !window.confirm(confirmMessage)) {
        event.preventDefault();
      }
    });
  }

  componentWillUnmount() {
    window.onbeforeunload = this._onbeforeunload;
  }

  render() {
    return '';
  }
}
