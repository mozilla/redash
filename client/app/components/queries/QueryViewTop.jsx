import React from 'react';
import PropTypes from 'prop-types';
import { connect, PromiseState } from 'react-refetch';
import { ToastMessageAnimated } from 'react-toastr';
import { find, includes, map, some, uniq } from 'lodash';
import moment from 'moment';

import visualizationRegistry from '@/visualizations/registry';
import QueryViewHeader from './QueryViewHeader';
import QueryViewMain from './QueryViewMain';
import AlertUnsavedChanges from './AlertUnsavedChanges';

const filterTypes = ['filter', 'multi-filter', 'multiFilter'];

function getColumnNameWithoutType(column) {
  let typeSplit;
  if (column.indexOf('::') !== -1) {
    typeSplit = '::';
  } else if (column.indexOf('__') !== -1) {
    typeSplit = '__';
  } else {
    return column;
  }

  const parts = column.split(typeSplit);
  if (parts[0] === '' && parts.length === 2) {
    return parts[1];
  }

  if (!includes(filterTypes, parts[1])) {
    return column;
  }

  return parts[0];
}

function getColumnFriendlyName(column) {
  return getColumnNameWithoutType(column).replace(/(?:^|\s)\S/g, a =>
    a.toUpperCase());
}


function getFilters(queryResult) {
  const filters = [];
  queryResult.data.columns.forEach((col) => {
    const name = col.name;
    const type = name.split('::')[1] || name.split('__')[1];
    if (includes(filterTypes, type)) {
      // filter found
      const filter = {
        name,
        friendlyName: getColumnFriendlyName(name),
        column: col,
        values: uniq(map(queryResult.data.rows, name), v => (moment.isMoment(v) ? v.unix() : v)),
        multiple: (type === 'multiFilter') || (type === 'multi-filter'),
      };
      filter.current = [filter.values[0]];
      filters.push(filter);
    }
  });
  return filters;
}

function filterData(filters, queryResult) {
  return {
    ...queryResult.data,
    rows: queryResult.data.rows.filter(row =>
      filters.reduce((memo, filter) => (
        memo && some(filter.current, (v) => {
          const value = row[filter.name];
          if (moment.isMoment(value)) {
            return value.isSame(v);
          }
          // We compare with either the value or the String representation of the value,
          // because Select2 casts true/false to "true"/"false".
          return (v === value || String(value) === v);
        })), true)),
  };
}

class QueryViewTop extends React.Component {
  static propTypes = {
    queryId: PropTypes.number.isRequired,
    query: PropTypes.instanceOf(PromiseState).isRequired,
    saveQuery: PropTypes.func.isRequired,
    dataSources: PropTypes.instanceOf(PromiseState),
    sourceMode: PropTypes.bool.isRequired,
    $rootScope: PropTypes.object.isRequired,
    executeQuery: PropTypes.func.isRequired,
    executeQueryResponse: PropTypes.instanceOf(PromiseState).isRequired,
    archiveQuery: PropTypes.func.isRequired,
  }

  static defaultProps = {
    dataSources: null,
  }

  constructor(props) {
    super(props);
    this.toastRef = React.createRef();
    this.state = {
      query: null,
      filters: [],
      filteredData: { rows: [], columns: [] },
      queryResult: PromiseState.create({}),
    };
  }

