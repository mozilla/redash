/* eslint-disable no-nested-ternary */

import React from 'react';
import PropTypes from 'prop-types';
import { SortableContainer, SortableElement, SortableHandle, arrayMove } from 'react-sortable-hoc';
import DateTimeInput from '@/components/DateTimeInput';
import DateTimeRangeInput from '@/components/DateTimeRangeInput';
import QueryBasedParameter from './QueryBasedParameter';

function extractEnumOptions(enumOptions) {
  if (enumOptions) {
    return enumOptions.split('\n');
  }
  return [];
}

export default class Parameters extends React.Component {
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

  onParamChange = (e, param) => {
    if (this.props.syncValues) {
      const searchParams = new URLSearchParams(window.location.search);
      this.props.parameters.forEach((p) => {
        searchParams.set(`p_${p.name}_${p.queryId}`, p.value);
      });
      history.pushState(null, '', `${window.location.pathname}?${searchParams.toString()}`);
    }
    param.ngModel = e.target.value;
    this.props.onChange(e);
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
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('hideParameters') === 'true' || !this.props.parameters) {
      return null;
    }
    /* eslint-disable-next-line jsx-a11y/label-has-for */
    const LabelHandle = SortableHandle(({ value }) => <label className="parameter-label" htmlFor={value.name}>{value.title}</label>);
    const SortableItem = SortableElement(({ value }) => (
      <div className="form-group m-r-10">
        <LabelHandle value={value} />
        {this.props.editable ? (
          <button
            className="btn btn-default btn-xs"
            onClick={() => this.showParameterSettings(value)}
          >
            <i className="zmdi zmdi-settings" />
          </button>) : ''}
        {// Behind every great fortune is a great crime.
        value.type === 'datetime-local' ?
          <DateTimeInput clientConfig={this.props.clientConfig} value={value.ngModel} onSelect={e => this.onParamChange(e, value)} /> :
         value.type === 'datetime-with-seconds' ?
          <DateTimeInput clientConfig={this.props.clientConfig} value={value.ngModel} onSelect={e => this.onParamChange(e, value)} withSeconds /> :
         value.type === 'date' ?
          <DateTimeInput clientConfig={this.props.clientConfig} value={value.ngModel} onSelect={e => this.onParamChange(e, value)} /> :
        ['datetime-range', 'date-range'].find(value.type) ?
          <DateTimeRangeInput clientConfig={this.props.clientConfig} value={value.ngModel} onSelect={e => this.onParamChange(e, value)} /> :
         value.type === 'datetime-range-with-seconds' ?
          <DateTimeRangeInput clientConfig={this.props.clientConfig} value={value.ngModel} onSelect={e => this.onParamChange(e, value)} withSeconds /> :
         value.type === 'enum' ? (
           <select id={value.name} value={value.value} onChange={e => this.onParamChange(e, value)} className="form-control">
             {extractEnumOptions(value.enumOptions).map(opt => <option value={opt}>{opt}</option>)}
           </select>) :
         value.type === 'query' ?
           <QueryBasedParameter param={value} onChange={e => this.onParamChange(e, value)} queryId={value.queryId} /> :
           <input type={value.type} className="form-control" value={value.ngModel} onChange={e => this.onParamChange(e, value)} />}
      </div>
    ));

    const SortableList = SortableContainer(({ items }) => (
      <div className="parameter-container form-inline bg-white">
        {items.map((param, index) => (
          <SortableItem key={`item-${param.name}`} index={index} value={param} />
        ))}
      </div>
    ));

    return <SortableList useDragHandle axis="x" distance={4} items={this.props.parameters} onSortEnd={this.onSortEnd} />;
  }
}
