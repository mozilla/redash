import { react2angular } from 'react2angular';
import AlertDialog from '@/react-components/AlertDialog';

function OldAlertDialog($uibModal) {
  const service = {
    open(title, message, confirm) {
      return $uibModal.open({
        component: 'alertDialog',
        resolve: {
          title: () => title,
          message: () => message,
          confirm: () => confirm,
        },
      }).result;
    },
  };

  return service;
}

export default function init(ngModule) {
  ngModule.component('alertDialog', react2angular(AlertDialog));
  ngModule.factory('AlertDialog', OldAlertDialog);
}
