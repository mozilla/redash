import React from 'react';
import PropTypes from 'prop-types';
import { each, extend, get, sortBy, values } from 'lodash';

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

function addPointToSeries(point, seriesCollection, seriesName) {
  if (seriesCollection[seriesName] === undefined) {
    seriesCollection[seriesName] = {
      name: seriesName,
      type: 'column',
      data: [],
    };
  }

  seriesCollection[seriesName].data.push(point);
}

function chartData(mapping, data) {
  const series = {};

  data.rows.forEach((row) => {
    let point = { $raw: row };
    let seriesName;
    let xValue = 0;
    const yValues = {};
    let eValue = null;
    let sizeValue = null;

    each(row, (v, definition) => {
      definition = '' + definition;
      const definitionParts = definition.split('::') || definition.split('__');
      const name = definitionParts[0];
      const type = mapping ? mapping[definition] : definitionParts[1];
      let value = v;

      if (type === 'unused') {
        return;
      }

      if (type === 'x') {
        xValue = value;
        point[type] = value;
      }
      if (type === 'y') {
        if (value == null) {
          value = 0;
        }
        yValues[name] = value;
        point[type] = value;
      }
      if (type === 'yError') {
        eValue = value;
        point[type] = value;
      }

      if (type === 'series') {
        seriesName = String(value);
      }

      if (type === 'size') {
        point[type] = value;
        sizeValue = value;
      }

      if (type === 'multiFilter' || type === 'multi-filter') {
        seriesName = String(value);
      }
    });

    if (seriesName === undefined) {
      each(yValues, (yValue, ySeriesName) => {
        point = { x: xValue, y: yValue, $raw: point.$raw };
        if (eValue !== null) {
          point.yError = eValue;
        }

        if (sizeValue !== null) {
          point.size = sizeValue;
        }
        addPointToSeries(point, series, ySeriesName);
      });
    } else {
      addPointToSeries(point, series, seriesName);
    }
  });
  return sortBy(values(series), 'name');
}

export default class ChartRenderer extends React.PureComponent {
  static DEFAULT_OPTIONS = DEFAULT_OPTIONS;

  static propTypes = {
    // eslint-disable-next-line react/no-unused-prop-types
    data: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired,
    filters: PropTypes.array.isRequired,
  }

  render() {
    const data = chartData(this.props.options.columnMapping, this.props.data);
    const chartSeries = sortBy(data, (o, s) => get(o.seriesOptions, [s && s.name, 'zIndex'], 0));

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
