import React from 'react';
import PropTypes from 'prop-types';
import Modal from 'antd/lib/modal';
import Select from 'antd/lib/select';
import { each, map, sortBy } from 'lodash';
import { DropdownButton, MenuItem, OverlayTrigger, Popover } from 'react-bootstrap';

import EditInPlaceText from './EditInPlaceText';
import Overlay from './Overlay';

function getUrl(q, source, hash) {
  let url = `queries/${q.id}`;

  if (source) {
    url += '/source';
  }

  let params = '';
  if (window.location.search) {
    const searchParams = new URLSearchParams(window.location.search);
    each(searchParams.entries(), ([value, name]) => {
      if (value === null) {
        return;
      }

      if (params !== '') {
        params += '&';
      }

      params += `p_${encodeURIComponent(name)}_${q.id}=${encodeURIComponent(value)}`;
    });
  }

  if (params !== '') {
    url += `?${params}`;
  }

  if (hash) {
    url += `#${hash}`;
  }

  return url;
}

export default class QueryViewHeader extends React.Component {
  static propTypes = {
    canEdit: PropTypes.bool.isRequired,
    query: PropTypes.object.isRequired,
    updateQuery: PropTypes.func.isRequired,
    currentUser: PropTypes.object.isRequired,
    hasDataSources: PropTypes.bool.isRequired,
    dataSource: PropTypes.object.isRequired,
    sourceMode: PropTypes.bool.isRequired,
    showPermissionsControl: PropTypes.bool.isRequired,
    duplicateQuery: PropTypes.func.isRequired,
    archiveQuery: PropTypes.func.isRequired,
    getTags: PropTypes.func.isRequired,
    clientConfig: PropTypes.object.isRequired,
    Events: PropTypes.object.isRequired,
  }

  constructor(props) {
    super(props);
    this.state = {
      showApiKey: false,
      tags: this.props.query.tags ? this.props.query.tags.map(t => ({ label: t, value: t })) : [],
    };
  }

  saveName = name => this.props.updateQuery({ name })

  togglePublished = () => {
    this.props.Events.record('toggle_published', 'query', this.props.query.id);
    this.props.updateQuery({ is_draft: !this.props.query.is_draft });
  };

  showApiKey = () => this.setState({ showApiKey: true })
  hideApiKey = () => this.setState({ showApiKey: false })

  editTags = () => {
    this.props.getTags();
    this.setState({ editTags: true });
  }
  hideEditTags = () => this.setState({ editTags: false })

  updateTags = tags => this.setState({ tags })

  saveTags = () => {
    this.props.updateQuery({ tags: this.state.tags.map(t => t.value) });
    this.setState({ editTags: false });
  }

