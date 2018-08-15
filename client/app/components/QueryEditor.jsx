import React from 'react';
import PropTypes from 'prop-types';
import { map } from 'lodash';
import Tooltip from 'antd/lib/tooltip';
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
    table.columns.forEach((c) => {
      keywords[c] = 'Column';
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

class QueryEditor extends React.Component {
  static propTypes = {
    queryText: PropTypes.string.isRequired,
    autocompleteQuery: PropTypes.bool, // eslint-disable-line react/no-unused-prop-types
    addNewParameter: PropTypes.func.isRequired,
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
    listenForEditorCommand: PropTypes.func.isRequired,
    queryExecuting: PropTypes.bool.isRequired,
    refEditor: PropTypes.element.isRequired,
  }

  static defaultProps = {
    schema: null,
    autocompleteQuery: false,
    dataSource: { options: { doc: '' } },
    dataSources: [],
  };

  constructor(props) {
    super(props);
    this.state = {
      schema: null, // eslint-disable-line react/no-unused-state
      keywords: [], // eslint-disable-line react/no-unused-state
      autocompleteQuery: true,
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

      // this.props.QuerySnippet.query((snippets) => {
      //   const snippetManager = snippetsModule.snippetManager;
      //   const m = {
      //     snippetText: '',
      //   };
      //   m.snippets = snippetManager.parseSnippetFile(m.snippetText);
      //   snippets.forEach((snippet) => {
      //     m.snippets.push(snippet.getSnippet());
      //   });
      //   snippetManager.register(m.snippets || [], m.scope);
      // });
      editor.focus();
      self.props.listenForResize((e) => { editor.resize(); });
      this.props.listenForEditorCommand((e, command, ...args) => {
        switch (command) {
          case 'focus': {
            editor.focus();
            break;
          }
          case 'paste': {
            const [text] = args;
            editor.session.doc.replace(editor.selection.getRange(), text);
            const range = editor.selection.getRange();
            this.props.updateQuery(editor.session.getValue());
            editor.selection.setRange(range);
            break;
          }
          default:
            break;
        }
      });
    };

    this.formatQuery = () => {
      this.props.formatQuery(this.props.dataSource.syntax || 'sql', this.props.queryText);
    }
  }

  static getDerivedStateFromProps(nextProps, prevState) {
    if (!nextProps.schema.fulfilled) {
      return { keywords: [], autocompleteQuery: false };
    } else if (nextProps.schema.value.schema !== prevState.schema) {
      const schema = nextProps.schema.value.schema;
      return {
        schema,
        keywords: buildKeywordsFromSchema(schema),
        autocompleteQuery: (schema.reduce((totalLength, table) =>
          totalLength + table.columns.length, 0) <= 5000 && nextProps.autocompleteQuery),
      };
    }
    return null;
  }

  render() {
    // eslint-disable-next-line react/prop-types
    const modKey = this.props.KeyboardShortcuts.modKey;

    const isExecuteDisabled = this.props.queryExecuting || !this.props.canExecuteQuery();

    return (
      <section style={{ height: '100%' }}>
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
              <Tooltip placement="top" title={<span>Add New Parameter (<i>{modKey} + P</i>)</span>}>
                <button type="button" className="btn btn-default m-r-5" onClick={this.props.addNewParameter}>&#123;&#123;&nbsp;&#125;&#125;</button>
              </Tooltip>
              <Tooltip placement="top" title="Format Query">
                <button type="button" className="btn btn-default m-r-5" onClick={this.formatQuery}>
                  <span className="zmdi zmdi-format-indent-increase" />
                </button>
              </Tooltip>
              <Tooltip placement="top" title="Autocomplete">
                <button type="button" className={'btn btn-default m-r-5' + (this.state.autocompleteQuery ? ' active' : '')} onClick={() => this.setState({ autocompleteQuery: !this.state.autocompleteQuery })} >
                  <span className="fa fa-magic" />
                </button>
              </Tooltip>
              <select className="form-control datasource-small flex-fill w-100" onChange={this.props.updateDataSource} disabled={!this.props.isQueryOwner}>
                {this.props.dataSources.map(ds => <option label={ds.name} value={ds.id} key={`ds-option-${ds.id}`}>{ds.name}</option>)}
              </select>
              {this.props.canEdit ?
                <Tooltip placement="top" title={modKey + ' + S'}>
                  <button className="btn btn-default m-l-5" onClick={this.props.saveQuery} title="Save">
                    <span className="fa fa-floppy-o" />
                    <span className="hidden-xs m-l-5">Save</span>
                    {this.props.isDirty ? '*' : null}
                  </button>
                </Tooltip> : null }
              <Tooltip placement="top" title={modKey + ' + Enter'}>
                {/*
                  Tooltip wraps disabled buttons with `<span>` and moves all styles
                  and classes to that `<span>`. There is a piece of CSS that fixes
                  button appearance, but also wwe need to add `disabled` class to
                  disabled buttons so it will be assigned to wrapper and make it
                  looking properly
                */}
                <button
                  type="button"
                  className={'btn btn-primary m-l-5' + (isExecuteDisabled ? ' disabled' : '')}
                  disabled={isExecuteDisabled}
                  onClick={this.props.executeQuery}
                >
                  <span className="zmdi zmdi-play" />
                  <span className="hidden-xs m-l-5">Execute</span>
                </button>
              </Tooltip>
            </div>
          </div>
        </div>

      </section>);
  }
}

export default function init(ngModule) {
  ngModule.component('queryEditor', react2angular(QueryEditor, null, ['QuerySnippet', 'Query', 'KeyboardShortcuts']));
}
