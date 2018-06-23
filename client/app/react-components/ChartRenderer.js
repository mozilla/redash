import React from 'react';
import PropTypes from 'prop-types';
import { extend, get, isUndefined, sortBy } from 'lodash';

import PlotlyChart from './PlotlyChart';

const DEFAULT_OPTIONS = {
  globalSeriesType: 'column',
  sortX: true,
  legend: { enabled: true },
  yAxis: [{ type: 'linear' }, { type: 'linear', opposite: true }],
  xAxis: { type: '-', labels: { enabled: true } },
  error_y: { type: 'data', visible: true },
  series: { stacking: null, error_y: { type: 'data', visible: true } },
  seriesOptions: {},
  valuesOptions: {},
  columnMapping: {},

  // showDataLabels: false, // depends on chart type
  numberFormat: '0,0[.]00000',
  percentFormat: '0[.]00%',
  // dateTimeFormat: 'DD/MM/YYYY HH:mm', // will be set from clientConfig
  textFormat: '', // default: combination of {{ @@yPercent }} ({{ @@y }} ± {{ @@yError }})

  defaultColumns: 3,
  defaultRows: 8,
  minColumns: 1,
  minRows: 5,
};

export default class ChartRenderer extends React.PureComponent {
  static propTypes = {
    // eslint-disable-next-line react/no-unused-prop-types
    queryResult: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired,
  }

  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;

  render() {
    let chartSeries;
    if (!isUndefined(this.props.queryResult) && this.props.queryResult.getData()) {
      const data = this.props.queryResult.getChartData(this.props.options.columnMapping);
      chartSeries = sortBy(data, (o, s) => get(o.seriesOptions, [s && s.name, 'zIndex'], 0));
    } else {
      chartSeries = [];
    }

    return (
      <PlotlyChart
        options={extend({
          showDataLabels: this.props.options.globalSeriesType === 'pie',
          dateTimeFormat: this.props.clientConfig.dateTimeFormat,
          }, DEFAULT_OPTIONS, this.props.options)}
        series={chartSeries}
        customCode={this.props.options.customCode}
      />
    );
  }
}