  render() {
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
          key="archiveQuery"
          eventKey="archiveQuery"
          onSelect={this.props.archiveQuery}
        >Archive
        </MenuItem>
      ));
      if (this.props.showPermissionsControl) {
        ownerButtons.push((
          <MenuItem
            key="managePermissionsModal"
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
          key="togglePublished"
          eventKey="togglePublished"
          onSelect={this.togglePublished}
        >Unpublish
        </MenuItem>
      ));
    }
    return (
      <div className="container">
        {this.props.canCreateQuery === false && this.props.query.isNew() ? noCreatePermission : ''}
        {!this.props.hasDataSources && this.props.currentUser.isAdmin ? makeDataSources : ''}
        {!this.props.hasDataSources && !this.props.currentUser.isAdmin ? noDataSources : ''}

        <div className="row p-l-15 p-b-10 m-l-0 m-r-0 page-header--new page-header--query">
          <Modal
            visible={this.state.showApiKey}
            onCancel={this.hideApiKey}
            footer={null}
          >
            <h5>API Key</h5>
            <pre>{this.props.query.api_key}</pre>
            <h5>Example API Calls:</h5>
            <div>
              Results in CSV format:
              <pre>{this.props.clientConfig.basePath}api/queries/{this.props.query.id}/results.csv?api_key={this.props.query.api_key}</pre>

              Results in JSON format:
              <pre>{this.props.clientConfig.basePath}api/queries/{this.props.query.id}/results.json?api_key={this.props.query.api_key}</pre>
            </div>
          </Modal>
          <Modal
            visible={this.state.editTags}
            onCancel={this.hideEditTags}
            title="Add/Edit Tags"
            footer={[
              <button className="btn btn-default" onClick={this.hideEditTags}>Close</button>,
              <button className="btn btn-primary" onClick={this.saveTags}>Save</button>,
            ]}
          >
            <Select
              mode="tags"
              placeholder="Add some tags..."
              value={this.state.tags}
              onChange={this.updateTags}
            >
              {(this.props.tags && this.props.tags.fulfilled) ?
               map(sortBy(map(this.props.tags.value, (count, tag) => ({ tag, count })), 'count'), item =>
                   (<Select.Option key={item.tag}>{item.tag}</Select.Option>)) : []}
            </Select>
          </Modal>
          <div className="col-sm-8 col-xs-7 p-0">
            <h3>
              <EditInPlaceText
                className="edit-in-place"
                editable={this.props.canEdit}
                onDone={this.saveName}
                ignoreBlanks
                value={this.props.query.name}
              />
              {this.props.query.is_draft && !this.props.query.is_archived ?
                <span className="label label-default">Unpublished</span> : null }
              {this.props.query.is_archived ?
                <OverlayTrigger trigger="mouseenter" overlay={archivedPopover}>
                  <span className="label label-warning">Archived</span>
                </OverlayTrigger> : null}
              {this.state.tags.map(t => <span key={t} className="label label-tag">{t}</span>)}
              {this.props.canEdit ?
                <a onClick={this.editTags} className="label label-tag">
                  {this.state.tags.length ?
                    <i className="zmdi zmdi-edit" /> :
                    <React.Fragment><i className="zmdi zmdi-plus" />Add tag</React.Fragment>}
                </a> : null}
            </h3>
          </div>

          <div className="col-sm-4 col-xs-5 p-0 source-control text-right">
            <span>
            {this.props.query.is_draft &&
             this.props.query.id &&
             (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin')) ?
               <button className="btn btn-default btn-publish" onClick={this.togglePublished}>
                 <span className="fa fa-paper-plane" /> Publish
               </button> : null}
            </span>
            <span>
            {this.props.query.id && this.props.currentUser.hasPermission('view_source') ?
              <a
                href={getUrl(this.props.query, !this.props.sourceMode, this.props.selectedTab)}
                className="btn btn-default btn--showhide"
              ><i className={'fa fa-' + (this.props.sourceMode ? 'table' : 'code')} aria-hidden="true" />
                {this.props.sourceMode ? 'Show Data Only' : 'Edit Source'}
              </a> : null}
            </span>
            {this.props.query.id ?
              <DropdownButton
                id="query-more-menu"
                className="btn btn-default"
                pullRight
                noCaret
                title={<span className="zmdi zmdi-more" />}
              >
                <MenuItem
                  eventKey="duplicateQuery"
                  className={!this.props.currentUser.hasPermission('edit_query') || !this.props.dataSource || this.props.dataSource.view_only ? 'disabled' : null}
                  onSelect={this.props.duplicateQuery}
                >
                    Fork
                </MenuItem>
                <MenuItem divider />
                {ownerButtons}
                {this.props.query.is_archived ? '' : <MenuItem divider />}
                {this.props.query.id ? <MenuItem onSelect={this.showApiKey} eventKey="showApiKey">Show API Key</MenuItem> : null}
                {/* remove for upstream */
                 /* this.props.canEdit && this.props.query.id && (this.props.query.version > 1) ?
                  <MenuItem eventKey="compareQueryVersion" onSelect={this.compareQueryVersion}>Query Versions</MenuItem> : null */}
              </DropdownButton> : null}
          </div>
        </div>
      </div>
    );
  }
}
