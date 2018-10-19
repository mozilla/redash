import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import 'react-select/dist/react-select.css';

const chartTypes = [
  { value: 'line', label: 'Line', icon: 'line-chart' },
  { value: 'column', label: 'Bar', icon: 'bar-chart' },
  { value: 'area', label: 'Area', icon: 'area-chart' },
  { value: 'pie', label: 'Pie', icon: 'pie-chart' },
  { value: 'scatter', label: 'Scatter', icon: 'circle-o' },
  { value: 'bubble', label: 'Bubble', icon: 'circle-o' },
  { value: 'box', label: 'Box', icon: 'square-o' },
];

export default class ChartTypePicker extends React.Component {
  static propTypes = {
    value: PropTypes.oneOf([...chartTypes.map(t => t.value), 'custom']).isRequired,
    onChange: PropTypes.func.isRequired,
    clientConfig: PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    this.chartTypes = chartTypes;
    if (props.clientConfig.allowCustomJSVisualizations) {
      this.chartTypes = [...chartTypes, { value: 'custom', label: 'Custom', icon: 'code' }];
    }
  }

  typeItem = (opt, i) => <div><i className={'fa fa-' + opt.icon} /> {opt.label}</div>;

  render() {
    return (
      <Select
        value={this.props.value}
        valueRenderer={this.typeItem}
        clearable={false}
        options={this.chartTypes}
        optionRenderer={this.typeItem}
        onChange={this.props.onChange}
      />
    );
  }
}