  static getDerivedStateFromProps(newProps, oldState) {
    if (!newProps.query) {
      if (!oldState.query) {
        // creating new query
        return {
          query: {
            query: '',
            name: 'New Query',
            schedule: null,
            user: newProps.currentUser,
            options: {
              parameters: [],
            },
            visualizations: [],
          },
        };
      }
      return null;
    }

    const state = {};
    if (newProps.query.pending) {
      state.toast = null;
    } else if (newProps.query.fulfilled && newProps.query.refreshing) {
      state.toast = 'success';
    } else if (newProps.query.rejected) {
      state.toast = 'error';
    } else if (newProps.archiveQueryResponse && newProps.archiveQueryResponse.rejected) {
      state.toast = 'archiveError';
    }
    // create shallow copy of query contents once loaded
    const updatedQuery = (newProps.query.fulfilled && (
      !oldState.query ||
      (newProps.query.value.version > (oldState.query.version || 0))));
    // navigate to proper url if new query created
    if (updatedQuery && oldState.query && !oldState.query.id) {
      window.history.pushState({}, '', `/queries/${newProps.query.value.id}/source`);
    }

    if (newProps.query.meta.archive || updatedQuery) {
      state.query = { ...newProps.query.value };
      if (!state.query.visualizations || state.query.visualizations.length === 0) {
        state.query.visualizations = [{
          type: visualizationRegistry.TABLE.type,
          name: visualizationRegistry.TABLE.name,
          description: '',
          options: visualizationRegistry.TABLE.defaultOptions,
        }];
      }
    }
    if (newProps.queryResult &&
        newProps.queryResult.fulfilled &&
        newProps.queryResult.value.query_result &&
        oldState.queryResult !== newProps.queryResult.value.query_result) {
      const data = newProps.queryResult.value.query_result;
      state.filters = getFilters(data);
      state.filteredData = filterData(state.filters, data);
      state.queryResult = newProps.queryResult.value.query_result;
    }
    return state;
  }


  // XXX tied to angular routing
  onChangeLocation = cb => this.props.$rootScope.$on('$locationChangeStart', cb);

  setFilters = filters => this.setState({ filters, filteredData: filterData(filters, this.props.queryResult) })

  getDataSource = () => {
    // Try to get the query's data source id
    let dataSourceId = this.props.query && this.props.query.data_source_id;

    // If there is no source yet, then parse what we have in localStorage
    //   e.g. `null` -> `NaN`, malformed data -> `NaN`, "1" -> 1
    if (dataSourceId === undefined) {
      dataSourceId = parseInt(localStorage.lastSelectedDataSourceId, 10);
    }

    const dataSource = find(this.props.dataSources.value, ds => ds.id === dataSourceId);
    // If we had an invalid value in localStorage (e.g. nothing, deleted source),
    // then use the first data source

    return dataSource || this.props.dataSources.value[0];
  }

  setDataSource = (dataSource) => {
    this.props.Events.record('update_data_source', 'query', this.props.query.id);
    localStorage.lastSelectedDataSourceId = this.props.query.data_source_id;
    (this.props.query.id ? this.updateAndSaveQuery : this.updateQuery)({
      data_source_id: dataSource.id,
      latest_query_data_id: null,
    });
  }

  updateAndSaveQuery = (changes) => {
    const query = Object.assign({}, this.state.query, changes);
    this.setState({ query });
    if (query.id) {
      this.props.saveQuery(query);
    }
  }

  updateQuery = changes => this.setState({ query: Object.assign({}, this.state.query, changes) })
  saveQuery = () => this.props.saveQuery(Object.assign({ data_source_id: this.getDataSource().id }, this.state.query))

  duplicateQuery = () => window.fetch(
    `${this.props.clientConfig.basePath}api/queries/${this.props.queryId}/fork`,
    {
      method: 'POST',
      credentials: 'same-origin',
      body: JSON.stringify({ id: Number(this.props.queryId) }),
      headers: new Headers([['Content-Type', 'application/json;charset=UTF-8']]),
    },
  ).then((r) => {
    if (r.ok) {
      r.json().then(q => window.location.assign(`/queries/${q.id}/source`));
    }
  })

  archiveQuery = () => this.props.archiveQuery(this.props.query.value)
  executeQuery = () => this.props.executeQuery({
    query: this.state.query.query,
    query_id: this.state.query.id,
    data_source_id: this.getDataSource().id,
  })

  isDirty = () => (this.props.query && this.props.query.fulfilled ?
    this.state.query.query !== this.props.query.value.query :
    true)

