import { isFunction, extend } from 'lodash';

export function renderDefault(column, row) {
  const value = row[column.name];
  if (isFunction(column.formatFunction)) {
    return column.formatFunction(value);
  }
  return value;
}
