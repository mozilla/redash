import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import 'react-select/dist/react-select.css';

export default class ChartSeriesEditor extends React.Component {
  static propTypes = {
    colors: PropTypes.array.isRequired,
    options: PropTypes.object.isRequired,
    updateOptions: PropTypes.func.isRequired,
  }

  updateOptions = (k, v) => {
    const options = Object.assign(
      {}, this.props.options,
      { [k]: Object.assign({}, this.props.options[k], v) },
    );
    this.props.updateOptions(options);
  }

  changeColor = (value, color) => this.updateOptions(value, { color });

  render() {
    const colors = Object.assign({ Automatic: null }, this.props.ColorPalette);
    const colorSelectItem = opt => (<span style={{
      width: 12, height: 12, backgroundColor: opt.value, display: 'inline-block', marginRight: 5,
    }}
    />);
    const colorOptionItem = opt => <span style={{ textTransform: 'capitalize' }}>{colorSelectItem(opt)}{opt.label}</span>;
    return (
      <div className="m-t-10 m-b-10">
        <table className="table table-condensed col-table">
          <tbody>
            {this.props.colors.map(name => (
              <tr key={name}>
                <td style={{ padding: 3, width: 140 }}>
                  <div>{name}</div>
                </td>
                <td style={{ padding: 3, width: 35 }}>
                  <Select
                    value={this.props.options[name].color}
                    valueRenderer={colorSelectItem}
                    options={Object.keys(colors).map(key => ({ value: colors[key], label: key }))}
                    optionRenderer={colorOptionItem}
                    clearable={false}
                    onChange={selection => this.changeColor(name, selection.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
}