  render() {
    if (!(this.props.dataSources && this.props.dataSources.fulfilled)) {
      return null;
    }
    const query = this.state.query;
    const dataSources = this.props.dataSources.value;
    const dataSource = this.getDataSource();
    const canEdit = this.props.currentUser.canEdit(this.state.query) || this.state.query.can_edit;
    const toastMessages = {
      success: 'Query saved',
      error: 'Query could not be saved',
      archiveError: 'Query could not be archived',
    };
    return (
      <div className="query-page-wrapper">
        {canEdit ? <AlertUnsavedChanges isDirty={this.isDirty()} onChangeLocation={this.onChangeLocation} /> : null}
        {this.state.toast && <div id="toast-container" className="toast-bottom-right"><ToastMessageAnimated type={this.state.toast} message={toastMessages[this.state.toast]} /></div>}
        <QueryViewHeader
          canEdit={canEdit}
          query={query}
          updateQuery={this.updateAndSaveQuery}
          currentUser={this.props.currentUser}
          hasDataSources={dataSources.length > 0}
          dataSource={dataSource}
          sourceMode={this.props.sourceMode}
          showPermissionsControl={this.props.clientConfig.showPermissionsControl}
          duplicateQuery={this.duplicateQuery}
          archiveQuery={this.archiveQuery}
          getTags={this.props.getTags}
          tags={this.props.tags}
          clientConfig={this.props.clientConfig}
          Events={this.props.Events}
        />
        <QueryViewMain
          clientConfig={this.props.clientConfig}
          canEdit={canEdit}
          currentUser={this.props.currentUser}
          basePath={this.props.basePath}
          baseQuery={query}
          queryResult={this.state.queryResult}
          executeQueryResponse={this.props.queryResult}
          saveQuery={this.saveQuery}
          updateAndSaveQuery={this.updateAndSaveQuery}
          isDirty={this.isDirty()}
          dataSource={dataSource}
          dataSources={dataSources}
          setDataSource={this.setDataSource}
          sourceMode={this.props.sourceMode}
          executeQuery={this.executeQuery}
          updateQuery={this.updateQuery}
          filters={this.state.filters}
          setFilters={this.setFilters}
          filteredData={this.state.filteredData}
          KeyboardShortcuts={this.props.KeyboardShortcuts}
        />
      </div>
    );
  }
}

function fetchQuery(props) {
  let requests;
  if (props.queryId) {
    requests = {
      query: {
        url: `${props.clientConfig.basePath}api/queries/${props.queryId}`,
        andThen: query => ({
          queryResult: query.latest_query_data_id ? {
            url: `${props.clientConfig.basePath}api/query_results/${query.latest_query_data_id}`,
          } : { value: PromiseState.create({}) },

          dataSources: {
            url: `${props.clientConfig.basePath}api/data_sources`,
            then: dataSources => ({
              value: dataSources.filter(dataSource =>
                (!dataSource.viewOnly || dataSource.id === query.data_source_id)),
            }),
          },
        }),
      },
      saveQuery: newQuery => ({
        query: {
          refreshing: true,
          force: true,
          url: `${props.clientConfig.basePath}api/queries/${props.queryId}`,
          method: 'POST',
          body: JSON.stringify(newQuery),
        },
      }),
      archiveQuery: query => ({
        query: { value: { ...query, is_archived: true, schedule: null }, meta: { archive: true } },
        archiveQueryResponse: {
          url: `${props.clientConfig.basePath}api/queries/${query.id}`,
          method: 'DELETE',
        },
      }),
      executeQuery: query => ({
        queryResult: {
          force: true,
          url: `${props.clientConfig.basePath}api/query_results`,
          method: 'POST',
          body: JSON.stringify(query),
        },
      }),
      checkJobStatus: jobId => ({
        job: {
          url: `${props.clientConfig.basePath}api/jobs/${jobId}`,
        },
      }),
      job: { value: {} },
      getTags: () => ({ tags: { url: `${props.clientConfig.basePath}api/queries/tags` } }),
    };
  } else {
    requests = {
      dataSources: {
        url: `${props.clientConfig.basePath}api/data_sources`,
        then: dataSources => ({
          value: dataSources.filter(dataSource => !dataSource.viewOnly),
        }),
      },
      saveQuery: newQuery => ({
        query: {
          refreshing: true,
          force: true,
          url: `${props.clientConfig.basePath}api/queries`,
          method: 'POST',
          body: JSON.stringify(newQuery),
        },
      }),
    };
  }
  return requests;
}

export default connect(fetchQuery)(QueryViewTop);
