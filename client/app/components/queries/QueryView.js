import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import 'react-select/dist/react-select.css';
import { DropDownButton, MenuItem, OverlayTrigger, Popover } from 'react-bootstrap';
import { find, map, sortBy } from 'lodash';
import moment from 'moment';

import { durationHumanize, prettySize } from '@/filters';
import { visualizationRegistry } from '@/visualizations';
import AlertUnsavedChanges from './AlertUnsavedChanges';
import EditInPlaceText from './EditInPlaceText';
import Overlay from './Overlay';
import Parameters from './Parameters';
import QueryEditor from './QueryEditor';
import QueryExecutionStatus from './QueryExecutionStatus';
import QueryMetadata from './QueryMetadata';
import SchemaBrowser from './SchemaBrowser';
import VisualizationRenderer from './VisualizationRenderer';

function RdTab(props) {
  return (
    <li className={'rd-tab' + (props.tabId === props.selectedTab ? ' active' : '')}>
      <a onClick={e => props.onClick(e, props.tabId)} href={`${props.basePath}#${props.tabId}`}>{props.name}{...props.children}</a>
    </li>
  );
}

RdTab.propTypes = {
  tabId: PropTypes.string.isRequired,
  selectedTab: PropTypes.string.isRequired,
  basePath: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  children: PropTypes.arrayOf(React.Component).isRequired,
  onClick: PropTypes.func.isRequired,
};

export default class QueryView extends React.Component {
  static propTypes = {
    currentUser: PropTypes.object.isRequired,
    query: PropTypes.object.isRequired,
    dataSources: PropTypes.arrayOf(PropTypes.object).isRequired,
    queryResult: PropTypes.object,
    sourceMode: PropTypes.bool.isRequired,
    canEdit: PropTypes.bool.isRequired,
    showPermissionsControl: PropTypes.bool.isRequired,
  }

  static propDefaults = {
    queryResult: null,
  }
  constructor(props) {
    super(props);
    this.state = {
      isDirty: false,
      selectedTab: this.props.query.visualizations.length ? this.props.query.visualizations[0].id : 'Table',
      dataSource: this.getDataSource(this.props.dataSources),
      schema: null,
      showDataset: true,
      queryExecuting: false,
    }
    this.getSchema();
    this.queryEditor = React.createRef();
  }

  getDataSource(dataSources) {
    // Try to get the query's data source id
    let dataSourceId = this.props.query.data_source_id;

    // If there is no source yet, then parse what we have in localStorage
    //   e.g. `null` -> `NaN`, malformed data -> `NaN`, "1" -> 1
    if (dataSourceId === undefined) {
      dataSourceId = parseInt(localStorage.lastSelectedDataSourceId, 10);
    }

    const dataSource = find(dataSources, ds => ds.id === dataSourceId);
    // If we had an invalid value in localStorage (e.g. nothing, deleted source),
    // then use the first data source

    return dataSource || dataSources[0];

  }

  getSchema(refresh) {
    this.state.dataSource.getSchema(refresh).then((data) => {
      if (data.schema) {
        this.setState({ schema: data.schema });
      } else if (data.error.code === SCHEMA_NOT_SUPPORTED) {
        this.setState({ schema: undefined });
      } else if (data.error.code === SCHEMA_LOAD_ERROR) {
        toastr.error('Schema refresh failed. Please try again later.');
      } else {
        toastr.error('Schema refresh failed. Please try again later.');
      }
    });
  }

  refreshSchema = () => this.getSchema(true);

  canExecuteQuery = () => this.props.currentUser.hasPermission('execute_query') && this.state.dataSource.view_only
  setSelectedTab = (e, selectedTab) => this.setState({ selectedTab })

