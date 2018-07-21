import React from 'react';
import PropTypes from 'prop-types';
import { find, map, sortBy } from 'lodash';
import { PromiseState } from 'react-refetch';

import visualizationRegistry from '@/visualizations/registry';
import QueryExecutionStatus from './QueryExecutionStatus';
import VisualizationRenderer from './VisualizationRenderer';
import Parameters from './Parameters';

function RdTab(props) {
  return (
    <li className={'rd-tab' + (props.tabId === props.selectedTab.id ? ' active' : '')}>
      <a onClick={e => props.onClick(e, props.tabId)} href={'#' /* XXX see Query.getUrl() */}>{props.name}{props.children}</a>
    </li>
  );
}

RdTab.propTypes = {
  tabId: PropTypes.string.isRequired,
  selectedTab: PropTypes.object.isRequired,
  // basePath: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  children: PropTypes.arrayOf(React.Component).isRequired,
  onClick: PropTypes.func.isRequired,
};

export default class QueryViewVisualizations extends React.Component {
  static propTypes = {
    clientConfig: PropTypes.object.isRequired,
    query: PropTypes.object.isRequired,
    updateQuery: PropTypes.func.isRequired,
    data: PropTypes.array.isRequired,
    queryResult: PropTypes.instanceOf(PromiseState).isRequired,
    sourceMode: PropTypes.bool.isRequired,
    canEdit: PropTypes.bool.isRequired,
    setFilters: PropTypes.func.isRequired,
    filters: PropTypes.array.isRequired,
    executeQueryResponse: PropTypes.instanceOf(PromiseState).isRequired,
  };

  constructor(props) {
    super(props);
    const vis = props.query.visualizations;
    this.state = {
      selectedTab: vis && vis.length ? vis[0] : 'TABLE',
    };
  }

  setParameters = parameters => this.props.updateQuery({ options: { ...this.query.options, parameters } })

  setSelectedTab = (e, tabId) => this.setState({ selectedTab: find(this.props.query.visualizations, { id: tabId }) })

  render() {
    return (
      <section className="flex-fill p-relative t-body">
        <div
          className="d-flex flex-column p-b-15 p-absolute"
          style={{
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
          }}
        >
          {this.props.query.options.parameters.length > 0 ?
            <div className="p-t-15 p-b-15">
              <Parameters
                clientConfig={this.props.clientConfig}
                parameters={this.props.query.options.parameters}
                syncValues={!!this.props.query.id}
                editable={this.props.sourceMode && this.props.canEdit}
                onChange={this.setParameters}
              />
            </div> : ''}
          <QueryExecutionStatus
            queryId={this.props.query.id}
            queryResult={this.props.queryResult}
            executeQueryResponse={this.props.executeQueryResponse}
            Event={this.props.Event}
          />
          {/* tabs and data */}
          {/* XXX check job */}
          {this.props.data ?
            <div className="flex-fill p-relative">
              <div
                className="d-flex flex-column p-absolute"
                style={{
                  left: 0,
                  top: 0,
                  right: 0,
                  bottom: 0,
                }}
              >
                {this.props.queryResult.fulfilled &&
                 this.props.queryResult.value.data &&
                 this.props.queryResult.value.data.log ?
                  <div className="p-10">
                    <p>Log Information:</p>
                    {this.props.queryResult.value.data.log.map(l => <p>{l}</p>)}
                  </div> : ''}

                <ul className="tab-nav">
                  {!this.props.query.visualizations.length ?
                    <RdTab
                      tabId="table"
                      name="Table"
                      selectedTab={this.state.selectedTab}
                      // basePath={this.props.query.getUrl(this.props.sourceMode)}
                      onClick={this.setSelectedTab}
                    /> : map(sortBy(this.props.query.visualizations, 'id'), (vis, i) => (
                      <RdTab
                        tabId={vis.id}
                        key={vis.name}
                        name={vis.name}
                        selectedTab={this.state.selectedTab}
                        // basePath={this.props.query.getUrl(this.props.sourceMode)}
                        onClick={this.setSelectedTab}
                      >
                        {this.props.canEdit && !((i > 0) && (vis.type === 'TABLE')) ?
                          <span
                            className="remove"
                            onClick={e => this.deleteVisualization(e, vis)}
                          > &times;
                          </span> : ''}
                        <span
                          className="btn btn-xs btn-success"
                          onClick={() => this.openAddToDashboardForm(vis)}
                        > +
                        </span>
                      </RdTab>
                    ))}
                  <li className="rd-tab">{this.props.sourceMode && this.props.canEdit ?
                    <a onClick={this.openVisualizationEditor}> + New Visualization</a> : ''}
                  </li>
                </ul>
                <div className="query__vis m-t-15 scrollbox">
                  <VisualizationRenderer
                    clientConfig={this.props.clientConfig}
                    data={this.props.data}
                    setFilters={this.props.setFilters}
                    filters={this.props.filters}
                    visualization={this.props.query.visualizations.length ?
                                   this.state.selectedTab :
                                   visualizationRegistry.TABLE}
                  />
                </div>
              </div>
            </div> : ''}
        </div>
      </section>
    );
  }
}
