import React from 'react';
import PropTypes from 'prop-types';
import Modal from 'antd/lib/modal';
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

export default class ScheduleDialog extends React.Component {
  static propTypes = {
    show: PropTypes.bool.isRequired,
    query: PropTypes.object.isRequired,
    refreshOptions: PropTypes.arrayOf(PropTypes.number).isRequired,
    saveQuery: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
  }

  setTime = (h, m) => this.props.saveQuery({}, {
    schedule: moment().hour(h).minute(m).utc()
      .format('HH:mm'),
  })
  setInterval = e => this.props.saveQuery({}, { schedule: e.target.value })
  setKeep = e => this.props.saveQuery({}, { schedule_resultset_size: e.target.value })
  setScheduleUntil = e => this.props.saveQuery({}, { schedule_until: e.target.value })
  render() {
    const schedule = this.props.query.schedule;
    const hasDailySchedule = this.props.query.hasDailySchedule();
    let hour;
    let minute;
    if (hasDailySchedule) {
      const parts = this.props.query.scheduleInLocalTime().split(':');
      minute = parts[1];
      hour = parts[0];
    } else {
      minute = '15';
      hour = '00';
    }

    return (
      <Modal
        visible={this.props.show}
        onCancel={this.props.onClose}
        title="Refresh Schedule"
        footer={null}
      >
        <div className="radio">
          <label>
            <input type="radio" checked={!hasDailySchedule} onChange={() => this.saveQuery({}, { schedule })} />
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
      </Modal>
    );
  }
}
