import moment from 'moment';
import React from 'react';
import PropTypes from 'prop-types';
import DatePicker from 'antd/lib/date-picker';

export default function DateTimeInput({
  value,
  withSeconds,
  onSelect,
  // eslint-disable-next-line react/prop-types
  clientConfig,
}) {
  const format = (clientConfig.dateFormat || 'YYYY-MM-DD') +
    (withSeconds ? ' HH:mm:ss' : ' HH:mm');
  const additionalAttributes = {};
  if (value && value.isValid()) {
    additionalAttributes.defaultValue = value;
  }
  return (
    <DatePicker
      showTime
      {...additionalAttributes}
      format={format}
      placeholder="Select Date and Time"
      onChange={onSelect}
    />
  );
}

DateTimeInput.propTypes = {
  value: (props, propName, componentName) => {
    const value = props[propName];
    if ((value !== null) && !moment.isMoment(value)) {
      return new Error('Prop `' + propName + '` supplied to `' + componentName +
        '` should be a Moment.js instance.');
    }
  },
  withSeconds: PropTypes.bool,
  onSelect: PropTypes.func,
};

DateTimeInput.defaultProps = {
  value: null,
  withSeconds: false,
  onSelect: () => {},
};
