import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import { Modal } from 'react-bootstrap';
import { find } from 'lodash';

function searchQueries(basePath, searchText) {
  return fetch(`${basePath}api/queries?q=${searchText}`)
    .then(r => r.json())
    .then(qs => ({ options: qs.results.map(q => ({ value: q.id, label: q.name })) }));
}

export default function ParameterSettings({
  show,
  onHide,
  parameter,
  updateParameter,
  isNewParameter,
  parameters,
  clientConfig,
}) {
  if (!parameter) {
    return null;
  }
  const setParamName = e => updateParameter({ name: e.target.value });
  const setParamType = e => updateParameter({ type: e.target.value });
  const setParamTitle = e => updateParameter({ title: e.target.value });
  const setParamGlobal = e => updateParameter({ global: e.target.checked });
  const setParamEnumOptions = e => updateParameter({ enumOptions: e.target.value });
  const setQueryId = item => updateParameter({ queryId: item.value, queryName: item.label });
  let extraField = null;
  if (parameter.type === 'enum') {
    extraField = (
      <div className="form-group">
        <label>Dropdown List Values (newline delimited)</label>
        <textarea className="form-control" rows="3" value={parameter.enumOptions} onChange={setParamEnumOptions} />
      </div>);
  } else if (parameter.type === 'query') {
    extraField = (
      <div className="form-group">
        <label>Query to load dropdown values from:</label>
        <Select.Async
          value={{ label: parameter.queryName, value: parameter.queryId }}
          placeholder="Search a query by name"
          loadOptions={searchText => (searchText.length >= 3 ? searchQueries(clientConfig.basePath, searchText) : Promise.resolve([]))}
          onChange={setQueryId}
        />
      </div>);
  }
  const parameterAlreadyExists = find(parameters.slice(0, -1), { name: parameter.name });
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{parameter.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="form">
          {isNewParameter ?
            <div className={'form-group' + (parameterAlreadyExists ? ' has-error' : null)}>
              <label>Keyword</label>
              <input type="text" className="form-control" value={parameter.name} onChange={setParamName} autoFocus />
              <div className="help-block">
                {parameterAlreadyExists ? 'Parameter with this name already exists.' : 'This is what will be added to your query editor' + (parameter.name !== '' ? `: {{ ${parameter.name} }}` : '') }
              </div>
            </div> : null }
          <div className="form-group">
            <label>Title</label>
            <input type="text" className="form-control" value={parameter.title} onChange={setParamTitle} />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={parameter.type} onChange={setParamType} className="form-control">
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
              <input type="checkbox" className="form-inline" checked={parameter.global} onChange={setParamGlobal} />
              Global
            </label>
          </div>
          {extraField}
        </div>
      </Modal.Body>
    </Modal>
  );
}

ParameterSettings.propTypes = {
  clientConfig: PropTypes.object.isRequired,
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  isNewParameter: PropTypes.bool,
  parameter: PropTypes.object,
  parameters: PropTypes.array,
  updateParameter: PropTypes.func.isRequired,
};

ParameterSettings.defaultProps = {
  parameter: null,
  isNewParameter: false,
  parameters: [],
};
