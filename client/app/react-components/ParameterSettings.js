import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import { Modal } from 'react-bootstrap';

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
  clientConfig,
}) {
  if (!parameter) {
    // for now
    return null;
  }
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
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>{parameter.name}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="form">
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
  parameter: PropTypes.object.isRequired,
  updateParameter: PropTypes.func.isRequired,
};
