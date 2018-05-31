import React from 'react';
import PropTypes from 'prop-types';
import { find } from 'lodash';

function optionsFromQueryResult(queryResult) {
  const columns = queryResult.data.columns;
  const numColumns = columns.length;
  let options = [];
  // If there are multiple columns, check if there is a column
  // named 'name' and column named 'value'. If name column is present
  // in results, use name from name column. Similar for value column.
  // Default: Use first string column for name and value.
  if (numColumns > 0) {
    let nameColumn = null;
    let valueColumn = null;
    columns.forEach((column) => {
      const columnName = column.name.toLowerCase();
      if (columnName === 'name') {
        nameColumn = column.name;
      }
      if (columnName === 'value') {
        valueColumn = column.name;
      }
      // Assign first string column as name and value column.
      if (nameColumn === null) {
        nameColumn = column.name;
      }
      if (valueColumn === null) {
        valueColumn = column.name;
      }
    });
    if (nameColumn !== null && valueColumn !== null) {
      options = queryResult.data.rows.map((row) => {
        const queryResultOption = {
          name: row[nameColumn],
          value: row[valueColumn],
        };
        return queryResultOption;
      });
    }
  }
  return options;
}

export default class QueryBasedParameter extends React.Component {
  propTypes = {
    param: PropTypes.object.isRequired,
    queryId: PropTypes.number.isRequired,
  }

  componentDidUpdate(prevProps) {
    if (prevProps.queryId !== this.props.queryId) {
      this.props.Query.resultById({ id: this.props.queryId }, (result) => {
        const queryResultOptions = optionsFromQueryResult(result.query_result);
        this.setState({ queryResultOptions });
        if (find(queryResultOptions, o => o.value === this.props.param.value) === undefined) {
          this.props.param.value = queryResultOptions[0].value;
        }
      });
    }
  }

  initialState = {
    queryResultOptions: null,
  }

  render() {
    return (
      <select className="form-control" value={this.props.param.value}>
        {this.state.queryResultOptions.map(o => <option value={o.value}>o.name</option>)}
      </select>
    );
  }
}
