import React from 'react';
import PropTypes from 'prop-types';
import { visualizationRegistry } from '@/visualizations';
import Filters from './Filters';

export default class VisualizationRenderer extends React.Component {
  static propTypes = {
    queryResult: PropTypes.object.isRequired,
    visualization: PropTypes.object.isRequired,
  }
  constructor(props) {
    super(props);
    this.state = {
      ready: false,
      filters: this.props.queryResult.getFilters(),
    };
    this.props.queryResult.deferred.promise.then(() => this.setState({ ready: true }));
  }

  setFilters = (filters) => {
    this.props.queryResult.filters = filters;
    this.setState({ filters });
  }
  render() {
    const Vis = visualizationRegistry[this.props.visualization.type].renderer;
    if (this.state.ready) {
      return (
        <React.Fragment>
          {/* XXX replace this mutation with a clean separation of filter info from selection state */}
          <Filters filters={this.state.filters} onChange={this.setFilters} />
          <Vis
            filters={this.state.filters}
            options={this.props.visualization.options}
            queryResult={this.props.queryResult}
            clientConfig={this.props.clientConfig}
          />
        </React.Fragment>
      );
    }
    return null;
  }
}
