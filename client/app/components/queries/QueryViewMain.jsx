import React from 'react';
import PropTypes from 'prop-types';
import { connect, PromiseState } from 'react-refetch';
import Mustache from 'mustache';
import { difference, find, findIndex, map, union, uniq } from 'lodash';
import Modal from 'antd/lib/modal';

import FlexResizable from './FlexResizable';
import QueryViewNav from './QueryViewNav';
import QueryViewVisualizations from './QueryViewVisualizations';
import QueryViewFooter from './QueryViewFooter';
import QueryEditor from './QueryEditor';
import QueryMetadata from './QueryMetadata';
import VisualizationOptionsEditor from './VisualizationOptionsEditor';
import visualizationRegistry from '@/visualizations/registry';

function collectParams(parts) {
  let parameters = [];

  parts.forEach((part) => {
    if (part[0] === 'name' || part[0] === '&') {
      parameters.push(part[1]);
    } else if (part[0] === '#') {
      parameters = union(parameters, collectParams(part[4]));
    }
  });

  return parameters;
}

function parseQuery(query) {
  return uniq(collectParams(Mustache.parse(query)));
}

class QueryViewMain extends React.Component {
  static propTypes = {
    currentUser: PropTypes.object.isRequired,
    query: PropTypes.instanceOf(PromiseState).isRequired,
    saveQuery: PropTypes.func.isRequired,
    updateAndSaveQuery: PropTypes.func.isRequired,
    updateQuery: PropTypes.func.isRequired,
    isDirty: PropTypes.bool.isRequired,
    queryResult: PropTypes.instanceOf(PromiseState).isRequired,
    dataSources: PropTypes.array.isRequired,
    dataSource: PropTypes.object.isRequired,
    // dataSourceVersion: PropTypes.instanceOf(PromiseState).isRequired,
    setDataSource: PropTypes.func.isRequired,
    sourceMode: PropTypes.bool.isRequired,
    canEdit: PropTypes.bool.isRequired,
    schema: PropTypes.instanceOf(PromiseState).isRequired,
    refreshSchema: PropTypes.func.isRequired,
    clientConfig: PropTypes.object.isRequired,
    executeQuery: PropTypes.func.isRequired,
    executeQueryResponse: PropTypes.instanceOf(PromiseState).isRequired,
  }

  constructor(props) {
    super(props);
    this.state = {
      visualizationId: null,
      editVisualization: false,
      visualization: null,
    };
    this.queryEditor = React.createRef();
    this.listenForResize = (f) => { this.resizeEditor = f; };
  }

  setVisualization = (e, visualizationId) => this.setState({ visualizationId })

  updateVisualization = (v) => {
    const visualizations = [...this.props.query.value.visualizations];
    if (visualizations.length) {
      const i = findIndex(this.props.query.value.visualizations, { id: v.id });
      if (i > -1) {
        visualizations[i] = v;
      }
    } else {
      visualizations[0] = v;
    }
    this.props.updateAndSaveQuery({ visualizations });
  }

  canExecuteQuery = () => this.props.currentUser.hasPermission('execute_query') && !this.props.dataSource.view_only

  editorPaste = (text) => {
    const editor = this.queryEditor.current.editor;
    editor.session.doc.replace(editor.selection.getRange(), text);
    const range = editor.selection.getRange();
    window.setTimeout(() => {
      editor.selection.setRange(range);
    }, 0);
  }

  editorFocus = () => this.queryEditor.current.editor.focus()

  updateQueryText = (newText) => {
    let paramNames;
    try {
      paramNames = parseQuery(newText);
    } catch (p) {
      // don't update params if parse fails
    }
    if (this.props.query.value.options && this.props.query.value.options.parameters) {
      const ps = this.props.query.value.options.parameters;
      const existingParamNames = map(ps, 'name');
      paramNames = difference(paramNames, existingParamNames);
    }
    this.props.updateQuery({
      query: newText,
      options: {
        ...this.props.query.value.options,
        parameters: [
          ...this.props.query.value.options.parameters,
          ...map(paramNames, n => ({
            title: n,
            name: n,
            type: 'text',
            value: null,
            global: false,
          })),
        ],
      },
    });
  }

  updateParameters = parameters =>
    this.props.updateQuery({ options: { ...this.props.query.value.options, parameters } })
  openVisualizationEditor = () => this.setState({ editVisualization: true })
  openNewVisualizationEditor = () => this.setState({
    visualization: {
      type: 'CHART',
      name: visualizationRegistry.CHART.name,
      description: '',
      options: visualizationRegistry.CHART.defaultOptions,
    },
    editVisualization: true,
  })
  hideVisualizationEditor = () => this.setState({ editVisualization: false })
  editVisualization = v => this.setState({ visualization: v })
  saveVisualization = () => { this.updateVisualization(this.state.visualization); this.hideVisualizationEditor(); }


