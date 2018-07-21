import GridEditor from '@/react-components/GridEditor';
import GridRenderer from '@/react-components/GridRenderer';
import visualizationRegistry from '@/visualizations/registry';
import './table-editor.less';

const DEFAULT_OPTIONS = {
  itemsPerPage: 15,
  autoHeight: true,
  defaultRows: 14,
  defaultColumns: 3,
  minColumns: 2,
};

export default function init() {
  visualizationRegistry.TABLE = {
    defaultOptions: DEFAULT_OPTIONS,
    name: 'Table',
    renderer: GridRenderer,
    editor: GridEditor,
  };
}
