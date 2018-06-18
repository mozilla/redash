import _ from 'lodash';
import { react2angular } from 'react2angular';
import { getColumnCleanName } from '@/services/query-result';
import { createFormatter } from '@/lib/value-format';
import TableEditorColumns from '@/react-components/TableEditorColumns';
import DynamicTable from '@/react-components/DynamicTable';
import GridEditor from '@/react-components/GridEditor';
import template from './table.html';
import './table-editor.less';

const DEFAULT_OPTIONS = {
  itemsPerPage: 15,
  autoHeight: true,
  defaultRows: 14,
  defaultColumns: 3,
  minColumns: 2,
};

function getColumnContentAlignment(type) {
  return ['integer', 'float', 'boolean', 'date', 'datetime'].indexOf(type) >= 0 ? 'right' : 'left';
}

function getDefaultColumnsOptions(columns) {
  const displayAs = {
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'datetime',
    datetime: 'datetime',
  };

  return _.map(columns, (col, index) => ({
    name: col.name,
    type: col.type,
    displayAs: displayAs[col.type] || 'string',
    visible: true,
    order: 100000 + index,
    title: getColumnCleanName(col.name),
    allowSearch: false,
    alignContent: getColumnContentAlignment(col.type),
    // `string` cell options
    allowHTML: true,
    highlightLinks: false,
  }));
}

function getDefaultFormatOptions(column, clientConfig) {
  const dateTimeFormat = {
    date: clientConfig.dateFormat || 'DD/MM/YYYY',
    datetime: clientConfig.dateTimeFormat || 'DD/MM/YYYY HH:mm',
  };
  const numberFormat = {
    integer: clientConfig.integerFormat || '0,0',
    float: clientConfig.floatFormat || '0,0.00',
  };
  return {
    dateTimeFormat: dateTimeFormat[column.type],
    numberFormat: numberFormat[column.type],
    booleanValues: clientConfig.booleanValues || ['false', 'true'],
    // `image` cell options
    imageUrlTemplate: '{{ @ }}',
    imageTitleTemplate: '{{ @ }}',
    imageWidth: '',
    imageHeight: '',
    // `link` cell options
    linkUrlTemplate: '{{ @ }}',
    linkTextTemplate: '{{ @ }}',
    linkTitleTemplate: '{{ @ }}',
    linkOpenInNewTab: true,
  };
}

function wereColumnsReordered(queryColumns, visualizationColumns) {
  queryColumns = _.map(queryColumns, col => col.name);
  visualizationColumns = _.map(visualizationColumns, col => col.name);

  // Some columns may be removed - so skip them (but keep original order)
  visualizationColumns = _.filter(visualizationColumns, col => _.includes(queryColumns, col));
  // Pick query columns that were previously saved with viz (but keep order too)
  queryColumns = _.filter(queryColumns, col => _.includes(visualizationColumns, col));

  // Both array now have the same size as they both contains only common columns
  // (in fact, it was an intersection, that kept order of items on both arrays).
  // Now check for equality item-by-item; if common columns are in the same order -
  // they were not reordered in editor
  for (let i = 0; i < queryColumns.length; i += 1) {
    if (visualizationColumns[i] !== queryColumns[i]) {
      return true;
    }
  }
  return false;
}

function getColumnsOptions(columns, visualizationColumns) {
  const options = getDefaultColumnsOptions(columns);

  if ((wereColumnsReordered(columns, visualizationColumns))) {
    visualizationColumns = _.fromPairs(_.map(
      visualizationColumns,
      (col, index) => [col.name, _.extend({}, col, { order: index })],
    ));
  } else {
    visualizationColumns = _.fromPairs(_.map(
      visualizationColumns,
      col => [col.name, _.omit(col, 'order')],
    ));
  }

  _.each(options, col => _.extend(col, visualizationColumns[col.name]));

  return _.sortBy(options, 'order');
}

function getColumnsToDisplay(columns, options, clientConfig) {
  columns = _.fromPairs(_.map(columns, col => [col.name, col]));
  let result = _.map(options, col => _.extend(
    getDefaultFormatOptions(col, clientConfig),
    col,
    columns[col.name],
  ));

  result = _.map(result, col => _.extend(col, {
    formatFunction: createFormatter(col),
  }));

  return _.sortBy(_.filter(result, 'visible'), 'order');
}

function GridRenderer(clientConfig) {
  return {
    restrict: 'E',
    scope: {
      queryResult: '=',
      options: '=',
    },
    template,
    replace: false,
    controller($scope) {
      $scope.gridColumns = [];
      $scope.gridRows = [];

      function update() {
        if ($scope.queryResult.getData() == null) {
          $scope.gridColumns = [];
          $scope.filters = [];
        } else {
          $scope.filters = $scope.queryResult.getFilters();
          $scope.gridRows = $scope.queryResult.getData();
          const columns = $scope.queryResult.getColumns();
          const columnsOptions = getColumnsOptions(columns, _.extend({}, $scope.options).columns);
          $scope.gridColumns = getColumnsToDisplay(columns, columnsOptions, clientConfig);
        }
      }

      $scope.$watch('queryResult && queryResult.getData()', (queryResult) => {
        if (queryResult) {
          update();
        }
      });

      $scope.$watch('options', (newValue, oldValue) => {
        if (newValue !== oldValue) {
          update();
        }
      }, true);
    },
  };
}
export default function init(ngModule) {
  ngModule.directive('gridRenderer', GridRenderer);
  ngModule.component('dynamicTable', react2angular(DynamicTable));
  ngModule.component('gridEditor', react2angular(GridEditor, null, ['clientConfig']));
  ngModule.component('tableEditorColumns', react2angular(TableEditorColumns));
  ngModule.config((VisualizationProvider) => {
    const defaultOptions = DEFAULT_OPTIONS;

    VisualizationProvider.registerVisualization({
      type: 'TABLE',
      name: 'Table',
      renderTemplate: '<grid-renderer options="visualization.options" query-result="queryResult"></grid-renderer>',
      editorTemplate: '<grid-editor visualization="visualization" update-visualization="updateVisualization" query-result="queryResult"></grid-editor>',
      defaultOptions,
    });
  });
}
