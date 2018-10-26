import registry from '@/visualizations/registry';
import GridRenderer from './GridRenderer';
import GridEditor from './GridEditor';

export default function () {
  registry.TABLE = Object.freeze({
    name: 'Table',
    renderer: GridRenderer,
    editor: GridEditor,
    defaultOptions: GridRenderer.DEFAULT_OPTIONS,
  });
}
