import React from 'react';
import PropTypes from 'prop-types';

const THRESHOLD = 5;

function noDragStart() {
  return false;
}

export default class FlexResizable extends React.Component {
  static propTypes = {
    className: PropTypes.string,
    children: PropTypes.arrayOf(PropTypes.element).isRequired,
    style: PropTypes.object,
    onResize: PropTypes.func,
    direction: PropTypes.oneOf(['right', 'bottom']).isRequired,
    elementName: PropTypes.string.isRequired,
  }

  static defaultProps = {
    className: '',
    style: {},
    onResize: null,
  }

  constructor(props) {
    super(props);
    this.containerRef = React.createRef();
    this.state = {
      start: null,
      flexBasis: null,
      dragging: false,
      last: null,
      current: null,
    };
    this.dragStart = this.dragStart.bind(this);
    this.dragging = this.dragging.bind(this);
    this.dragEnd = this.dragEnd.bind(this);
  }

  coord = e => (e.touches ? e.touches[0] : e)[{ right: 'clientX', bottom: 'clientY' }[this.props.direction]];

  dragStart(e) {
    const current = parseInt(window.getComputedStyle(this.containerRef.current, null).getPropertyValue({ right: 'width', bottom: 'height' }[this.props.direction]), 10);
    this.setState({
      start: this.coord(e),
      current,
    });
    if (this.state.last === null) {
      this.setState({ last: current });
    }
    document.addEventListener('mouseup', this.dragEnd, false);
    document.addEventListener('mousemove', this.dragging, false);
    document.addEventListener('touchend', this.dragEnd, false);
    document.addEventListener('touchmove', this.dragging, false);
  }

  dragging(e) {
    const offset = this.state.start - this.coord(e);
    const flexBasis = this.state.current - offset;
    const dragging = this.state.dragging || (offset !== 0);
    this.setState({ flexBasis, dragging, last: dragging ? flexBasis : this.state.last });
    if (this.props.onResize) {
      this.props.onResize(e);
    }
  }

  dragEnd() {
    if (!this.state.dragging) {
      if (this.state.current <= parseFloat(window.getComputedStyle(this.containerRef.current, null).getPropertyValue('min-size') || 0) + THRESHOLD) {
        this.setState({ flexBasis: this.state.last });
      } else {
        this.setState({ flexBasis: 0 });
      }
    }
    this.setState({ dragging: false });
    document.removeEventListener('mouseup', this.dragEnd, false);
    document.removeEventListener('mousemove', this.dragging, false);
    document.removeEventListener('touchend', this.dragEnd, false);
    document.removeEventListener('touchmove', this.dragging, false);
  }

  down = (e) => {
    if (e.nativeEvent.which === 1 || e.nativeEvent.touches) {
      this.dragStart(e.nativeEvent);
    }
  }

  render() {
    return React.createElement(
      this.props.elementName,
      {
        className: this.props.className + ' resizable ' + (this.state.dragging ? 'no-transition' : ''),
        ref: this.containerRef,
        style: { ...this.props.style, flexBasis: this.state.flexBasis },
      },
      this.props.children,
      (
        <div
          className={`rg-${this.props.direction}`}
          onDragStart={noDragStart}
          onMouseDown={this.down}
          onTouchStart={this.down}
        >
          <span />
        </div>
      ),
    );
  }
}
