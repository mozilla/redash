import React from 'react';
import PropTypes from 'prop-types';

export default class AlertDialog extends React.Component {
  static propTypes = {
    title: PropTypes.string,
    message: PropTypes.string.isRequired,
    confirm: PropTypes.object,
    onClose: PropTypes.func.isRequired,
    onDismiss: PropTypes.func.isRequired,
  }
  static defaultProps = {
    title: null,
    confirm: { className: 'btn-success', show: true, title: 'OK' },
  }

  render() {
    return (
      <React.Fragment>
        <div className="modal-header">
          {this.props.title ? <h4 className="modal-title">{this.props.title}</h4> : ''}
        </div>
        <div className="modal-body">
          <p>{this.props.message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-default" onClick={this.props.onDismiss}>Cancel</button>
          {this.props.confirm.show ? <button className={'btn ' + this.props.confirm.className} onClick={this.props.onClose}>{this.props.confirm.title}</button> : ''}
        </div>
      </React.Fragment>
    );
  }
}
