import React from 'react';
import PropTypes from 'prop-types';
import visualizationRegistry from '@/visualizations/registry';

export default class VisualizationOptionsEditor extends React.Component {
  static propTypes = {
    // eslint-disable-next-line react/no-unused-prop-types
    queryResult: PropTypes.object.isRequired,
    visualization: PropTypes.object.isRequired,
    updateVisualization: PropTypes.func.isRequired,
  }
  render() {
    // TODO dashboard filters
    const Editor = visualizationRegistry[this.props.visualization.type].editor;
    return (
      <Editor
        visualization={this.props.visualization}
        updateVisualization={this.props.updateVisualization}
        queryResult={this.props.queryResult}
        clientConfig={this.props.clientConfig}
      />
    );
  }
}
