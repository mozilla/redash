import React from 'react';
import PropTypes from 'prop-types';
import { Modal } from 'react-bootstrap';
import { map, range, partial } from 'lodash';
import moment from 'moment';

import { durationHumanize } from '@/filters';

function padWithZeros(size, v) {
  let str = String(v);
  if (str.length < size) {
    str = `0${str}`;
  }
  return str;
}

const hourOptions = map(range(0, 24), partial(padWithZeros, 2));
const minuteOptions = map(range(0, 60, 5), partial(padWithZeros, 2));

function scheduleInLocalTime(schedule) {
  const parts = schedule.split(':');
  return moment
    .utc()
    .hour(parts[0])
    .minute(parts[1])
    .local()
    .format('HH:mm');
}

export default class ScheduleDialog extends React.Component {
  static propTypes = {
    show: PropTypes.bool.isRequired,
    query: PropTypes.object.isRequired,
    refreshOptions: PropTypes.arrayOf(PropTypes.number).isRequired,
    updateQuery: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  }

  setTime = (h, m) => this.props.updateQuery({
    schedule: moment().hour(h).minute(m).utc()
      .format('HH:mm'),
  })
  setInterval = e => this.props.updateQuery({ schedule: e.target.value })
  setKeep = e => this.props.updateQuery({ schedule_resultset_size: e.target.value })
  setScheduleUntil = e => this.props.updateQuery({ schedule_until: e.target.value })
  render() {
    const schedule = this.props.query.schedule;
    const hasDailySchedule = schedule && schedule.match(/\d\d:\d\d/) !== null;
    let hour;
    let minute;
    if (hasDailySchedule) {
      const parts = scheduleInLocalTime(this.props.query.schedule).split(':');
      minute = parts[1];
      hour = parts[0];
    } else {
      minute = '15';
      hour = '00';
    }

    return (
      <Modal show={this.props.show} onHide={this.props.onClose}>
        <Modal.Header closeButton>
          <Modal.Title>Refresh Schedule</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="radio">
            <label>
              <input type="radio" checked={!hasDailySchedule} onChange={() => this.updateQuery({ schedule })} />
              <select
                disabled={hasDailySchedule}
                value={schedule}
                onChange={this.setInterval}
              >
                {this.props.refreshOptions.map(iv => (
                  <option value={String(iv)} key={iv}>
                    {`Every ${durationHumanize(iv)}`}
                  </option>
                )).concat([<option key="none" value="">No Refresh</option>])}
              </select>
            </label>
          </div>
          <div className="radio">
            <label>
              <input type="radio" checked={hasDailySchedule} onChange={() => this.setTime(hour, minute)} />
              <select disabled={!hasDailySchedule} value={hour} onChange={e => this.setTime(e.target.value, minute)}>
                {hourOptions.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
              <select disabled={!hasDailySchedule} value={minute} onChange={e => this.setTime(hour, e.target.value)}>
                {minuteOptions.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
          </div>
          <label>
            Stop scheduling at date/time (format yyyy-MM-ddTHH:mm:ss, like 2016-12-28T14:57:00):
            <input type="datetime-local" step="1" className="form-control" value={this.props.query.schedule_until} onChange={this.setScheduleUntil} />
          </label>
          <label>
            Number of query results to keep <input type="number" className="form-control" value={this.props.query.schedule_resultset_size || 0} onChange={this.setKeep} disabled={!schedule} />
          </label>
        </Modal.Body>
      </Modal>
    );
  }
}
