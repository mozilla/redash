import { react2angular } from 'react2angular';
import EditInPlaceText from '@/react-components/EditInPlaceText';

export default function init(ngModule) {
  ngModule.component('editInPlace', react2angular(EditInPlaceText));
}
