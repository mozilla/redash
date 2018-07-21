import React from 'react';
import PropTypes from 'prop-types';
import moment from 'moment';
import { PromiseState } from 'react-refetch';

const statuses = {
  1: 'waiting',
  2: 'processing',
  3: 'done',
  4: 'failed',
};


export default class QueryExecutionStatus extends React.Component {
  static propTypes = {
    queryId: PropTypes.number.isRequired,
    queryResult: PropTypes.instanceOf(PromiseState).isRequired,
    executeQueryResponse: PropTypes.instanceOf(PromiseState),
  }


  static defaultProps = {
    executeQueryResponse: {},
  }
  constructor(props) {
    super(props);
    this.state = {
      currentTime: '00:00:00',
      cancelling: false,
    };
  }

  componentDidMount() {
    this.startTimer();
  }

  componentDidUpdate() {
    if (this.status() === 'processing' || this.status() === 'waiting') {
      this.startTimer();
    }
  }

  componentWillUnmount() {
    if (this.currentTimer) {
      clearInterval(this.currentTimer);
    }
  }

  startTimer = () => {
    const self = this;
    this.currentTimer = setInterval(() => {
      const timestamp = this.props.queryResult.fulfilled ? this.props.queryResult.value.retrieved_at : moment();
      self.setState({
        currentTime: moment(moment() - moment(timestamp)).utc().format('HH:mm:ss'),
        error: self.props.executeQueryResponse.value.error || undefined,
      });
      if (self.currentTimer && self.status() !== 'processing' && self.status() !== 'waiting') {
        clearInterval(self.currentTimer);
        self.setState({ currentTime: '00:00:00' });
        self.currentTimer = null;
      }
    }, 1000);
  }

  cancelExecution = () => {
    this.setState({ cancelling: true });
    this.props.cancelExecution(this.props.executeQueryResponse.value.job.id);
    this.props.Events.record('cancel_execute', 'query', this.props.queryId);
  }

  status = () => statuses[this.props.executeQueryResponse.value.status]

  render() {
    if (!this.props.executeQueryResponse.fulfilled || !this.props.executeQueryResponse.value) return null;
    const status = this.status();
    let display;
    let error;
    if (status === 'processing') {
      display = (
        <div className="alert alert-info m-t-15">
          Executing query&hellip;
          {this.state.currentTime}
          <button
            type="button"
            className="btn btn-warning btn-xs pull-right"
            disabled={this.state.cancelling}
            onClick={this.cancelExecution}
          >Cancel
          </button>
        </div>
      );
    } else if (this.props.status === 'waiting') {
      display = (
        <div className="alert alert-info m-t-15">
          Query in queue&hellip;
          {this.state.currentTime}
          <button
            type="button"
            className="btn btn-warning btn-xs pull-right"
            disabled={this.state.cancelling}
            onClick={this.cancelExecution}
          >Cancel
          </button>
        </div>
      );
    } else if (this.props.status === 'loading-result') {
      display = (
        <div className="alert alert-info m-t-15">
          Loading results&hellip;
          {this.state.currentTime}
        </div>
      );
    }
    if (this.state.error) {
      error = (
        <div className="alert alert-danger m-t-15">Error running query: <strong>{this.state.error}</strong>
        </div>
      );
    }
    return (
      <div className="query-alerts">
        {display}
        {error}
      </div>
    );
  }
}
