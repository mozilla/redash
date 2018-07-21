/* eslint-disable no-nested-ternary */

import { capitalize, includes, words } from 'lodash';
import { react2angular } from 'react2angular';
import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import Select from 'antd/lib/select';
import Modal from 'antd/lib/modal';
import { SortableContainer, SortableElement, SortableHandle, arrayMove } from 'react-sortable-hoc';
import DateTimeInput from './DateTimeInput';
import DateTimeRangeInput from '@/components/DateTimeRangeInput';
import QueryBasedParameter from './QueryBasedParameter';
import parameterSettingsTemplate from './parameter-settings.html';

function humanize(str) {
  return capitalize(words(str).join(' '));
}

const ParameterSettingsComponent = {
  template: parameterSettingsTemplate,
  bindings: {
    resolve: '<',
    close: '&',
    dismiss: '&',
  },
  controller($sce, Query) {
    'ngInject';

    this.trustAsHtml = html => $sce.trustAsHtml(html);
    this.parameter = this.resolve.parameter;
    this.isNewParameter = this.parameter.name === '';
    this.shouldGenerateTitle = this.isNewParameter && this.parameter.title === '';

    this.parameterAlreadyExists = name => includes(this.resolve.existingParameters, name);

    if (this.parameter.queryId) {
      Query.get({ id: this.parameter.queryId }, (query) => {
        this.queries = [query];
      });
    }

    this.searchQueries = (term) => {
      if (!term || term.length < 3) {
        return;
      }

      Query.query({ q: term }, (results) => {
        this.queries = results.results;
      });
    };

    this.updateTitle = () => {
      if (this.shouldGenerateTitle) {
        this.parameter.title = humanize(this.parameter.name);
      }
    };
  },
};


function extractEnumOptions(enumOptions) {
  if (enumOptions) {
    return enumOptions.split('\n');
  }
  return [];
}

function formatParameter(param) {
  if (
    param.type === 'date' ||
      param.type === 'datetime-local' ||
      param.type === 'datetime-with-seconds'
  ) {
    return moment(param.value).toDate();
  } else if (param.type === 'number') {
    return parseInt(param.value, 10);
  }
  return param.value;
}

function parseParameter(origParam, value) {
  const param = { ...origParam };
  if (value && param.type === 'date') {
    param.value = moment(value).format('YYYY-MM-DD');
  } else if (value && param.type === 'datetime-local') {
    param.value = moment(value).format('YYYY-MM-DD HH:mm');
  } else if (value && param.type === 'datetime-with-seconds') {
    param.value = moment(value).format('YYYY-MM-DD HH:mm:ss');
  } else {
    param.value = value;
  }
  return param;
}

export default class Parameters extends React.Component {
  static propTypes = {
    clientConfig: PropTypes.object.isRequired,
    parameters: PropTypes.array.isRequired,
    syncValues: PropTypes.bool.isRequired,
    editable: PropTypes.bool.isRequired,
    onChange: PropTypes.func,
  };

  static defaultProps = {
    onChange: () => null,
  }

  constructor(props) {
    super(props);
    this.state = {
      showSettings: null,
      querySearchResults: [],
    };
  }

  onParamChange = (e, param, index) => {
    if (this.props.syncValues) {
      const searchParams = new window.URLSearchParams(window.location.search);
      this.parameters.forEach((p) => {
        searchParams.set(`p_${p.name}_${p.queryId}`, p.value);
      });
      window.history.pushState(null, '', `${window.location.pathname}?${searchParams.toString()}`);
    }
    const newParams = [...this.props.parameters];
    newParams[index] = parseParameter(param, e.target.value);
    this.props.onChange(newParams);
  };

  onSortEnd = ({ oldIndex, newIndex }) => {
    this.props.onChange(arrayMove(this.props.parameters, oldIndex, newIndex));
  };

  showParameterSettings = param => this.setState({ showSettings: param })

  searchQueries = searchText => searchText.length > 3 && window.fetch(`${this.props.clientConfig.basePath}api/queries/search?q=${searchText}`).then(r => r.json()).then(qs => this.setState({ querySearchResults: qs }))

