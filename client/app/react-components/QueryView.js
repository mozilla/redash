import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import 'react-select/dist/react-select.css';
import { OverlayTrigger, Popover } from 'react-bootstrap';
import { find, map, sortBy } from 'lodash';

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
      <a href={`${props.basePath}#${props.tabId}`}>{props.name}{...props.children}</a>
    </li>
  );
}

RdTab.propTypes = {
  tabId: PropTypes.string.isRequired,
  selectedTab: PropTypes.string.isRequired,
  basePath: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  children: PropTypes.arrayOf(React.Component).isRequired,
};

export default class QueryView extends React.Component {
  constructor(props) {
    super(props);
    this.queryEditor = React.createRef();
  }

  render() {
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
        <li>
          <a
            role="button"
            tabIndex="-1"
            onClick={this.archiveQuery}
            onKeyPress={this.archiveQuery}
          >Archive
          </a>
        </li>
      ));
      if (this.props.showPermissionsControl) {
        ownerButtons.push((
          <li>
            <a
              role="button"
              tabIndex="-1"
              onKeyPress={this.showManagePermissionsModal}
              onClick={this.showManagePermissionsModal}
            >Manage Permissions
            </a>
          </li>
        ));
      }
    }
    if (!this.props.query.is_draft &&
        this.props.query.id !== undefined &&
        (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin'))) {
      ownerButtons.push((
        <li>
          <a
            role="button"
            tabIndex="-1"
            onKeyPress={this.togglePublished}
            onClick={this.togglePublished}
          >Unpublish
          </a>
        </li>
      ));
    }
    return (
      <div className="query-page-wrapper">
        <div className="container">
          {this.props.canCreateQuery === false && this.props.query.isNew() ? noCreatePermission : ''}
          {this.props.noDataSources && this.props.currentUser.isAdmin ? makeDataSources : ''}
          {this.props.noDataSources && !this.props.currentUser.isAdmin ? noDataSources : ''}
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
                {this.props.query.is_draft && !this.props.query.is_archived ? <span className="label label-default">Unvpublished</span> : ''}
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
                <div ng-show="" id="query-more-menu" className="btn-group" role="group" uib-dropdown>
                  <button className="btn btn-default dropdown-toggle" uib-dropdown-toggle>
                    <span className="zmdi zmdi-more" />
                  </button>
                  <ul className="dropdown-menu pull-right" uib-dropdown-menu>
                    <li className={!this.props.query.id || !this.canForkQuery() ? 'disabled' : ''}>
                      <a
                        role="button"
                        tabIndex="-1"
                        onKeyPress={this.duplicateQuery}
                        onClick={this.duplicateQuery}
                      >Fork
                      </a>
                    </li>
                    <li className="divider" />
                    {ownerButtons}
                    <li className="divider" ng-if="!query.is_archived" />
                    <li ng-if="query.id != undefined"><a ng-click="showApiKey()">Show API Key</a></li>
                    <li ng-show="canEdit" ng-if="query.id && (query.version > 1)">
                      <a ng-click="compareQueryVersion()">Query Versions</a>
                    </li>
                  </ul>
                </div> : ''}
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
                  schema={this.state.schema}
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
                      schema={this.state.schema}
                      syntax={this.state.dataSource.syntax}
                      isQueryOwner={this.props.isQueryOwner}
                      updateDataSource={this.updateDataSource}
                      executeQuery={this.executeQuery}
                      canExecuteQuery={this.props.canExecuteQuery}
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
                            <div className="p-10" ng-show="showLog">
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
                              /> : map(sortBy(this.props.query.visualizations, 'id'), (vis, i) => (
                                <RdTab
                                  tabId={vis.id}
                                  name={vis.name}
                                  selected={this.state.selectedTab}
                                  basePath={this.props.query.getUrl(this.props.sourceMode)}
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
                                            find(this.props.query.visualizations,
                                                 { id: this.state.selectedTab }) :
                                            {
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
                >
                  {/* XXX pull-right? */}
                  <MenuItem eventKey="csv" className="dropdown-menu">
                    <span className="fa fa-file-o" /> Download as CSV File
                  </MenuItem>
                  <MenuItem eventKey="xlsx" className="dropdown-menu">
                    <span className="fa fa-file-excel-o" /> Download as Excel File
                  </MenuItem>
                </DropDownButton>

                {this.props.queryResult.getData() ?
                  <span className="query-metadata__bottom">
                    <span className="query-metadata__property">
                      <strong>{this.props.queryResult.getData().length}</strong>
                      {pluralize(queryResult.getData().length)}
                    </span>
                    <span className="query-metadata__property">
                      {this.state.queryExecuting ?
                        <strong>{durationHumanize(this.props.queryResult.getRuntime())}</strong> :
                        <span>Running&hellip;</span>}
                      <span className="hidden-xs">runtime</span>
                    </span>
                    {queryResult.query_result.data.metadata.data_scanned ?
                      <span className="query-metadata__property">
                        Data Scanned
                        <strong>
                          {prettySize(this.props.queryResult.query_result.data.metadata.data_scanned)}
                        </strong>
                      </span> : ''}
                  </span> : ''}

                <div>
                  <span className="query-metadata__property"><span className="hidden-xs">Updated </span><rd-time-ago value="queryResult.query_result.retrieved_at"></rd-time-ago></span>

                  <button
                    className="m-l-5 btn btn-primary"
                    onClick={this.executeQuery}
                    disabled={this.state.queryExecuting || !this.props.canExecuteQuery()}
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
