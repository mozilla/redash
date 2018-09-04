import React from 'react';
import PropTypes from 'prop-types';
import Select from 'antd/lib/select';
import Modal from 'antd/lib/modal';

export default class ParameterSettings extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      querySearchResults: [],
    };
  }

  searchQueries = searchText => (
    searchText.length > 3 &&
      window.fetch(`${this.props.clientConfig.basePath}api/queries/search?q=${searchText}`)
        .then(r => r.json())
        .then(qs => this.setState({ querySearchResults: qs })))

  render() {
    const {
      show,
      onHide,
      parameter,
      updateParameter,
    } = this.props;
    if (!show) {
      // for now
      return null;
    }
    const setParamType = e => updateParameter({ type: e.target.value });
    const setParamTitle = e => updateParameter({ title: e.target.value });
    const setParamGlobal = e => updateParameter({ global: e.target.checked });
    const setParamEnumOptions = e => updateParameter({ enumOptions: e.target.value });
    const setQueryId = item => updateParameter({ queryId: item.value, queryName: item.label });
    return (
      <Modal
        visible
        title={parameter.name}
        footer={null}
        onCancel={onHide}
      >
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
          {parameter.type === 'enum' ?
            <div className="form-group">
              <label>Dropdown List Values (newline delimited)</label>
              <textarea className="form-control" rows="3" value={parameter.enumOptions} onChange={setParamEnumOptions} />
            </div> : null}
          {parameter.type === 'query' ?
            <div className="form-group">
              <label>Query to load dropdown values from:</label>
              <Select
                value={parameter.queryId}
                placeholder="Search a query by name"
                onSearch={this.searchQueries}
                onChange={setQueryId}
                notFoundContent={null}
              >
                {this.state.querySearchResults.map(q => <Select.Option key={q.id}>{q.name}</Select.Option>)}
              </Select>
            </div> : null }
        </div>
      </Modal>
    );
  }
}
ParameterSettings.propTypes = {
  clientConfig: PropTypes.object.isRequired,
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  parameter: PropTypes.object.isRequired,
  updateParameter: PropTypes.func.isRequired,
};
