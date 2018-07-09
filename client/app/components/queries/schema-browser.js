import { react2angular } from 'react2angular';
import SchemaBrowser from '@/react-components/SchemaBrowser';

export default function init(ngModule) {
  ngModule.component('schemaBrowser', react2angular(SchemaBrowser));
}
