import React from 'react';
import PropTypes from 'prop-types';
import { connect, PromiseState } from 'react-refetch';
import { ToastContainer } from 'react-toastr';
import QueryViewHeader from './QueryViewHeader';
import QueryViewMain from './QueryViewMain';
import AlertUnsavedChanges from './AlertUnsavedChanges';

class QueryViewTop extends React.Component {
  static propTypes = {
    // queryId: PropTypes.number.isRequired,
    query: PropTypes.instanceOf(PromiseState).isRequired,
    saveQuery: PropTypes.func.isRequired,
    // saveQueryResponse: PropTypes.instanceOf(PromiseState),
    dataSources: PropTypes.instanceOf(PromiseState),
    sourceMode: PropTypes.bool.isRequired,
    $rootScope: PropTypes.object.isRequired,
    executeQuery: PropTypes.func.isRequired,
    executeQueryResponse: PropTypes.instanceOf(PromiseState).isRequired,
  }

  static defaultProps = {
    dataSources: null,
    // saveQueryResponse: null,
  }

  constructor(props) {
    super(props);
    this.toastRef = React.createRef();
    this.state = {
      isDirty: false,
      query: null,
      // XXX get this with refetch?
      // latestQueryData: null,
    };
  }

  static getDerivedStateFromProps(newProps, oldState) {
    // create shallow copy of query contents once loaded
    if (!oldState.query && newProps.query.fulfilled) {
      return { query: { ...newProps.query.value } };
    }
    return null;
  }


  // XXX tied to angular routing
  onChangeLocation = cb => this.props.$rootScope.$on('$locationChangeStart', cb);


  getDataSource = () => {
    // Try to get the query's data source id
    let dataSourceId = this.props.query.data_source_id;

    // If there is no source yet, then parse what we have in localStorage
    //   e.g. `null` -> `NaN`, malformed data -> `NaN`, "1" -> 1
    if (dataSourceId === undefined) {
      dataSourceId = parseInt(localStorage.lastSelectedDataSourceId, 10);
    }

    const dataSource = find(this.props.dataSources, ds => ds.id === dataSourceId);
    // If we had an invalid value in localStorage (e.g. nothing, deleted source),
    // then use the first data source

    return dataSource || this.props.dataSources.value[0];
  }

  setDataSource = (dataSource) => {
    this.props.Events.record('update_data_source', 'query', this.props.query.id);
    localStorage.lastSelectedDataSourceId = this.props.query.data_source_id;
    // this.setState({ latestQueryData: null });
    (this.props.query.id ? this.updateAndSaveQuery : this.updateQuery)({
      data_source_id: dataSource.id,
      latest_query_data_id: null,
    });
  }

  updateAndSaveQuery = (changes) => {
    const query = Object.assign({}, this.state.query, changes);
    this.setState({ query });
    this.props.saveQuery(query).then(() =>
      this.toastRef.current.success('Query saved')).catch(() =>
      this.toastRef.current.error('Query could not be saved'));
  }

  updateQuery = changes => this.setState({ query: Object.assign({}, this.state.query, changes) })

  render() {
    if (!(this.props.query.fulfilled && this.props.dataSources && this.props.dataSources.fulfilled)) {
      return null;
    }
    const query = this.state.query;
    const dataSources = this.props.dataSources.value;
    const dataSource = this.getDataSource();
    const canEdit = this.props.currentUser.canEdit(this.state.query) || this.state.query.can_edit;
    return (
      <div className="query-page-wrapper">
        {canEdit ? <AlertUnsavedChanges isDirty={this.state.isDirty} onChangeLocation={this.onChangeLocation} /> : null}
        <ToastContainer ref={this.toastRef} className="toast" />
        <QueryViewHeader
          canEdit={canEdit}
          query={query}
          updateQuery={this.updateAndSaveQuery}
          currentUser={this.props.currentUser}
          hasDataSources={dataSources.length > 0}
          dataSource={dataSource}
          sourceMode={this.props.sourceMode}
          showPermissionsControl={this.props.clientConfig.showPermissionsControl}
          Events={this.props.Events}
        />
        <QueryViewMain
          clientConfig={this.props.clientConfig}
          canEdit={canEdit}
          currentUser={this.props.currentUser}
          basePath={this.props.basePath}
          baseQuery={query}
          queryResult={this.props.queryResult}
          updateAndSaveQuery={this.updateAndSaveQuery}
          dataSource={dataSource}
          dataSources={dataSources}
          setDataSource={this.setDataSource}
          sourceMode={this.props.sourceMode}
          executeQuery={this.props.executeQuery}
          executeQueryResponse={this.props.executeQueryResponse}
          updateQuery={this.updateQuery}
          KeyboardShortcuts={this.props.KeyboardShortcuts}
        />
      </div>
    );
  }
}

function fetchQuery(props) {
  if (props.queryId) {
    return {
      query: {
        url: `${props.clientConfig.basePath}api/queries/${props.queryId}`,
        andThen: query => ({
          queryResult: query.latest_query_data_id ? {
            url: `${props.clientConfig.basePath}api/query_results/${query.latest_query_data_id}`,
          } : undefined,

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
        query: { value: newQuery },
        saveQueryResponse: {
          url: `${props.clientConfig.basePath}api/queries/${props.queryId}`,
          method: 'POST',
          body: newQuery,
        },
      }),
      executeQuery: query => ({
        executeQueryResponse: {
          url: `${props.clientConfig.basePath}api/query_results/`,
          method: 'POST',
          body: query,
        },
      }),
      executeQueryResponse: { value: {} },
      checkJobStatus: jobId => ({
        job: {
          url: `${props.clientConfig.basePath}api/jobs/${jobId}`,
        },
      }),
      job: { value: {} },
    };
  }
  return {};
}

export default connect(fetchQuery)(QueryViewTop);