  render() {
    const searchParams = new window.URLSearchParams(window.location.search);
    if (searchParams.get('hideParameters') === 'true' || !this.props.parameters) {
      return null;
    }
    const LabelHandle = SortableHandle(({ value }) => <label className="parameter-label" htmlFor={value.name}>{value.title}</label>);
    const SortableItem = SortableElement(({ value, sortIndex }) => {
      const onChange = e => this.onParamChange(e, value, sortIndex);
      const paramText = formatParameter(value);
      let paramInput;
      if (value.type === 'enum') {
        paramInput = (
          <select id={value.name} value={value.value} onChange={e => this.onParamChange(e, value)} className="form-control">
            {extractEnumOptions(value.enumOptions).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>);
      } else if (value.type === 'query') {
        paramInput = <QueryBasedParameter param={value} onChange={onChange} queryId={value.queryId} />;
      } else if (value.type === 'datetime-local' || value.type === 'date') {
        paramInput = (
          <DateTimeInput
            clientConfig={this.props.clientConfig}
            value={value.ngModel}
            onSelect={e => this.onParamChange(e, value)}
          />);
      } else if (value.type === 'datetime-with-seconds') {
        paramInput = (
          <DateTimeInput
            clientConfig={this.props.clientConfig}
            value={value.ngModel}
            onSelect={e => this.onParamChange(e, value)}
            withSeconds
          />);
      } else if (['datetime-range', 'date-range'].find(value.type)) {
        paramInput = (
          <DateTimeRangeInput
            clientConfig={this.props.clientConfig}
            value={value.ngModel}
            onSelect={e => this.onParamChange(e, value)}
          />);
      } else if (value.type === 'datetime-range-with-seconds') {
        paramInput = (
          <DateTimeRangeInput
            clientConfig={this.props.clientConfig}
            value={value.ngModel}
            onSelect={e => this.onParamChange(e, value)}
            withSeconds
          />);
      } else {
        paramInput = <input type={value.type} id={value.name} className="form-control" value={paramText} onChange={onChange} />;
      }
      return (
        <div className="form-group m-r-10">
          <LabelHandle value={value} />
          {this.props.editable ? (
            <button
              className="btn btn-default btn-xs"
              onClick={() => this.showParameterSettings(value)}
            >
              <i className="zmdi zmdi-settings" />
            </button>) : ''}
          {paramInput}
        </div>
      );
    });

    const SortableList = SortableContainer(({ items }) => (
      <div className="parameter-container form-inline bg-white">
        {items.map((param, index) => (
          <SortableItem key={`item-${param.name}`} index={index} value={param} />
        ))}
      </div>
    ));
    let modal = '';
    if (this.state.showSettings) {
      modal = (
        <Modal
          visible={!!this.state.showSettings}
          title={this.state.showSettings.name}
          footer={null}
        >
          <div className="form">
            <div className="form-group">
              <label>Title</label>
              <input type="text" className="form-control" value={this.state.showSettings.title} onChange={this.setParamTitle} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={this.showSettings.type} onChange={this.setParamType} className="form-control">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="enum">Dropdown List</option>
                <option value="query">Query Based Dropdown List</option>
                <option value="date">Date</option>
                <option value="datetime-local">Date and Time</option>
                <option value="datetime-with-seconds">Date and Time (with seconds)</option>
              </select>
            </div>
            <div className="form-group">
              <label>
                <input type="checkbox" className="form-inline" checked={this.state.showSettings.global} onChange={this.setParamGlobal} />
                Global
              </label>
            </div>
            {this.state.showSettings.type === 'enum' ?
              <div className="form-group">
                <label>Dropdown List Values (newline delimited)</label>
                <textarea className="form-control" rows="3" value={this.state.showSettings.enumOptions} onChange={this.setParamEnumOptions} />
              </div> : this.state.showSettings.type === 'query' ?
                <div className="form-group">
                  <label>Query to load dropdown values from:</label>
                  <Select
                    value={this.state.showSettings.queryId}
                    placeholder="Search a query by name"
                    onSearch={this.searchQueries}
                    onChange={this.setQuery}
                    notFoundContent={null}
                  >
                    {this.state.querySearchResults.map(q => <Select.Option key={q.id}>{q.name}</Select.Option>)}
                  </Select>
                </div> : '' }
          </div>
        </Modal>
      );
    }
    return (
      <React.Fragment>
        {modal}
        <SortableList useDragHandle axis="x" distance={4} items={this.props.parameters} onSortEnd={this.onSortEnd} />
      </React.Fragment>
    );
  }
}

export default function init(ngModule) {
  ngModule.component('parameters', react2angular(Parameters, null, ['Query', '$uibModal']));
  ngModule.component('queryBasedParameter', react2angular(QueryBasedParameter, null, ['Query']));
  ngModule.component('parameterSettings', ParameterSettingsComponent);
}
