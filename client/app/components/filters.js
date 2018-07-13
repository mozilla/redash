import { react2angular } from 'react2angular';
import Filters from '@/react-components/Filters';

export default function init(ngModule) {
  ngModule.component('filters', react2angular(Filters, null, ['clientConfig']));
}
