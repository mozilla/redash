import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';

import { scheduleHumanize } from '@/filters/index';
import EditInPlaceText from './EditInPlaceText';
import ScheduleDialog from './ScheduleDialog';

function timeAgo(when) {
  return when ? moment(when).fromNow() : '-';
}

export default class QueryMetadata extends React.Component {
  static propTypes = {
    mobile: PropTypes.bool.isRequired,
    query: PropTypes.object.isRequired,
    updateQuery: PropTypes.func.isRequired,
    canEdit: PropTypes.bool.isRequired,
    canScheduleQuery: PropTypes.bool.isRequired,
  };
  constructor(props) {
    super(props);
    this.state = {
      showScheduleDialog: false,
    };
  }

  openScheduleForm = () => {
    if (!(this.props.canEdit || this.props.canScheduleQuery)) {
      return;
    }
    this.setState({ showScheduleDialog: true });
  }

  closeScheduleForm = () => this.setState({ showScheduleDialog: false });

  saveDescription = description => this.props.updateQuery({ description })

  render() {
    if (this.props.mobile) {
      return (
        <div className="row query-metadata__mobile">
          <div className="col-xs-4 text-left">
            <span className="m-r-5">Created by</span>
            <img alt="" src={this.props.query.user.profile_image_url} className="profile__image_thumb" /> <strong>{timeAgo(this.props.query.created_at)}</strong>
          </div>
          {!this.props.query.id ? null :
          <div className="col-xs-4 text-center">
            <span className="m-r-5">Updated by</span>
            <img alt={this.props.query.user.name} src={this.props.query.last_modified_by.profile_image_url} className="profile__image_thumb" /><strong>{timeAgo(this.props.query.updated_at)}</strong>
          </div> }
          <div className="col-xs-4 text-right">
            <ScheduleDialog
              show={this.state.showScheduleDialog}
              query={this.props.query}
              updateQuery={this.props.updateQuery}
              refreshOptions={this.props.clientConfig.queryRefreshIntervals}
              onClose={this.closeScheduleForm}
            />
            <span className="query-metadata__property">Refresh Schedule</span>
            {!this.props.query.id ?
              <span>Never</span> :
              <a role="button" tabIndex="0" onKeyPress={this.openScheduleForm} onClick={this.openScheduleForm}>{scheduleHumanize(this.props.schedule)}</a>}
          </div>
        </div>
      );
    }
    if (!this.props.query.id) {
      return null;
    }
    return (
      <React.Fragment>
        <div className="query-metadata query-metadata--description">
          <EditInPlaceText
            className="edit-in-place"
            editable={this.props.canEdit}
            onDone={this.saveDescription}
            editor="textarea"
            placeholderText="Add description"
            ignoreBlanks={false}
            value={this.props.query.description}
          />
        </div>
        <div className="query-metadata query-metadata--history">
          <table>
            <tbody>
              <tr>
                <td>
                  <img alt={this.props.query.user.name} src={this.props.query.user.profile_image_url} className="profile__image_thumb" /> <strong className="meta__name">{this.props.query.user.name}</strong>
                </td>
                <td className="text-right">
                  created <strong>{timeAgo(this.props.query.created_at)}</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <img alt={this.props.query.last_modified_by.name} src={this.props.query.last_modified_by.profile_image_url} className="profile__image_thumb" /> <strong className="meta__name">{this.props.query.last_modified_by.name}</strong>
                </td>
                <td className="text-right">
                  updated <strong>{timeAgo(this.props.query.updated_at)}</strong>
                </td>
              </tr>
              <tr>
                <td className="p-t-15">
                  <span className="query-metadata__property"><span className="zmdi zmdi-refresh" />Refresh Schedule</span>
                </td>
                <td className="p-t-15 text-right">
                  <ScheduleDialog
                    show={this.state.showScheduleDialog}
                    query={this.props.query}
                    updateQuery={this.props.updateQuery}
                    refreshOptions={this.props.clientConfig.queryRefreshIntervals}
                    onClose={this.closeScheduleForm}
                  />
                  <a role="button" tabIndex="0" onKeyPress={this.openScheduleForm} onClick={this.openScheduleForm}>{scheduleHumanize(this.props.query.schedule)}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </React.Fragment>
    );
  }
}
