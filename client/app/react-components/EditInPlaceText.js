import React from 'react';
import PropTypes from 'prop-types';

export default class EditInPlaceText extends React.Component {
  static propTypes = {
    ignoreBlanks: PropTypes.bool,
    isEditable: PropTypes.bool,
    editor: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
    placeholderText: PropTypes.string,
    value: PropTypes.string,
    onDone: PropTypes.func.isRequired,
  }

  static defaultProps = {
    ignoreBlanks: false,
    isEditable: true,
    editor: 'input',
    placeholderText: '',
    value: '',
  }
  constructor(props) {
    super(props);
    this.state = {
      editing: false,
    };
    this.inputRef = React.createRef();
    const self = this;
    this.componentDidUpdate = (prevProps, prevState) => {
      if (self.state.editing && !prevState.editing) {
        self.inputRef.current.focus();
      }
    };
  }

  startEditing = () => {
    if (this.props.isEditable) {
      this.setState({ editing: true });
    }
  }

  stopEditing = () => {
    const newValue = this.inputRef.current.value;
    const ignorableBlank = this.props.ignoreBlanks && this.props.value === '';
    if (!ignorableBlank && newValue !== this.props.value) {
      this.props.onDone(newValue);
    }
    this.setState({ editing: false });
  }

  keyDown = (event) => {
    if (event.keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      this.stopEditing();
    } else if (event.keyCode === 27) {
      this.setState({ editing: false });
    }
  }

  renderNormal = () => (
    <span
      role="presentation"
      onFocus={this.startEditing}
      onClick={this.startEditing}
      className={this.props.isEditable ? 'editable' : ''}
    >
      {this.state.newValue || this.props.value || this.props.placeholderText}
    </span>)

  renderEdit = () => (
    <this.props.editor
      ref={this.inputRef}
      className="rd-form-control"
      defaultValue={this.props.value}
      onBlur={this.stopEditing}
      onKeyDown={this.keyDown}
    />
  )

  render() {
    if (this.state.editing) {
      return this.renderEdit();
    }
    return this.renderNormal();
  }
}
