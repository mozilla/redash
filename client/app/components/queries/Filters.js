import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { isArray } from 'lodash';

import Select from 'react-select';

const Filter = PropTypes.shape({
  current: PropTypes.string.isRequired,
  multiple: PropTypes.bool.isRequired,
  friendlyName: PropTypes.string.isRequired,
  values: PropTypes.arrayOf(PropTypes.string),
});

const multiPreamble = [{ value: '*', label: 'Select All' }, { value: '-', label: 'Clear' }];

export default class Filters extends React.Component {
  static propTypes = {
    onChange: PropTypes.func.isRequired,
    filters: PropTypes.arrayOf(Filter).isRequired,
  }

  filterValue = (value, filter) => {
    let firstValue = value;
    if (isArray(value)) {
      firstValue = value[0];
    }

    if (filter.column.type === 'date') {
      if (firstValue && moment.isMoment(firstValue)) {
        return firstValue.format(this.props.clientConfig.dateFormat);
      }
    } else if (filter.column.type === 'datetime') {
      if (firstValue && moment.isMoment(firstValue)) {
        return firstValue.format(this.props.clientConfig.dateTimeFormat);
      }
    }

    return firstValue;
  }

  render() {
    if (this.props.filters.length === 0) {
      return null;
    }

    return (
      <div className="parameter-container container bg-white">
        <div className="row">
          {this.props.filters.map(filter => (
            <div className="col-sm-6 p-l-0 filter-container">
              <label>{filter.friendlyName}</label>
              <Select
                id={'filter-' + filter.name}
                options={(filter.multiple ? multiPreamble : []) + filter.values.map(v => this.filterValue(v, filter))}
                value={filter.current}
                clearable={false}
                onChange={this.props.onChange}
                placeholder={`Select value for ${filter.friendlyName}...`}
              />
            </div>
          ))}
        </div>
      </div>

    );
  }
}
