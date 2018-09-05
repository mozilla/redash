import React from 'react';
import PropTypes from 'prop-types';
import { map } from 'lodash';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { PromiseState } from 'react-refetch';

import AceEditor from 'react-ace';
import ace from 'brace';
import toastr from 'angular-toastr';

import 'brace/ext/language_tools';
import 'brace/mode/json';
import 'brace/mode/python';
import 'brace/mode/sql';
import 'brace/theme/textmate';
import 'brace/ext/searchbox';

import { DataSource, Schema } from './proptypes';
import ParameterSettings from './ParameterSettings';

const langTools = ace.acequire('ace/ext/language_tools');
const snippetsModule = ace.acequire('ace/snippets');

// By default Ace will try to load snippet files for the different modes and fail.
// We don't need them, so we use these placeholders until we define our own.
function defineDummySnippets(mode) {
  ace.define(`ace/snippets/${mode}`, ['require', 'exports', 'module'], (require, exports) => {
    exports.snippetText = '';
    exports.scope = mode;
  });
}

defineDummySnippets('python');
defineDummySnippets('sql');
defineDummySnippets('json');

function buildKeywordsFromSchema(schema) {
  const keywords = {};
  schema.forEach((table) => {
    keywords[table.name] = 'Table';

    table.columns.forEach((c) => { // autoCompleteColumns
      if (c.charAt(c.length - 1) === ')') {
        let parensStartAt = c.indexOf('(') - 1;
        c = c.substring(0, parensStartAt);
        parensStartAt = 1; // linter complains without this line
      }
      // remove '[P] ' for partition keys
      if (c.charAt(0) === '[') {
        c = c.substring(4, c.length);
      }
      // keywords[c] = 'Column'; // dups columns
      keywords[`${table.name}.${c}`] = 'Column';
    });
  });

  return map(keywords, (v, k) =>
    ({
      name: k,
      value: k,
      score: 0,
      meta: v,
    }));
}

export default class QueryEditor extends React.Component {
  static propTypes = {
    queryText: PropTypes.string.isRequired,
    formatQuery: PropTypes.func.isRequired,
    autocompleteQuery: PropTypes.bool, // eslint-disable-line react/no-unused-prop-types
    schema: PropTypes.instanceOf(PromiseState).isRequired, // eslint-disable-line react/no-unused-prop-types
    dataSources: PropTypes.arrayOf(DataSource),
    dataSource: DataSource,
    canEdit: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
    isQueryOwner: PropTypes.bool.isRequired,
    updateDataSource: PropTypes.func.isRequired,
    canExecuteQuery: PropTypes.bool.isRequired,
    executeQuery: PropTypes.func.isRequired,
    queryExecuting: PropTypes.bool.isRequired,
    saveQuery: PropTypes.func.isRequired,
    updateQuery: PropTypes.func.isRequired,
    listenForResize: PropTypes.func.isRequired,
    refEditor: PropTypes.element.isRequired,
    parameters: PropTypes.array.isRequired,
    updateParameters: PropTypes.func.isRequired,
  }

  static defaultProps = {
    autocompleteQuery: false,
    dataSource: { options: { doc: '' } },
    dataSources: [],
  }

  constructor(props) {
    super(props);
    this.state = {
      schema: null, // eslint-disable-line react/no-unused-state
      keywords: [], // eslint-disable-line react/no-unused-state
      autocompleteQuery: false,
      addNewParameter: false,
    };
    langTools.addCompleter({
      getCompletions: (state, session, pos, prefix, callback) => {
        if (prefix.length === 0) {
          callback(null, []);
          return;
        }
        callback(null, this.state.keywords);
      },
    });

    this.onLoad = (editor) => {
      // Release Cmd/Ctrl+L to the browser
      editor.commands.bindKey('Cmd+L', null);
      editor.commands.bindKey('Ctrl+P', null);
      editor.commands.bindKey('Ctrl+L', null);

      //   this.props.QuerySnippet.query((snippets) => {
      //     const snippetManager = snippetsModule.snippetManager;
      //     const m = {
      //       snippetText: '',
      //     };
      //     m.snippets = snippetManager.parseSnippetFile(m.snippetText);
      //     snippets.forEach((snippet) => {
      //       m.snippets.push(snippet.getSnippet());
      //     });
      //     snippetManager.register(m.snippets || [], m.scope);
      //   });
      editor.focus();
      this.props.listenForResize(() => editor.resize());
    };

    this.formatQuery = () => {
      this.props.formatQuery(this.props.dataSource.syntax || 'sql', this.props.queryText);
    };
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (!nextProps.schema.fulfilled) {
      return { ...prevState, keywords: [], autocompleteQuery: false };
    } else if (nextProps.schema.value.schema !== prevState.schema) {
      const schema = nextProps.schema.value.schema;
      return {
        ...prevState,
        schema,
        keywords: buildKeywordsFromSchema(schema),
        autocompleteQuery: (schema.reduce((totalLength, table) =>
          totalLength + table.columns.length, 0) <= 5000 && nextProps.autocompleteQuery),
      };
    }
    return prevState;
  }

