import React from 'react';
import PropTypes from 'prop-types';
import visualizationRegistry from '@/visualizations/registry';
import Filters from './Filters';

export default class VisualizationRenderer extends React.Component {
  static propTypes = {
    clientConfig: PropTypes.object.isRequired,
    visualization: PropTypes.object.isRequired,
    setFilters: PropTypes.func.isRequired,
    filters: PropTypes.array.isRequired,
    data: PropTypes.array.isRequired,
  }

  render() {
    const Vis = visualizationRegistry[this.props.visualization.type].renderer;
    return (
      <React.Fragment>
        <Filters filters={this.props.filters} onChange={this.props.setFilters} />
        <Vis
          filters={this.props.filters}
          options={this.props.visualization.options}
          data={this.props.data}
          clientConfig={this.props.clientConfig}
        />
      </React.Fragment>
    );
  }
}