  render() {
    const data = this.props.queryResult.getData();
    const dataSourceVersionMsg = this.props.DataSource.version({ id: this.props.query.data_source_id }).message;
    const archivedPopover = (
      <Popover id="query-archived-popover">
        This query is archived and can&apos;t be used in dashboards, and won&apos;t appear in search results.
      </Popover>);
    const noCreatePermission = (
      <Overlay>
        You don&apos;t have permission to create new queries on any of the data sources available to you.
        You can either <a href="queries">browse existing queries</a>, or ask for additional permissions from
        your Redash admin.
      </Overlay>);
    const makeDataSources = (
      <Overlay>
        Looks like no data sources were created yet (or none of them available to the group(s)
        you&apos;re member of). Please create one first, and then start querying.
        <br />
        <a href="data_sources/new" className="btn btn-primary">Create Data Source</a>
        <a href="groups" className="btn btn-default">Manage Group Permissions</a>
      </Overlay>
    );
    const noDataSources = (
      <Overlay>
        Looks like no data sources were created yet (or none of them available to the group(s) you&apos;re
        member of). Please ask your Redash admin to create one first.
      </Overlay>
    );
    const ownerButtons = [];
    if (!this.props.query.is_archived &&
        this.props.query.id &&
        (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin'))) {
      ownerButtons.push((
        <MenuItem
          eventKey="archiveQuery"
          onSelect={this.archiveQuery}
          >Archive
        </MenuItem>
      ));
      if (this.props.showPermissionsControl) {
        ownerButtons.push((
          <MenuItem
              eventKey="managePermissionsModal"
              onSelect={this.showManagePermissionsModal}
            >Manage Permissions
          </MenuItem>
        ));
      }
    }
    if (!this.props.query.is_draft &&
        this.props.query.id !== undefined &&
        (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin'))) {
      ownerButtons.push((
        <MenuItem
          eventKey="togglePublished"
          onSelect={this.togglePublished}
          >Unpublish
          </a>
        </li>
      ));
    }
    return (
      <div className="query-page-wrapper">
        <div className="container">
          {this.props.canCreateQuery === false && this.props.query.isNew() ? noCreatePermission : ''}
          {this.state.dataSources.length && this.props.currentUser.isAdmin ? makeDataSources : ''}
          {this.props.dataSources.length && !this.props.currentUser.isAdmin ? noDataSources : ''}
          {this.props.canEdit ? <AlertUnsavedChanges isDirty={this.state.isDirty} $on={this.props.$on} /> : ''}

          <div className="row p-l-15 p-b-10 m-l-0 m-r-0 page-header--new page-header--query">
            <div className="col-sm-8 col-xs-7 p-0">
              <h3>
                <EditInPlaceText
                  className="edit-in-place"
                  editable={this.props.canEdit}
                  onDone={this.saveName}
                  ignoreBlanks="true"
                  value={this.props.query.name}
                />
                {this.props.query.is_draft && !this.props.query.is_archived ? <span className="label label-default">Unpublished</span> : ''}
                {this.props.query.is_archived ?
                  <OverlayTrigger trigger="mouseenter" overlay={archivedPopover}>
                    <span className="label label-warning">Archived</span>
                  </OverlayTrigger> : ''}
              </h3>

              <em>
                <EditInPlaceText
                  className="edit-in-place"
                  editable={this.props.canEdit}
                  onDone={this.saveDescription}
                  editor="textarea"
                  placeholderText="No description"
                  ignoreBlanks="false"
                  value={this.props.query.description}
                />
              </em>
            </div>

            <div className="col-sm-4 col-xs-5 p-0 source-control text-right">

              {this.props.query.is_draft &&
               this.props.query.id &&
               (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin')) ?
                 <button className="btn btn-default btn-publish" onClick={this.togglePublished()}>
                   <span className="fa fa-paper-plane" /> Publish
                 </button> : ''}

              {this.props.query.id && this.props.canViewSource && this.props.sourceMode ?
                <React.Fragment>
                  <a
                    href={this.props.query.getUrl(true, this.state.selectedTab)}
                    className="btn btn-default btn--showhide"
                  ><i className="fa fa-code" aria-hidden="true" />
                    Edit Source
                  </a>
                  <a
                    href={this.props.query.getUrl(false, this.state.selectedTab)}
                    className="btn btn-default btn--showhide"
                  ><i className="fa fa-table" aria-hidden="true" />
                    Show Data Only
                  </a>
                </React.Fragment> : ''}

              {this.props.query.id && this.moreMenuIsPopulated() ?
                <DropDownButton
                  id="query-more-menu"
                  className="btn btn-default"
                  pullRight
                  title={<span className="zmdi zmdi-more" />}
                >
                  <MenuItem
                    eventKey="duplicateQuery"
                    className={!this.props.query.id || !this.canForkQuery() ? 'disabled' : ''}
                    onSelect={this.duplicateQuery}
                  >
                      Fork
                  </MenuItem>
                  <MenuItem divider />
                  {...ownerButtons}
                  {this.props.query.is_archived ? '' : <MenuItem divider />}
                  {this.props.query.id ? <MenuItem onSelect={this.showApiKey} eventKey="showApiKey">Show API Key</MenuItem>}
                  {this.props.canEdit && this.props.query.id && (this.props.query.version > 1) ?
                      <MenuItem eventKey="compareQueryVersion" onSelect={this.compareQueryVersion}>Query Versions</MenuItem>}
                </DropDownButton> : ''}
            </div>
          </div>
        </div>
        <main className="query-fullscreen">
          <nav resizable r-directions="['right']" r-flex="true" resizable-toggle>
            <div className="editor__left__data-source">
              <Select
                value={this.state.dataSource}
                onChange={this.updateDataSource}
                disabled={!this.isQueryOwner || !this.sourceMode}
                placeholder="Select Data Source..."
                options={this.props.dataSources.map(d => ({ value: d.id, label: d.name }))}
              />
              {this.state.dataSource.options.doc_url !== '' && this.state.dataSource.options.doc_url ? <a href={this.state.dataSource.options.doc_url}>{this.state.dataSource.type_name} documentation</a> : '' }
              {this.state.dataSource.options.doc_url === '' || !this.state.dataSource.options.doc_url ? <span>{this.state.dataSource.type_name} documentation</span> : ''}
              {dataSourceVersionMsg.includes('no') ? <span className="fa fa-exclamation-circle" title={dataSourceVersionMsg} /> : <span>{dataSourceVersionMsg}</span>}
            </div>
            {this.props.sourceMode ?
              <div className="editor__left__schema">
                <SchemaBrowser
                  schema={this.state.dataSource.schema}
                  tableToggleString={this.state.dataSource.options.toggle_table_string}
                  onRefresh={this.refreshSchema}
                  editorPaste={this.editorPaste}
                />
              </div> :
              <div style={{ 'flex-grow': 1 }}>&nbsp;</div>
            }
            <QueryMetadata
              mobile={false}
              query={this.props.query}
              saveQuery={this.saveQuery}
              canEdit={this.canEdit}
              canScheduleQuery={this.canScheduleQuery}
              schedule={this.query.schedule}
            />
          </nav>

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
                  <div className="row editor" resizable r-directions="['bottom']" r-flex="true" resizable-toggle
                    style="min-height: 11px; max-height: 70vh;">
                    <QueryEditor
                      ref={this.queryEditor}
                      style={{width: '100%', height: '100%'}}
                      queryText={this.props.query.query}
                      autocompleteQuery={this.autocompleteQuery}
                      schema={this.state.dataSource.schema}
                      syntax={this.state.dataSource.syntax}
                      isQueryOwner={this.props.isQueryOwner}
                      updateDataSource={this.updateDataSource}
                      executeQuery={this.executeQuery}
                      canExecuteQuery={this.canExecuteQuery()}
                      listenForResize={this.listenForResize}
                      saveQuery={this.saveQuery}
                      updateQuery={this.updateQuery}
                      dataSource={this.state.dataSource}
                      dataSources={this.props.dataSources}
                    />
                  </div> : ''}
                <QueryMetadata
                  mobile
                  query={this.props.query}
                  saveQuery={this.saveQuery}
                  canEdit={this.canEdit}
                  canScheduleQuery={this.canScheduleQuery}
                  schedule={this.query.schedule}
                />
                <section className="flex-fill p-relative t-body">
                  <div
                    className="d-flex flex-column p-b-15 p-absolute"
                    style={{
                      left: 0,
                      top: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  >
                    {this.props.query.getParametersDefs().length > 0 ?
                      <div className="p-t-15 p-b-15">
                        <Parameters
                          parameters={this.props.query.getParametersDefs()}
                          query={this.props.query}
                          syncValues={!this.props.query.isNew()}
                          editable={this.props.sourceMode && this.props.canEdit}
                        />
                      </div> : ''}
                    <QueryExecutionStatus
                      query={this.props.query}
                      queryResult={this.props.queryResult}
                      status={this.props.queryResult.getStatus()}
                      Event={this.props.Event}
                    />
                    {/* tabs and data */}
                    {this.state.showDataset ?
                      <div className="flex-fill p-relative">
                        <div
                          className="d-flex flex-column p-absolute"
                          style={{
                            left: 0,
                            top: 0,
                            right: 0,
                            bottom: 0,
                          }}
                        >
                          {this.props.queryResult.getLog() ?
                            <div className="p-10">
                              <p>Log Information:</p>
                              {this.props.queryResult.getLog().map(l => <p>{l}</p>)}
                            </div> : ''}

                          <ul className="tab-nav">
                            {!this.props.query.visualizations.length ?
                              <RdTab
                                tabId="table"
                                name="Table"
                                selected={this.state.selectedTab}
                                basePath={this.props.query.getUrl(this.props.sourceMode)}
                                onClick={this.setSelectedTab}
                              /> : map(sortBy(this.props.query.visualizations, 'id'), (vis, i) => (
                                <RdTab
                                  tabId={vis.id}
                                  name={vis.name}
                                  selected={this.state.selectedTab}
                                  basePath={this.props.query.getUrl(this.props.sourceMode)}
                                  onClick={this.setSelectedTab}
                                >
                                  {this.props.canEdit && !((i > 0) && (vis.type === 'TABLE')) ?
                                    <span
                                      className="remove"
                                      onClick={e => this.deleteVisualization(e, vis)}
                                    > &times;
                                    </span> : ''}
                                  <span
                                    className="btn btn-xs btn-success"
                                    onClick={() => this.openAddToDashboardForm(vis)}
                                  > +
                                  </span>
                                </RdTab>
                              ))}
                            <li className="rd-tab">{this.props.sourceMode && this.props.canEdit ?
                              <a onClick={this.openVisualizationEditor}>&plus; New Visualization</a> : ''}
                            </li>
                          </ul>
                          <div className="query__vis m-t-15 scrollbox">
                            <VisualizationRenderer
                              visualization={this.props.query.visualizations.length ?
                                             find(
                                               this.props.query.visualizations,
                                               { id: this.state.selectedTab },
                                             ) : {
                                               type: visualizationRegistry.CHART.type,
                                               options: visualizationRegistry.CHART.defaultOptions,
                                             }}
                              queryResult={this.props.queryResult}
                            />
                          </div>
                        </div>
                      </div> : ''}
                  </div>
                </section>
              </div>
            </div>
            <div className="bottom-controller-container">
              <div className="bottom-controller">
                {!this.props.query.isNew() && this.props.canEdit ?
                  <button
                    className="m-r-5 btn btn-default btn-edit-visualisation"
                    onClick={this.openVisualizationEditor(this.state.selectedTab)}
                  >Edit Visualization
                  </button> : ''}
                {!this.props.query.isNew() ? <button className="m-r-5 btn btn-default" onClick={this.showEmbedDialog(this.props.query, this.state.selectedTab)}><i className="zmdi zmdi-code" /> Embed</button> : ''}

                <DropDownButton
                  className="m-r-5 btn btn-default"
                  disabled={this.state.queryExecuting || !this.props.queryResult.getData()}
                  aria-haspopup="true"
                  aria-expanded="false"
                  title={<span>Download <span className="hidden-xs">Dataset </span></span>}
                  onSelect={this.downloadQueryResult}
                  pullRight={!this.props.query.isNew()}
                >
                  <MenuItem eventKey="csv" className="dropdown-menu">
                    <span className="fa fa-file-o" /> Download as CSV File
                  </MenuItem>
                  <MenuItem eventKey="xlsx" className="dropdown-menu">
                    <span className="fa fa-file-excel-o" /> Download as Excel File
                  </MenuItem>
                </DropDownButton>

                {data ?
                  <span className="query-metadata__bottom">
                    <span className="query-metadata__property">
                      <strong>{data.length}</strong>
                      {data.length === 1 ? 'row' : 'rows'}
                    </span>
                    <span className="query-metadata__property">
                      {this.state.queryExecuting ?
                        <strong>{durationHumanize(this.props.queryResult.getRuntime())}</strong> :
                        <span>Running&hellip;</span>}
                      <span className="hidden-xs">runtime</span>
                    </span>
                    {data.metadata.data_scanned ?
                      <span className="query-metadata__property">
                        Data Scanned
                        <strong>
                          {prettySize(this.props.queryResult.query_result.data.metadata.data_scanned)}
                        </strong>
                      </span> : ''}
                  </span> : ''}

                <div>
                  <span className="query-metadata__property">
                    <span className="hidden-xs">Updated </span>
                    {moment(this.props.queryResult.query_result.retrieved_at).fromNow()}
                  </span>

                  <button
                    className="m-l-5 btn btn-primary"
                    onClick={this.executeQuery}
                    disabled={this.state.queryExecuting || !this.canExecuteQuery()}
                    title="Refresh Dataset"
                  >
                    <span className="zmdi zmdi-play" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
