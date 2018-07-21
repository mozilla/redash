import QueryViewTop from '@/react-components/QueryViewTop';
import { react2angular } from 'react2angular';

export default function init(ngModule) {
  ngModule.component('queryViewTop', react2angular(QueryViewTop, ['queryId', 'sourceMode'], ['Events', 'currentUser', 'clientConfig', '$rootScope']));
}
