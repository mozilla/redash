import React from 'react';
import PropTypes from 'prop-types';
import { PromiseState } from 'react-refetch';
import { ButtonGroup, DropdownButton, MenuItem } from 'react-bootstrap';
import moment from 'moment';

import { durationHumanize, prettySize } from '@/filters';

export default class QueryViewFooter extends React.Component {
  static propTypes = {
    query: PropTypes.object.isRequired,
    canEdit: PropTypes.bool.isRequired,
    queryResult: PropTypes.instanceOf(PromiseState).isRequired,
    filteredData: PropTypes.object.isRequired,
    queryExecuting: PropTypes.bool.isRequired,
    canExecuteQuery: PropTypes.bool.isRequired,
  }
  openVisualizationEditor = () => {
    // set state for displaying vis-editor modal
    return null;
  }

  showEmbedDialog = () => {
    // toggle embed modal on
    return null;
  }

  downloadUrl = filetype => `api/queries/${this.props.query.id}/results/${this.props.queryResult.value.query_result.id}.${filetype}`

  downloadFilename = filetype => `${this.props.query.name.replace(' ', '_')}${moment(this.props.queryResult.value.query_result.retrieved_at).format('_YYYY_MM_DD')}.${filetype}`

  render() {
    if (!this.props.queryResult.fulfilled) return null;
    const queryResult = this.props.queryResult.value;
    return (
      <div className="bottom-controller">
        {this.props.query.id && this.props.canEdit ?
          <button
            className="m-r-5 btn btn-default btn-edit-visualisation"
            onClick={this.openVisualizationEditor}
          >Edit Visualization
          </button> : ''}
        {this.props.query.id ? <button className="m-r-5 btn btn-default" onClick={this.showEmbedDialog}><i className="zmdi zmdi-code" /> Embed</button> : ''}
        <ButtonGroup className="m-r-5">
          <DropdownButton
            dropup
            id="download-button"
            disabled={this.props.queryExecuting || !this.props.filteredData.rows.length}
            aria-haspopup="true"
            aria-expanded="false"
            title={<span>Download <span className="hidden-xs">Dataset </span></span>}
            onSelect={this.downloadQueryResult}
            pullRight={!!this.props.query.id}
          >
            <MenuItem target="_self" href={this.downloadUrl('csv')} download={this.downloadFilename('csv')}>
              <span className="fa fa-file-o" /> Download as CSV File
            </MenuItem>
            <MenuItem target="_self" href={this.downloadUrl('xlsx')} download={this.downloadFilename('xlsx')}>
              <span className="fa fa-file-excel-o" /> Download as Excel File
            </MenuItem>
          </DropdownButton>
        </ButtonGroup>

        {queryResult.data ?
          <span className="query-metadata__bottom">
            <span className="query-metadata__property">
              <strong>{queryResult.data.length}</strong>
              {queryResult.data.length === 1 ? 'row' : 'rows'}
            </span>
            <span className="query-metadata__property">
              {this.props.queryExecuting ?
                <strong>{durationHumanize(this.props.queryResult.runtime)}</strong> :
                <span>Running&hellip;</span>}
              <span className="hidden-xs">runtime</span>
            </span>
            {queryResult.data.metadata.data_scanned ?
              <span className="query-metadata__property">
                Data Scanned
                <strong>
                  {prettySize(queryResult.data.metadata.data_scanned)}
                </strong>
              </span> : ''}
          </span> : ''}

        <div>
          <span className="query-metadata__property">
            <span className="hidden-xs">Updated </span>
            {moment(queryResult.retrieved_at).fromNow()}
          </span>

          <button
            className="m-l-5 btn btn-primary"
            onClick={this.executeQuery}
            disabled={this.props.queryExecuting || !this.props.canExecuteQuery}
            title="Refresh Dataset"
          >
            <span className="zmdi zmdi-play" />
          </button>
        </div>
      </div>
    );
  }
}
