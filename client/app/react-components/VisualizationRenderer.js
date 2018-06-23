import React from 'react';
import PropTypes from 'prop-types';
import { visualizationRegistry } from '@/visualizations';

export default class VisualizationRenderer extends React.Component {
  static propTypes = {
    // eslint-disable-next-line react/no-unused-prop-types
    queryResult: PropTypes.object.isRequired,
    visualization: PropTypes.object.isRequired,
  }
  constructor(props) {
    super(props);
    this.state = { ready: false };
    props.queryResult.deferred.promise.then(() => this.setState({ ready: true }));
  }
  render() {
    // TODO dashboard filters
    const Vis = visualizationRegistry[this.props.visualization.type].renderer;
    if (this.state.ready) {
      return (
        <Vis
          options={this.props.visualization.options}
          queryResult={this.props.queryResult}
          clientConfig={this.props.clientConfig}
        />
      );
    }
    return null;
  }
}
