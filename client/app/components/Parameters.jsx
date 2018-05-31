import { capitalize, includes, words } from 'lodash';
import { react2angular } from 'react2angular';
import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';

import { SortableContainer, SortableElement, SortableHandle, arrayMove } from 'react-sortable-hoc';
import DateTimeInput from '@/components/DateTimeInput';
import DateTimeRangeInput from '@/components/DateTimeRangeInput';
import QueryBasedParameter from './QueryBasedParameter';
import parameterSettingsTemplate from './parameter-settings.html';

function humanize(str) {
  return capitalize(words(str).join(' '));
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
const LabelHandle = SortableHandle(({ value }) => <label className="parameter-label" htmlFor={value.name}>{value.title}</label>);
const SortableItem = SortableElement(({
  value,
  sortIndex,
  editable,
  showParameterSettings,
  onParamChange,
  clientConfig,
}) => {
  const onChange = e => onParamChange(e.target.value, value, sortIndex);
  const paramText = formatParameter(value);
  let paramInput;
  if (value.type === 'enum') {
    paramInput = (
      <select id={value.name} value={value.value} onChange={onChange} className="form-control">
        {extractEnumOptions(value.enumOptions).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>);
  } else if (value.type === 'query') {
    paramInput = <QueryBasedParameter param={value} onChange={onChange} queryId={value.queryId} />;
  } else if (value.type === 'datetime-local' || value.type === 'date') {
    paramInput = (
      <DateTimeInput
        clientConfig={clientConfig}
        value={value.ngModel}
        onSelect={onChange}
      />);
  } else if (value.type === 'datetime-with-seconds') {
    paramInput = (
      <DateTimeInput
        clientConfig={clientConfig}
        value={value.ngModel}
        onSelect={onChange}
        withSeconds
      />);
  } else if (value.type === 'datetime-range' || value.type === 'date-range') {
    paramInput = (
      <DateTimeRangeInput
        clientConfig={clientConfig}
        value={value.ngModel}
        onSelect={onChange}
      />);
  } else if (value.type === 'datetime-range-with-seconds') {
    paramInput = (
      <DateTimeRangeInput
        clientConfig={clientConfig}
        value={value.ngModel}
        onSelect={onChange}
        withSeconds
      />);
  } else {
    paramInput = <input type={value.type} id={value.name} className="form-control" value={paramText} onChange={onChange} />;
  }
  return (
    <div className="form-group m-r-10">
      <LabelHandle value={value} />
      {editable ? (
        <button
          className="btn btn-default btn-xs"
          onClick={() => showParameterSettings(value)}
        >
          <i className="zmdi zmdi-settings" />
        </button>) : ''}
      {paramInput}
    </div>
  );
});

const SortableList = SortableContainer(({ items, ...props }) => (
  <div className="parameter-container form-inline bg-white">
    {items.map((param, index) => (
      <SortableItem key={`item-${param.name}`} index={index} value={param} {...props} />
    ))}
  </div>
));

class Parameters extends React.Component {
  static propTypes = {
    parameters: PropTypes.array.isRequired,
    query: PropTypes.object.isRequired,
    syncValues: PropTypes.bool.isRequired,
    editable: PropTypes.bool.isRequired,
    onChange: PropTypes.func,
  };

  static defaultProps = {
    onChange: () => null,
  }

  onParamChange = (value, param) => {
    if (this.props.syncValues) {
      const searchParams = new window.URLSearchParams(window.location.search);
      this.props.parameters.forEach((p) => {
        searchParams.set(`p_${p.name}_${p.queryId}`, p.value);
      });
      window.history.pushState(null, '', `${window.location.pathname}?${searchParams.toString()}`);
    }
    param.ngModel = value;
    this.props.onChange(value);
  };

  onSortEnd = ({ oldIndex, newIndex }) => {
    this.props.query.options.parameters = arrayMove(this.props.parameters, oldIndex, newIndex);
  };

  showParameterSettings = (param) => {
    this.props.$uibModal.open({
      component: 'parameterSettings',
      resolve: {
        parameter: param,
      },
    });
  }

  render() {
    const searchParams = new window.URLSearchParams(window.location.search);
    if (searchParams.get('hideParameters') === 'true' || !this.props.parameters) {
      return null;
    }
    return (
      <SortableList
        editable={this.props.editable}
        useDragHandle
        axis="x"
        distance={4}
        items={this.props.parameters}
        onSortEnd={this.onSortEnd}
        showParameterSettings={this.showParameterSettings}
        onParamChange={this.onParamChange}
        clientConfig={this.props.clientConfig}
      />
    );
  }
}

export default function init(ngModule) {
  ngModule.component('parameters', react2angular(Parameters, null, ['Query', '$uibModal']));
  ngModule.component('queryBasedParameter', react2angular(QueryBasedParameter, null, ['Query']));
  ngModule.component('parameterSettings', ParameterSettingsComponent);
}

init.init = true;
