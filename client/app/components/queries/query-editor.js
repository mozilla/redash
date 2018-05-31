import { react2angular } from 'react2angular';
import QueryEditor from '@/react-components/QueryEditor';

export default function init(ngModule) {
  ngModule.component('queryEditor', react2angular(QueryEditor, null, ['QuerySnippet', 'Query', 'KeyboardShortcuts']));
}
