import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import 'react-select/dist/react-select.css';
import { PromiseState } from 'react-refetch';

import FlexResizable from './FlexResizable';
import QueryMetadata from './QueryMetadata';
import SchemaBrowser from './SchemaBrowser';

export default class QueryViewNav extends React.Component {
  static propTypes = {
    canEdit: PropTypes.bool.isRequired,
    currentUser: PropTypes.object.isRequired,
    query: PropTypes.object.isRequired,
    updateAndSaveQuery: PropTypes.func.isRequired,
    dataSource: PropTypes.object.isRequired,
    dataSources: PropTypes.array.isRequired,
    sourceMode: PropTypes.bool.isRequired,
    setDataSource: PropTypes.func.isRequired,
    schema: PropTypes.instanceOf(PromiseState).isRequired,
    refreshSchema: PropTypes.func.isRequired,
    editorPaste: PropTypes.func.isRequired,
    clientConfig: PropTypes.object.isRequired,
  }


  render() {
    // const dataSourceVersionMsg = this.props.dataSourceVersion.fulfilled ? this.props.dataSourceVersion.value.message : '';
    const canScheduleQuery = this.props.currentUser.hasPermission('schedule_query');
    const isQueryOwner = (this.props.currentUser.id === this.props.query.user.id ||
                          this.props.currentUser.hasPermission('admin'));

    return (
      <FlexResizable direction="right" elementName="nav">
        <div className="editor__left__data-source">
          <Select
            value={this.props.dataSource}
            onChange={this.props.setDataSource}
            disabled={!isQueryOwner || !this.props.sourceMode}
            placeholder="Select Data Source..."
            options={this.props.dataSources.map(d => ({ value: d.id, label: d.name }))}
          />
          {/* this.props.dataSource.options.doc_url !== '' && this.props.dataSource.options.doc_url ? <a href={this.props.dataSource.options.doc_url}>{this.props.dataSource.type_name} documentation</a> : '' */}
          {/* this.props.dataSource.options.doc_url === '' || !this.props.dataSource.options.doc_url ? <span>{this.props.dataSource.type_name} documentation</span> : '' */}
          {/* dataSourceVersionMsg.includes('no') ? <span className="fa fa-exclamation-circle" title={dataSourceVersionMsg} /> : <span>{dataSourceVersionMsg}</span> */}
        </div>
        {this.props.sourceMode ?
          <div className="editor__left__schema">
            <SchemaBrowser
              schema={this.props.schema}
              onRefresh={this.props.refreshSchema}
              editorPaste={this.props.editorPaste}
            />
            {/* tableToggleString={this.props.dataSource.options.toggle_table_string} */}

          </div> :
          <div style={{ flexGrow: 1 }}>&nbsp;</div>
        }
        <QueryMetadata
          mobile={false}
          query={this.props.query}
          saveQuery={this.props.updateAndSaveQuery}
          canEdit={this.props.canEdit}
          canScheduleQuery={canScheduleQuery}
          clientConfig={this.props.clientConfig}
        />
      </FlexResizable>

    );
  }
}
