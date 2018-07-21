import GridEditor from '@/react-components/GridEditor';
import GridRenderer from '@/react-components/GridRenderer';
import visualizationRegistry from '@/visualizations/registry';
import './table-editor.less';

export default function () {
  registry.TABLE = Object.freeze({
    name: 'Table',
    renderer: GridRenderer,
    editor: GridEditor,
    defaultOptions: GridRenderer.DEFAULT_OPTIONS,
  });
}
