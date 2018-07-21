import {
  has, partial, intersection, without, includes,
  sortBy, each, map, keys, difference,
} from 'lodash';
import React from 'react';
import { react2angular } from 'react2angular';

import ChartEditor from '@/react-components/ChartEditor';
import ChartRenderer from '@/react-components/ChartRenderer';
import visualizationRegistry from '@/visualizations/registry';
import editorTemplate from './chart-editor.html';

// eslint-disable-next-line no-unused-vars
function OldChartEditor(clientConfig) {
  return {
    restrict: 'E',
    template: editorTemplate,
    scope: {
      queryResult: '=',
      options: '=?',
    },
    link(scope) {
      function refreshColumns() {
        scope.columns = scope.queryResult.getColumns();
        scope.columnNames = map(scope.columns, i => i.name);
        if (scope.columnNames.length > 0) {
          each(difference(keys(scope.options.columnMapping), scope.columnNames), (column) => {
            delete scope.options.columnMapping[column];
          });
        }
      }

      function refreshColumnsAndForm() {
        refreshColumns();
        if (!scope.queryResult.getData() ||
            scope.queryResult.getData().length === 0 ||
            scope.columns.length === 0) {
          return;
        }
        scope.form.yAxisColumns = intersection(scope.form.yAxisColumns, scope.columnNames);
        if (!includes(scope.columnNames, scope.form.xAxisColumn)) {
          scope.form.xAxisColumn = undefined;
        }
        if (!includes(scope.columnNames, scope.form.groupby)) {
          scope.form.groupby = undefined;
        }
      }

      function refreshSeries() {
        const chartData = scope.queryResult.getChartData(scope.options.columnMapping);
        const seriesNames = map(chartData, i => i.name);
        const existing = keys(scope.options.seriesOptions);
        each(difference(seriesNames, existing), (name) => {
          scope.options.seriesOptions[name] = {
            type: scope.options.globalSeriesType,
            yAxis: 0,
          };
          scope.form.seriesList.push(name);
        });
        each(difference(existing, seriesNames), (name) => {
          scope.form.seriesList = without(scope.form.seriesList, name);
          delete scope.options.seriesOptions[name];
        });

        if (scope.options.globalSeriesType === 'pie') {
          const uniqueValuesNames = new Set();
          each(chartData, (series) => {
            each(series.data, (row) => {
              uniqueValuesNames.add(row.x);
            });
          });
          const valuesNames = [];
          uniqueValuesNames.forEach(v => valuesNames.push(v));

          // initialize newly added values
          const newValues = difference(valuesNames, keys(scope.options.valuesOptions));
          each(newValues, (name) => {
            scope.options.valuesOptions[name] = {};
            scope.form.valuesList.push(name);
          });
          // remove settings for values that are no longer available
          each(keys(scope.options.valuesOptions), (name) => {
            if (valuesNames.indexOf(name) === -1) {
              delete scope.options.valuesOptions[name];
            }
          });
          scope.form.valuesList = intersection(scope.form.valuesList, valuesNames);
        }
      }

      function setColumnRole(role, column) {
        scope.options.columnMapping[column] = role;
      }

      function unsetColumn(column) {
        setColumnRole('unused', column);
      }

      refreshColumns();

      scope.$watch('options.columnMapping', () => {
        if (scope.queryResult.status === 'done') {
          refreshSeries();
        }
      }, true);

      scope.$watch(() => [scope.queryResult.getId(), scope.queryResult.status], (changed) => {
        if (!changed[0] || changed[1] !== 'done') {
          return;
        }

        refreshColumnsAndForm();
        refreshSeries();
      }, true);

      scope.form = {
        yAxisColumns: [],
        seriesList: sortBy(keys(scope.options.seriesOptions), name =>
          scope.options.seriesOptions[name].zIndex),
        valuesList: keys(scope.options.valuesOptions),
      };

      scope.$watchCollection('form.seriesList', (value) => {
        each(value, (name, index) => {
          scope.options.seriesOptions[name].zIndex = index;
          scope.options.seriesOptions[name].index = 0; // is this needed?
        });
      });


      scope.$watchCollection('form.yAxisColumns', (value, old) => {
        each(old, unsetColumn);
        each(value, partial(setColumnRole, 'y'));
      });

      scope.$watch('form.xAxisColumn', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) { setColumnRole('x', value); }
      });

      scope.$watch('form.errorColumn', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) {
          setColumnRole('yError', value);
        }
      });

      scope.$watch('form.sizeColumn', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) {
          setColumnRole('size', value);
        }
      });


      scope.$watch('form.groupby', (value, old) => {
        if (old !== undefined) {
          unsetColumn(old);
        }
        if (value !== undefined) {
          setColumnRole('series', value);
        }
      });

      if (!has(scope.options, 'legend')) {
        scope.options.legend = { enabled: true };
      }

      if (scope.columnNames) {
        each(scope.options.columnMapping, (value, key) => {
          if (scope.columnNames.length > 0 && !includes(scope.columnNames, key)) {
            return;
          }
          if (value === 'x') {
            scope.form.xAxisColumn = key;
          } else if (value === 'y') {
            scope.form.yAxisColumns.push(key);
          } else if (value === 'series') {
            scope.form.groupby = key;
          } else if (value === 'yError') {
            scope.form.errorColumn = key;
          } else if (value === 'size') {
            scope.form.sizeColumn = key;
          }
        });
      }

      scope.templateHint = `
        <div class="p-b-5">Use special names to access additional properties:</div>
        <div><code>{{ @@name }}</code> series name;</div>
        <div><code>{{ @@x }}</code> x-value;</div>       
        <div><code>{{ @@y }}</code> y-value;</div>
        <div><code>{{ @@yPercent }}</code> relative y-value;</div>
        <div><code>{{ @@yError }}</code> y deviation;</div>       
        <div><code>{{ @@size }}</code> bubble size;</div>       
        <div class="p-t-5">Also, all query result columns can be referenced using 
          <code class="text-nowrap">{{ column_name }}</code> syntax.</div>       
      `;
    },
  };
}

const ColorBox = props => (
  <span style={{
    width: 12,
    height: 12,
    'background-color': props.color,
    display: 'inline-block',
    'margin-right': 5,
    }}
  />
);

export default function init(ngModule) {
  ngModule.component('colorBox', react2angular(ColorBox));
  ngModule.component('chartRenderer', react2angular(ChartRenderer, null, ['clientConfig']));
  ngModule.component('chartEditor', react2angular(ChartEditor, null, ['clientConfig']));
  visualizationRegistry.CHART = {
    renderer: ChartRenderer,
    editor: ChartEditor,
    defaultOptions: ChartRenderer.DEFAULT_OPTIONS,
  });
}