  addNewParameter = () => {
    this.setState({ addNewParameter: true });
    this.props.updateParameters([
      ...this.props.parameters,
      {
        title: '',
        name: '',
        type: 'text',
        value: null,
        global: false,
      }]);
  }
  updateParameter = p =>
    this.props.updateParameters([...this.props.parameters.slice(0, -1),
      { ...this.props.parameters[this.props.parameters.length - 1], ...p }])

  hideNewParameter = () => {
    this.setState({ addNewParameter: false });
    if (this.props.parameters[this.props.parameters.length - 1].name === '') {
      this.props.updateParameters(this.props.parameters.slice(0, -1));
    }
    const editor = this.props.refEditor.current.editor;
    editor.session.doc.replace(
      editor.selection.getRange(),
      `{{${this.props.parameters[this.props.parameters.length - 1].name}}}`,
    );
    editor.focus();
  }

  render() {
    const modKey = this.props.KeyboardShortcuts.modKey;
    const parameterTooltip = <Tooltip id="parameterTooltip">Add New Parameter (<i>{modKey} + P</i>)</Tooltip>;
    const formatTooltip = <Tooltip id="formatTooltip">Format Query</Tooltip>;
    const saveTooltip = <Tooltip id="saveTooltip">{modKey} + S</Tooltip>;
    const executeTooltip = <Tooltip id="executeTooltip">{modKey} + Enter</Tooltip>;
    const acTooltip = <Tooltip id="acTooltip">Autocomplete</Tooltip>;
    const hasDoc = this.props.dataSource.options && this.props.dataSource.options.doc;

    return (
      <section style={{ height: '100%' }}>
        <ParameterSettings
          show={!!this.state.addNewParameter}
          parameter={this.props.parameters && this.props.parameters[this.props.parameters.length - 1]}
          updateParameter={this.updateParameter}
          onHide={this.hideNewParameter}
          isNewParameter
          parameters={this.props.parameters}
          clientConfig={this.props.clientConfig}
        />
        <div className="container p-15 m-b-10" style={{ height: '100%' }}>
          <div style={{ height: 'calc(100% - 40px)', marginBottom: '0px' }} className="editor__container">
            <AceEditor
              ref={this.props.refEditor}
              theme="textmate"
              mode={this.props.dataSource.syntax || 'sql'}
              value={this.props.queryText}
              editorProps={{ $blockScrolling: Infinity }}
              width="100%"
              height="100%"
              setOptions={{
                behavioursEnabled: true,
                enableSnippets: true,
                enableBasicAutocompletion: true,
                enableLiveAutocompletion: this.state.autocompleteQuery,
                autoScrollEditorIntoView: true,
              }}
              showPrintMargin={false}
              wrapEnabled={false}
              onLoad={this.onLoad}
              onChange={this.props.updateQuery}
            />
          </div>

          <div className="editor__control">
            <div className="form-inline d-flex">
              <OverlayTrigger placement="top" overlay={parameterTooltip}>
                <button type="button" className="btn btn-default m-r-5" onClick={this.addNewParameter}>&#123;&#123;&nbsp;&#125;&#125;</button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={formatTooltip}>
                <button type="button" className="btn btn-default" onClick={this.formatQuery}>
                  <span className="zmdi zmdi-format-indent-increase" />
                </button>
              </OverlayTrigger>
              <OverlayTrigger placement="top" overlay={acTooltip}>
                <Button active={this.state.autocompleteQuery} bsStyle="default" onClick={() => this.setState({ autocompleteQuery: !this.state.autocompleteQuery })} >
                  <span className="fa fa-magic" />
                </Button>
              </OverlayTrigger>


              <select className="form-control datasource-small flex-fill w-100" onChange={this.props.updateDataSource} disabled={!this.props.isQueryOwner}>
                {this.props.dataSources.map(ds => <option label={ds.name} value={ds.id} key={`ds-option-${ds.id}`}>{ds.name}</option>)}
              </select>
              {hasDoc ? <a href={this.props.dataSource.options.doc_url}>{this.props.dataSource.type_name} documentation</a> : null}
              {hasDoc ? this.props.dataSource.type_name : null}

              {this.props.canEdit ?
                <OverlayTrigger placement="top" overlay={saveTooltip}>
                  <button className="btn btn-default m-l-5" onClick={this.props.saveQuery} title="Save">
                    <span className="fa fa-floppy-o" />
                    <span className="hidden-xs">Save</span>
                    {this.props.isDirty ? '*' : null}
                  </button>
                </OverlayTrigger> : null }
              <OverlayTrigger placement="top" overlay={executeTooltip}>
                <button type="button" className="btn btn-primary m-l-5" disabled={this.props.queryExecuting || !this.props.canExecuteQuery} onClick={this.props.executeQuery}>
                  <span className="zmdi zmdi-play" />
                  <span className="hidden-xs">Execute</span>
                </button>
              </OverlayTrigger>
            </div>
          </div>
        </div>

      </section>);
  }
}