  render() {
    let visualization;
    if (!this.props.query.value.visualizations) {
      visualization = null;
    } else if (this.state.visualizationId === null) {
      visualization = this.props.query.value.visualizations[0];
    } else {
      visualization = find(this.props.query.value.visualizations, { id: this.state.visualizationId });
    }
    return (
      <main className="query-fullscreen">
        <Modal
          visible={this.state.editVisualization}
          onCancel={this.hideVisualizationEditor}
          className="modal-xl"
          title="Visualization Editor"
          footer={[
            <button className="btn btn-default" onClick={this.hideVisualizationEditor}>Cancel</button>,
            <button className="btn btn-primary" onClick={this.saveVisualization}>Save</button>,
          ]}
        >
          <div className="row">
            <VisualizationOptionsEditor
              queryResult={this.props.queryResult}
              visualization={this.state.visualization || visualization}
              updateVisualization={this.editVisualization}
              filteredData={this.props.filteredData}
              clientConfig={this.props.clientConfig}
              filters={this.props.filters}
              setFilters={this.props.setFilters}
            />
          </div>
        </Modal>
        <QueryViewNav
          canEdit={this.props.canEdit}
          currentUser={this.props.currentUser}
          query={this.props.query.value}
          updateAndSaveQuery={this.props.updateAndSaveQuery}
          dataSource={this.props.dataSource}
          dataSources={this.props.dataSources}
          sourceMode={this.props.sourceMode}
          setDataSource={this.props.setDataSource}
          schema={this.props.schema}
          refreshSchema={this.props.refreshSchema}
          editorPaste={this.editorPaste}
          clientConfig={this.props.clientConfig}
        />
        <div className="content">
          <div className="flex-fill p-relative">
            <div
              className="p-absolute d-flex flex-column p-l-15 p-r-15"
              style={{
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
              }}
            >
              {this.props.sourceMode ?
                <FlexResizable
                  className="row editor"
                  style={{ minHeight: 11, maxHeight: '70vh' }}
                  onResize={this.resizeEditor}
                  elementName="div"
                  direction="bottom"
                >
                  <QueryEditor
                    refEditor={this.queryEditor}
                    style={{ width: '100%', height: '100%' }}
                    queryText={this.props.query.value.query}
                    formatQuery={this.props.formatQuery}
                    autocompleteQuery={this.autocompleteQuery}
                    schema={this.props.schema}
                    isDirty={this.props.isDirty}
                    isQueryOwner={this.props.isQueryOwner}
                    updateDataSource={this.updateDataSource}
                    executeQuery={this.props.executeQuery}
                    canExecuteQuery={this.canExecuteQuery()}
                    canEdit={this.props.canEdit}
                    listenForResize={this.listenForResize}
                    saveQuery={this.props.saveQuery}
                    updateQuery={this.updateQueryText}
                    dataSource={this.props.dataSource}
                    dataSources={this.props.dataSources}
                    parameters={this.props.query.value.options.parameters}
                    updateParameters={this.updateParameters}
                    KeyboardShortcuts={this.props.KeyboardShortcuts}
                    clientConfig={this.props.clientConfig}
                  />
                </FlexResizable> : null}
              <QueryMetadata
                mobile
                query={this.props.query.value}
                saveQuery={this.saveQuery}
                canEdit={this.props.canEdit}
                canScheduleQuery={this.props.currentUser.hasPermission('schedule_query')}
                schedule={this.props.query.value.schedule}
                clientConfig={this.props.clientConfig}
                updateQuery={this.updateAndSaveQuery}
              />
              <QueryViewVisualizations
                clientConfig={this.props.clientConfig}
                query={this.props.query.value}
                updateQuery={this.props.updateQuery}
                searchQueries={this.props.searchQueries}
                data={this.props.filteredData}
                queryResult={this.props.queryResult}
                sourceMode={this.props.sourceMode}
                canEdit={this.props.canEdit}
                setFilters={this.setFilters}
                filters={this.props.filters}
                executeQueryResponse={this.props.executeQueryResponse}
                queryExecuting={this.props.queryExecuting}
                visualization={visualization}
                setVisualization={this.setVisualization}
                openVisualizationEditor={this.openNewVisualizationEditor}
              />
            </div>
          </div>
          <div className="bottom-controller-container">
            <QueryViewFooter
              query={this.props.query.value}
              queryResult={this.props.queryResult}
              canEdit={this.props.canEdit}
              filteredData={this.props.filteredData}
              queryExecuting={this.props.queryExecuting}
              canExecuteQuery={this.canExecuteQuery()}
              visualization={visualization}
              updateVisualization={this.updateVisualization}
              openVisualizationEditor={this.openVisualizationEditor}
              setFilters={this.setFilters}
              filters={this.props.filters}
              clientConfig={this.props.clientConfig}
            />
          </div>
        </div>
      </main>
    );
  }
}

function fetchData(props) {
  if (props.dataSource) {
    // const versionURL = `${props.clientConfig.basePath}api/data_sources/${props.dataSource.id}/version`;
    const schemaURL = `${props.clientConfig.basePath}api/data_sources/${props.dataSource.id}/schema`;

    return {
      query: { value: props.baseQuery },
      // dataSourceVersion: {
      //  url: versionURL,
      // },
      schema: {
        url: schemaURL,
      },
      refreshSchema: () => ({
        schema: {
          url: schemaURL,
          force: true,
          refreshing: true,
        },
      }),
      formatQuery: (syntax, query) => {
        if (syntax === 'json') {
          try {
            return { query: { force: true, refreshing: true, value: { ...props.baseQuery, query: JSON.stringify(JSON.parse(query), ' ', 4) } } };
          } catch (err) {
            return { query: { value: Promise.reject(err) } };
          }
        } else if (syntax === 'sql') {
          return {
            query: {
              url: `${props.clientConfig.basePath}api/queries/format`,
              method: 'POST',
              body: JSON.stringify({ query }),
              then: response => ({ force: true, refreshing: true, value: { ...props.baseQuery, query: response.query } }),
              force: true,
              refreshing: true,
            },
          };
        } else {
          return { query: { force: true, refreshing: true, value: Promise.reject(new Error('Query formatting is not supported for your data source syntax.')) } };
        }
      },
    };
  }
  return {};
}

export default connect(fetchData)(QueryViewMain);

