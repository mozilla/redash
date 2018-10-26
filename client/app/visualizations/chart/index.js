import registry from '@/visualizations/registry';
import ChartRenderer from './ChartRenderer';
import ChartEditor from './ChartEditor';

export default function () {
  registry.CHART = Object.freeze({
    name: 'Chart',
    renderer: ChartRenderer,
    editor: ChartEditor,
    defaultOptions: ChartRenderer.DEFAULT_OPTIONS,
  });
}
