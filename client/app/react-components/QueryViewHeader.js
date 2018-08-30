import React from 'react';
import PropTypes from 'prop-types';
import 'react-select/dist/react-select.css';
import { each } from 'lodash';
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
    Events: PropTypes.object.isRequired,
  }

  saveName = name => name;

  togglePublished = () => {
    this.props.Events.record('toggle_published', 'query', this.props.query.id);
    this.props.updateQuery({ is_draft: !this.props.query.is_draft });
  };

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
          onSelect={this.archiveQuery}
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
          <div className="col-sm-8 col-xs-7 p-0">
            <h3>
              <EditInPlaceText
                className="edit-in-place"
                editable={this.props.canEdit}
                onDone={this.saveName}
                ignoreBlanks
                value={this.props.query.name}
              />
              {this.props.query.is_draft && !this.props.query.is_archived ? <span className="label label-default">Unpublished</span> : ''}
              {this.props.query.is_archived ?
                <OverlayTrigger trigger="mouseenter" overlay={archivedPopover}>
                  <span className="label label-warning">Archived</span>
                </OverlayTrigger> : ''}
            </h3>
          </div>

          <div className="col-sm-4 col-xs-5 p-0 source-control text-right">

            {this.props.query.is_draft &&
             this.props.query.id &&
             (this.props.isQueryOwner || this.props.currentUser.hasPermission('admin')) ?
               <button className="btn btn-default btn-publish" onClick={this.togglePublished}>
                 <span className="fa fa-paper-plane" /> Publish
               </button> : null}

            {this.props.query.id && this.props.currentUser.hasPermission('view_source') ?
              <a
                href={getUrl(this.props.query, !this.props.sourceMode, this.props.selectedTab)}
                className="btn btn-default btn--showhide"
              ><i className={'fa fa-' + (this.props.sourceMode ? 'table' : 'code')} aria-hidden="true" />
                {this.props.sourceMode ? 'Show Data Only' : 'Edit Source'}
              </a> : null}

            {this.props.query.id ?
              <DropdownButton
                id="query-more-menu"
                className="btn btn-default"
                pullRight
                title={<span className="zmdi zmdi-more" />}
              >
                <MenuItem
                  eventKey="duplicateQuery"
                  className={!this.props.currentUser.hasPermission('edit_query') || !this.props.dataSource || this.props.dataSource.view_only ? 'disabled' : ''}
                  onSelect={this.duplicateQuery}
                >
                    Fork
                </MenuItem>
                <MenuItem divider />
                {ownerButtons}
                {this.props.query.is_archived ? '' : <MenuItem divider />}
                {this.props.query.id ? <MenuItem onSelect={this.showApiKey} eventKey="showApiKey">Show API Key</MenuItem> : ''}
                {this.props.canEdit && this.props.query.id && (this.props.query.version > 1) ?
                  <MenuItem eventKey="compareQueryVersion" onSelect={this.compareQueryVersion}>Query Versions</MenuItem> : ''}
              </DropdownButton> : ''}
          </div>
        </div>
      </div>
    );
  }
}
