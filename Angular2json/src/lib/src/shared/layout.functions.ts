import * as _ from 'lodash';

import { TitleMapItem } from '../json-schema-form.service';

import {
  inArray, isArray, isEmpty, isNumber, isObject, isDefined, isString
} from './validator.functions';

import { copy, fixTitle, forEach, hasOwn } from './utility.functions';

import { Pointer, JsonPointer } from './jsonpointer.functions';

import {
  getFromSchema, getInputType, getSubSchema, checkInlineType, isInputRequired,
  removeRecursiveReferences, updateInputOptions
} from './json-schema.functions';

import { buildFormGroupTemplate, getControl } from './form-group.functions';

/**
 * Layout function library:
 *
 * buildLayout:            Builds a complete layout from an input layout and schema
 *
 * buildLayoutFromSchema:  Builds a complete layout entirely from an input schema
 *
 * mapLayout:
 *
 * getLayoutNode:
 *
 * buildTitleMap:
 */

/**
 * 'buildLayout' function
 *
 * @param {any} jsf
 * @param {any} widgetLibrary
 * @return {any[]}
 */
export function buildLayout(jsf: any, widgetLibrary: any): any[] {
  let hasSubmitButton = !JsonPointer.get(jsf, '/globalOptions/addSubmit');
  let formLayout = mapLayout(jsf.layout, (layoutItem, index, layoutPointer) => {
    let currentIndex: number = index;
    let newNode: any = {
      _id: _.uniqueId(),
      layoutPointer: layoutPointer.replace(/\/\d+/g, '/-'),
      options: {},
    };
    if (isObject(layoutItem)) {
      Object.assign(newNode, layoutItem);
      Object.keys(newNode)
        .filter(option => !inArray(option, [
          '_id', '$ref', 'arrayItem', 'arrayItemType', 'dataPointer',
          'dataType', 'items', 'key', 'layoutPointer', 'name', 'options',
          'recursiveReference', 'type', 'widget'
        ]))
        .forEach(option => {
          newNode.options[option] = newNode[option];
          delete newNode[option];
        });
      if (!hasOwn(newNode, 'type') && isString(newNode.widget)) {
        newNode.type = newNode.widget;
        delete newNode.widget;
      }
      if (!hasOwn(newNode.options, 'title')) {
        if (hasOwn(newNode.options, 'legend')) {
          newNode.options.title = newNode.options.legend;
          delete newNode.options.legend;
        } else if (hasOwn(newNode, 'name') && !/^\d+$/.test(newNode.name)) {
          newNode.options.title = fixTitle(newNode.name);
        }
      }
    } else if (JsonPointer.isJsonPointer(layoutItem)) {
      newNode.dataPointer = layoutItem;
    } else if (isString(layoutItem)) {
      newNode.key = layoutItem;
    } else {
      console.error('buildLayout error: Form layout element not recognized:');
      console.error(layoutItem);
      return null;
    }
    let nodeSchema: any = null;

    // If newNode does not have a dataPointer, try to find an equivalent
    if (!hasOwn(newNode, 'dataPointer')) {

      // If newNode has a key, change it to a dataPointer
      if (hasOwn(newNode, 'key')) {
        newNode.dataPointer = newNode.key === '*' ? newNode.key :
          JsonPointer.compile(JsonPointer.parseObjectPath(newNode.key), '-');
        delete newNode.key;

      // If newNode is an array, search for dataPointer in child nodes
      } else if (hasOwn(newNode, 'type') && newNode.type.slice(-5) === 'array') {
        const findDataPointer = (items) => {
          if (items === null || typeof items !== 'object') { return; }
          if (hasOwn(items, 'dataPointer')) { return items.dataPointer; }
          if (isArray(items.items)) {
            for (let item of items.items) {
              if (hasOwn(item, 'dataPointer') && item.dataPointer.includes('/-')) {
                return item.dataPointer;
              }
              if (hasOwn(item, 'items')) {
                const searchItem = findDataPointer(item);
                if (searchItem) { return searchItem; }
              }
            }
          }
        };
        const childDataPointer = findDataPointer(newNode);
        if (childDataPointer) {
          newNode.dataPointer =
            childDataPointer.slice(0, childDataPointer.lastIndexOf('/-'));
        }
      }
    }

    if (hasOwn(newNode, 'dataPointer')) {
      if (newNode.dataPointer === '*') {
        return buildLayoutFromSchema(
          jsf, widgetLibrary, newNode.layoutPointer.slice(0, -2)
        );
      }
      const nodeValue =
        JsonPointer.get(jsf.initialValues, newNode.dataPointer.replace(/\/-/g, '/1'));
      newNode.dataPointer =
        JsonPointer.toGenericPointer(newNode.dataPointer, jsf.arrayMap);
      const LastKey = JsonPointer.toKey(newNode.dataPointer);
      if (!newNode.name && isString(LastKey) && LastKey !== '-') {
        newNode.name = LastKey;
        if (!newNode.options.title && !/^\d+$/.test(newNode.name)) {
          newNode.options.title = fixTitle(newNode.name);
        }
      }
      let refPointer = removeRecursiveReferences(
        newNode.dataPointer, jsf.dataRecursiveRefMap, jsf.arrayMap
      );
      let schemaPointer: string;
      if (!jsf.dataMap.has(refPointer)) { jsf.dataMap.set(refPointer, new Map()); }
      const itemDataMap  = jsf.dataMap.get(refPointer);
      if (itemDataMap.has('schemaPointer')) {
        schemaPointer = itemDataMap.get('schemaPointer');
      } else {
        schemaPointer = JsonPointer.toSchemaPointer(refPointer, jsf.schema);
        itemDataMap.set('schemaPointer', schemaPointer);
        if (newNode.options.disabled) {
          itemDataMap.set('disabled', newNode.options.disabled);
        }
      }
      itemDataMap.set('disabled', !!newNode.options.disabled);
      nodeSchema = JsonPointer.get(jsf.schema, schemaPointer);
      if (nodeSchema) {
        if (!hasOwn(newNode, 'type')) {
          newNode.type = getInputType(nodeSchema, newNode);
        } else if (!widgetLibrary.hasWidget(newNode.type)) {
          const oldWidgetType = newNode.type;
          newNode.type = getInputType(nodeSchema, newNode);
          console.error(`error: widget type "${oldWidgetType}" not found` +
            `in library. Replacing with "${newNode.type}".`);
        } else {
          newNode.type = checkInlineType(newNode.type, nodeSchema, newNode);
        }
        newNode.dataType =
          nodeSchema.type || (hasOwn(nodeSchema, '$ref') ? '$ref' : null);
        updateInputOptions(newNode, nodeSchema, jsf);

        // Present checkboxes as single control, rather than array
        if (newNode.type === 'checkboxes' && hasOwn(nodeSchema, 'items')) {
          updateInputOptions(newNode, nodeSchema.items, jsf);
        } else if (newNode.dataType === 'array') {
          newNode.options.maxItems = Math.min(
            nodeSchema.maxItems || 1000, newNode.options.maxItems || 1000
          );
          newNode.options.minItems = Math.max(
            nodeSchema.minItems || 0, newNode.options.minItems || 0
          );
          if (!hasOwn(newNode.options, 'listItems')) {
            newNode.options.listItems = 1;
          }
          newNode.options.tupleItems =
            isArray(nodeSchema.items) ? nodeSchema.items.length : 0;
          if (newNode.options.maxItems < newNode.options.tupleItems) {
            newNode.options.tupleItems = newNode.options.maxItems;
            newNode.options.listItems = 0;
          } else if (newNode.options.maxItems <
            newNode.options.tupleItems + newNode.options.listItems
          ) {
            newNode.options.listItems =
              newNode.options.maxItems - newNode.options.tupleItems;
          } else if (newNode.options.minItems >
            newNode.options.tupleItems + newNode.options.listItems
          ) {
            newNode.options.listItems =
              newNode.options.minItems - newNode.options.tupleItems;
          }
          if (!itemDataMap.has('maxItems')) {
            itemDataMap.set('maxItems', newNode.options.maxItems);
            itemDataMap.set('minItems', newNode.options.minItems);
            itemDataMap.set('tupleItems', newNode.options.tupleItems);
            itemDataMap.set('listItems', newNode.options.listItems);
          }
        }
        if (isInputRequired(jsf.schema, schemaPointer)) {
          newNode.options.required = true;
          jsf.fieldsRequired = true;
        }
      } else {
        // TODO: create item in FormGroup model from layout key (?)
        updateInputOptions(newNode, {}, jsf);
      }

      if (hasOwn(newNode.options, 'copyValueTo')) {
        if (typeof newNode.options.copyValueTo === 'string') {
          newNode.options.copyValueTo = [newNode.options.copyValueTo];
        }
        if (isArray(newNode.options.copyValueTo)) {
          newNode.options.copyValueTo = newNode.options.copyValueTo.map(item =>
            JsonPointer.compile(JsonPointer.parseObjectPath(item), '-')
          );
        }
      }

      newNode.widget = widgetLibrary.getWidget(newNode.type);
      itemDataMap.set('inputType', newNode.type);
      itemDataMap.set('widget', newNode.widget);

      if (newNode.dataType === 'array' &&
        (hasOwn(newNode, 'items') || hasOwn(newNode, 'additionalItems'))
      ) {
        let arrayRefPointer = removeRecursiveReferences(
          newNode.dataPointer + '/-', jsf.dataRecursiveRefMap, jsf.arrayMap
        );
        if (!jsf.dataMap.has(arrayRefPointer)) {
          jsf.dataMap.set(arrayRefPointer, new Map());
        }
        jsf.dataMap.get(arrayRefPointer).set('inputType', 'section');

        // Fix insufficiently nested array item groups
        if (newNode.items.length > 1) {
          let arrayItemGroup = [];
          let arrayItemGroupTemplate = [];
          let newIndex = 0;
          for (let i = newNode.items.length - 1; i >= 0; i--) {
            let subItem = newNode.items[i];
            if (hasOwn(subItem, 'dataPointer') &&
              subItem.dataPointer.slice(0, arrayRefPointer.length) === arrayRefPointer
            ) {
              let arrayItem = newNode.items.splice(i, 1)[0];
              let arrayItemTemplate = mapLayout([arrayItem], templateItem => {
                templateItem.layoutPointer = templateItem.layoutPointer
                  .replace(newNode.layoutPointer, newNode.layoutPointer + '/items/-');
                return templateItem;
              })[0];
              arrayItemGroupTemplate.unshift(arrayItemTemplate);
              arrayItem.dataPointer = newNode.dataPointer + '/-' +
                arrayItem.dataPointer.slice(arrayRefPointer.length);
              arrayItem.layoutPointer = newNode.layoutPointer + '/items/-/items/-';
              arrayItemGroup.unshift(arrayItem);
              newIndex++;
            } else {
              subItem.arrayItem = true;
              // TODO: Check schema to get arrayItemType and removable
              subItem.arrayItemType = 'list';
              subItem.removable = newNode.options.removable !== false;
            }
          }
          if (arrayItemGroup.length) {
            newNode.items.push({
              _id: _.uniqueId(),
              arrayItem: true,
              arrayItemType: newNode.options.tupleItems > newNode.items.length ?
                'tuple' : 'list',
              items: arrayItemGroup,
              layoutPointer: newNode.layoutPointer + '/items/-',
              options: { removable: newNode.options.removable !== false, },
              dataPointer: newNode.dataPointer + '/-',
              type: 'section',
              widget: widgetLibrary.getWidget('section'),
            });
          }
        } else {
          newNode.items[0].arrayItem = true;
          if (!newNode.items[0].dataPointer) {
            newNode.items[0].dataPointer =
              JsonPointer.toGenericPointer(arrayRefPointer, jsf.arrayMap);
          }
          if (!JsonPointer.has(newNode, '/items/0/options/removable')) {
            newNode.items[0].options.removable = true;
          }
          if (newNode.options.orderable === false) {
            newNode.items[0].options.orderable = false;
          }
          newNode.items[0].arrayItemType =
            newNode.options.tupleItems ? 'tuple' : 'list';
        }

        // TODO: check maxItems to verify adding new items is OK, and check
        // additionalItems for whether there is a different schema for new items
        if (newNode.options.addable !== false) {
          const dataPointer = JsonPointer.toGenericPointer(arrayRefPointer, jsf.arrayMap);
          refPointer = removeRecursiveReferences(
            dataPointer, jsf.dataRecursiveRefMap, jsf.arrayMap
          );
          const recursive = refPointer !== dataPointer;
          if (!hasOwn(jsf.layoutRefLibrary, refPointer)) {
            jsf.layoutRefLibrary[refPointer] =
              _.cloneDeep(newNode.items[newNode.items.length - 1]);
            jsf.layoutRefLibrary[refPointer].recursiveReference = true;
            forEach(jsf.layoutRefLibrary[refPointer], (item, key) => {
              if (hasOwn(item, '_id')) { item._id = null; }
              if (recursive) {
                if (hasOwn(item, 'dataPointer')) {
                  item.dataPointer = item.dataPointer.slice(dataPointer.length);
                }
                if (hasOwn(item, 'layoutPointer')) {
                  item.layoutPointer = item.layoutPointer.slice(layoutPointer.length);
                }
              }
            }, 'top-down');
          }
          const arrayLength = Math.min(Math.max(
            newNode.options.tupleItems + newNode.options.listItems,
            isArray(nodeValue) ? nodeValue.length : 0
          ), newNode.options.maxItems);
          for (let i = newNode.items.length; i < arrayLength; i++) {
            newNode.items.push(getLayoutNode({
              $ref: refPointer,
              dataPointer: newNode.dataPointer,
              layoutPointer: newNode.layoutPointer,
              recursiveReference: newNode.recursiveReference,
            }, jsf.layoutRefLibrary));
          }
          let buttonText: string = 'Add';
          if (newNode.options.title) {
            if (/^add\b/i.test(newNode.options.title)) {
              buttonText = newNode.options.title;
            } else {
              buttonText += ' ' + newNode.options.title;
            }
          } else if (newNode.name && !/^\d+$/.test(newNode.name)) {
            if (/^add\b/i.test(newNode.name)) {
              buttonText += ' ' + fixTitle(newNode.name);
            } else {
              buttonText = fixTitle(newNode.name);
            }

          // If newNode doesn't have a title, look for title of parent array item
          } else {
            const parentSchema =
              getFromSchema(jsf.schema, newNode.dataPointer, 'parentSchema');
            if (hasOwn(parentSchema, 'title')) {
              buttonText += ' to ' + parentSchema.title;
            } else {
              const pointerArray = JsonPointer.parse(newNode.dataPointer);
              buttonText += ' to ' + fixTitle(pointerArray[pointerArray.length - 2]);
            }
          }
          newNode.items.push({
            _id: _.uniqueId(),
            arrayItem: true,
            arrayItemType: 'list',
            dataPointer: newNode.dataPointer + '/-',
            layoutPointer: newNode.layoutPointer + '/items/-',
            options: {
              listItems: newNode.options.listItems,
              maxItems: newNode.options.maxItems,
              minItems: newNode.options.minItems,
              removable: false,
              title: buttonText,
              tupleItems: newNode.options.tupleItems,
            },
            recursiveReference: recursive,
            type: '$ref',
            widget: widgetLibrary.getWidget('$ref'),
            $ref: refPointer,
          });
          if (isString(JsonPointer.get(newNode, '/style/add'))) {
            newNode.items[newNode.items.length - 1].options.fieldStyle =
              newNode.style.add;
            delete newNode.style.add;
            if (isEmpty(newNode.style)) { delete newNode.style; }
          }
        }
      } else {
        newNode.arrayItem = false;
      }
    } else if (hasOwn(newNode, 'type') || hasOwn(newNode, 'items')) {
      const parentType: string =
        JsonPointer.get(jsf.layout, layoutPointer, 0, -2).type;
      if (!hasOwn(newNode, 'type')) {
        newNode.type =
          inArray(parentType, ['tabs', 'tabarray']) ? 'tab' : 'array';
      }
      newNode.arrayItem = parentType === 'array';
      newNode.widget = widgetLibrary.getWidget(newNode.type);
      updateInputOptions(newNode, {}, jsf);
    }
    if (newNode.type === 'submit') { hasSubmitButton = true; }
    return newNode;
  });
  if (!hasSubmitButton) {
    formLayout.push({
      _id: _.uniqueId(),
      layoutPointer: '/-',
      options: { title: 'Submit' },
      type: 'submit',
      widget: widgetLibrary.getWidget('submit'),
    });
  }
  return formLayout;
}

/**
 * 'buildLayoutFromSchema' function
 *
 * @param {any} jsf -
 * @param {number = 0} layoutIndex -
 * @param {string = ''} layoutPointer -
 * @param {string = ''} schemaPointer -
 * @param {string = ''} dataPointer -
 * @param {boolean = false} arrayItem -
 * @param {string = null} arrayItemType -
 * @param {boolean = null} removable -
 * @param {boolean = false} forRefLibrary -
 * @return {any}
 */
export function buildLayoutFromSchema(
  jsf: any, widgetLibrary: any, layoutPointer: string = '',
  schemaPointer: string = '', dataPointer: string = '',
  arrayItem: boolean = false, arrayItemType: string = null,
  removable: boolean = null, forRefLibrary: boolean = false,
  dataPointerPrefix: string = ''
): any {
  const schema = getSubSchema(jsf.schema, schemaPointer);
  if (!hasOwn(schema, 'type') && !hasOwn(schema, '$ref') &&
    !hasOwn(schema, 'x-schema-form')
  ) { return null; }
  const newNodeType: string = getInputType(schema);
  const nodeValue =
    JsonPointer.get(jsf.initialValues, dataPointer.replace(/\/-/g, '/1'));
  let newNode: any = {
    _id: forRefLibrary ? null : _.uniqueId(),
    arrayItem: arrayItem,
    dataPointer: JsonPointer.toGenericPointer(dataPointer, jsf.arrayMap),
    dataType: schema.type || (hasOwn(schema, '$ref') ? '$ref' : null),
    layoutPointer: layoutPointer.replace(/\/\d+/g, '/-') || '/-',
    options: {},
    type: newNodeType,
    widget: widgetLibrary.getWidget(newNodeType),
  };
  const lastDataKey = JsonPointer.toKey(newNode.dataPointer);
  if (lastDataKey !== '-') { newNode.name = lastDataKey; }
  if (newNode.arrayItem) {
    newNode.arrayItemType = arrayItemType;
    newNode.options.removable = removable !== false;
  }
  if (dataPointer !== '' && !forRefLibrary) {
    const refPointer = removeRecursiveReferences(
      newNode.dataPointer, jsf.dataRecursiveRefMap, jsf.arrayMap
    );
    if (!jsf.dataMap.has(refPointer)) { jsf.dataMap.set(refPointer, new Map()); }
    const itemDataMap  = jsf.dataMap.get(refPointer);
    itemDataMap.set('schemaPointer', schemaPointer);
    itemDataMap.set('inputType', newNode.type);
    itemDataMap.set('widget', newNode.widget);
    itemDataMap.set('disabled', !!newNode.options.disabled);
  }
  updateInputOptions(newNode, schema, jsf);
  if (!newNode.options.title && newNode.name && !/^\d+$/.test(newNode.name)) {
    newNode.options.title = fixTitle(newNode.name);
  }
  if (newNode.dataType === 'object') {
    if (isObject(schema.properties)) {
      const newSection: any[] = [];
      const propertyKeys = schema['ui:order'] || Object.keys(schema['properties']);
      if (propertyKeys.includes('*') && !hasOwn(schema.properties, '*')) {
        const unnamedKeys = Object.keys(schema.properties)
          .filter(key => !propertyKeys.includes(key));
        for (let i = propertyKeys.length - 1; i >= 0; i--) {
          if (propertyKeys[i] === '*') {
            propertyKeys.splice(i, 1, ...unnamedKeys);
          }
        }
      }
      propertyKeys
        .filter(key => hasOwn(schema.properties, key))
        .forEach(key => {
          const innerItem = buildLayoutFromSchema(
            jsf, widgetLibrary,
            dataPointer === '' && !forRefLibrary ?
              '/-' : newNode.layoutPointer + '/items/-',
            schemaPointer + '/properties/' + key,
            dataPointer + '/' + key,
            false, null, null, forRefLibrary, dataPointerPrefix
          );
          if (innerItem) {
            if (isInputRequired(schema, '/' + key)) {
              innerItem.options.required = true;
              jsf.fieldsRequired = true;
            }
            newSection.push(innerItem);
          }
        });
      if (dataPointer === '' && !forRefLibrary) {
        newNode = newSection;
      } else {
        newNode.items = newSection;
      }
    }
    // TODO: Add patternProperties and additionalProperties inputs?
    // ... possibly provide a way to enter both key names and values?
    // if (isObject(schema.patternProperties)) { }
    // if (isObject(schema.additionalProperties)) { }
  } else if (newNode.dataType === 'array') {
    newNode.items = [];
    let templateArray: any[] = [];
    newNode.options.maxItems = Math.min(
      schema.maxItems || 1000, newNode.options.maxItems || 1000
    );
    newNode.options.minItems = Math.max(
      schema.minItems || 0, newNode.options.minItems || 0
    );
    if (!newNode.options.minItems && isInputRequired(jsf.schema, schemaPointer)) {
      newNode.options.minItems = 1;
    }
    if (!hasOwn(newNode.options, 'listItems')) { newNode.options.listItems = 1; }
    newNode.options.tupleItems = isArray(schema.items) ? schema.items.length : 0;
    if (newNode.options.maxItems < newNode.options.tupleItems) {
      newNode.options.tupleItems = newNode.options.maxItems;
      newNode.options.listItems = 0;
    } else if (newNode.options.maxItems <
      newNode.options.tupleItems + newNode.options.listItems
    ) {
      newNode.options.listItems = newNode.options.maxItems - newNode.options.tupleItems;
    } else if (newNode.options.minItems >
      newNode.options.tupleItems + newNode.options.listItems
    ) {
      newNode.options.listItems = newNode.options.minItems - newNode.options.tupleItems;
    }
    removable = newNode.options.removable !== false;
    let addRefItem = false;
    const refPointer = removeRecursiveReferences(
      dataPointerPrefix + dataPointer + '/-', jsf.dataRecursiveRefMap, jsf.arrayMap
    );
    const genericPointer = JsonPointer.toGenericPointer(dataPointer, jsf.arrayMap);
    const recursive = refPointer !== genericPointer + '/-';
    let schemaRefPointer: string = null;

    // If 'items' is an array = tuple items
    if (isArray(schema.items)) {
      newNode.items = [];
      for (let i = 0; i < newNode.options.tupleItems; i++) {
        let newItem: any;
        // If removable, add tuple item layout to layoutRefLibrary
        if (removable && i >= newNode.options.minItems) {
          const itemRefPointer = refPointer.slice(0, -1) + i;
          if (!hasOwn(jsf.layoutRefLibrary, itemRefPointer)) {
            // Set to null first to prevent recursive reference from causing endless loop
            jsf.layoutRefLibrary[itemRefPointer] = null;
            jsf.layoutRefLibrary[itemRefPointer] = buildLayoutFromSchema(
              jsf, widgetLibrary,
              recursive ? '' : newNode.layoutPointer + '/items/-',
              schemaPointer + '/items/' + i,
              recursive ? '' : dataPointer + '/' + i,
              true, 'tuple', true, true, recursive ? dataPointer + '/-' : ''
            );
            if (recursive) {
              jsf.layoutRefLibrary[refPointer].recursiveReference = true;
            }
          }
          newItem = getLayoutNode({
            $ref: itemRefPointer,
            dataPointer: dataPointer + '/' + i,
            layoutPointer: newNode.layoutPointer + '/items/-',
            recursiveReference: recursive,
          }, jsf.layoutRefLibrary);
        } else {
          newItem = buildLayoutFromSchema(
            jsf, widgetLibrary,
            newNode.layoutPointer + '/items/-',
            schemaPointer + '/items/' + i,
            dataPointer + '/' + i,
            true, 'tuple', false, forRefLibrary, dataPointerPrefix
          );
        }
        if (newItem) { newNode.items.push(newItem); }
      }

      // If 'additionalItems' is an object = additional list items, after tuple items
      if (isObject(schema.additionalItems)) {
        schemaRefPointer = removeRecursiveReferences(
          schemaPointer + '/additionalItems', jsf.schemaRecursiveRefMap, jsf.arrayMap
        );
      }

    // If 'items' is an object = list items only (no tuple items)
    } else {
      schemaRefPointer = removeRecursiveReferences(
        schemaPointer + '/items', jsf.schemaRecursiveRefMap, jsf.arrayMap
      );
    }
    if (!jsf.dataMap.has(refPointer.slice(0, -2))) {
      jsf.dataMap.set(refPointer.slice(0, -2), new Map());
    }
    if (!jsf.dataMap.get(refPointer.slice(0, -2)).has('maxItems')) {
      const itemDataMap  = jsf.dataMap.get(refPointer.slice(0, -2));
      itemDataMap.set('maxItems', newNode.options.maxItems);
      itemDataMap.set('minItems', newNode.options.minItems);
      itemDataMap.set('tupleItems', newNode.options.tupleItems);
      itemDataMap.set('listItems', newNode.options.listItems);
    }

    if (schemaRefPointer) {
      // Add list item layout to layoutRefLibrary
      if (!hasOwn(jsf.layoutRefLibrary, refPointer)) {
        // Set to null first to prevent recursive reference from causing endless loop
        jsf.layoutRefLibrary[refPointer] = null;
        if (recursive) {
          jsf.layoutRefLibrary[refPointer].recursiveReference = true;
        } else {
          jsf.layoutRefLibrary[refPointer] = buildLayoutFromSchema(
            jsf, widgetLibrary,
            recursive ? '' : newNode.layoutPointer + '/items/-',
            schemaRefPointer,
            recursive ? '' : dataPointer + '/-',
            true, 'list', removable, true, recursive ? dataPointer + '/-' : ''
          );
          if (recursive) {
            jsf.layoutRefLibrary[refPointer].recursiveReference = true;
          }
        }
      }
      const arrayLength = Math.min(Math.max(
        newNode.options.tupleItems + newNode.options.listItems,
        isArray(nodeValue) ? nodeValue.length : 0
      ), newNode.options.maxItems);
      if (newNode.items.length < arrayLength) {
        for (let i = newNode.items.length; i < arrayLength; i++) {
          newNode.items.push(getLayoutNode({
            $ref: refPointer,
            dataPointer: dataPointer + '/-',
            layoutPointer: layoutPointer + '/items/-',
            recursiveReference: recursive,
          }, jsf.layoutRefLibrary));
        }
      }
      addRefItem = newNode.options.addable !== false &&
        newNode.options.minItems < newNode.options.maxItems &&
        JsonPointer.get(newNode.items[newNode.items.length - 1], '/type') !== '$ref';
    }

    // If needed, add $ref item to layout
    if (addRefItem) {
      let buttonText =
        ((jsf.layoutRefLibrary[refPointer] || {}).options || {}).title ||
        schema.title || fixTitle(JsonPointer.toKey(dataPointer));
      if (!/^add\b/i.test(buttonText)) { buttonText = 'Add ' + buttonText; }
      newNode.items.push({
        _id: _.uniqueId(),
        arrayItem: true,
        arrayItemType: 'list',
        dataPointer: newNode.dataPointer + '/-',
        layoutPointer: newNode.layoutPointer + '/items/-',
        options: {
          listItems: newNode.options.listItems,
          maxItems: newNode.options.maxItems,
          minItems: newNode.options.minItems,
          removable: false,
          title: buttonText,
          tupleItems: newNode.options.tupleItems,
        },
        recursiveReference: recursive,
        type: '$ref',
        widget: widgetLibrary.getWidget('$ref'),
        $ref: refPointer,
      });
    } else if (
      JsonPointer.get(newNode.items[newNode.items.length - 1], '/type') === '$ref'
    ) {
      if (!isObject(newNode.items[newNode.items.length - 1].options)) {
        newNode.items[newNode.items.length - 1].options = {};
      }
      const arraySchema = JsonPointer.get(jsf.schema, schemaPointer, 0, -1);
      Object.assign(newNode.items[newNode.items.length - 1].options, {
        maxItems: arraySchema.maxItems || 1000,
        minItems: arraySchema.minItems || 0,
      });
      if (isArray(arraySchema.items)) {
        Object.assign(newNode.items[newNode.items.length - 1], {
          listItems: hasOwn(arraySchema, 'additionalItems') ?
            (arraySchema.maxItems || 1000) - arraySchema.items.length : 0,
          tupleItems: arraySchema.items.length,
        });
      } else {
        Object.assign(newNode.items[newNode.items.length - 1], {
          listItems: arraySchema.maxItems || 1000,
          tupleItems: 0,
        });
      }
    }
  } else if (newNode.dataType === '$ref') {
    const schemaRef: string = JsonPointer.compile(schema.$ref);
    let buttonText: string = 'Add';
    if (newNode.options.add) {
      buttonText = newNode.options.add;
    } else if (newNode.name && !/^\d+$/.test(newNode.name)) {
      if (/^add\b/i.test(newNode.name)) {
        buttonText = fixTitle(newNode.name);
      } else {
        buttonText += ' ' + fixTitle(newNode.name);
      }

    // If newNode doesn't have a title, look for title of parent array item
    } else {
      const parentSchema =
        JsonPointer.get(jsf.schema, schemaPointer, 0, -1);
      if (hasOwn(parentSchema, 'title')) {
        buttonText += ' to ' + parentSchema.title;
      } else {
        const pointerArray = JsonPointer.parse(newNode.dataPointer);
        buttonText += ' to ' + fixTitle(pointerArray[pointerArray.length - 2]);
      }
    }
    const refPointer = removeRecursiveReferences(
      dataPointerPrefix + dataPointer, jsf.dataRecursiveRefMap, jsf.arrayMap
    );
    Object.assign(newNode, {
      recursiveReference: true,
      widget: widgetLibrary.getWidget('$ref'),
      $ref: refPointer,
    });
    Object.assign(newNode.options, {
      removable: false,
      title: buttonText,
    });
    if (isNumber(JsonPointer.get(jsf.schema, schemaPointer, 0, -1).maxItems)) {
      newNode.options.maxItems =
        JsonPointer.get(jsf.schema, schemaPointer, 0, -1).maxItems;
    }

    // Add layout template to layoutRefLibrary
    if (!hasOwn(jsf.layoutRefLibrary, refPointer)) {
      // Set to null first to prevent recursive reference from causing endless loop
      jsf.layoutRefLibrary[refPointer] = null;
      const schemaRefPointer = removeRecursiveReferences(
        schemaPointer, jsf.schemaRecursiveRefMap, jsf.arrayMap
      );
      const newLayout: any = buildLayoutFromSchema(
        jsf, widgetLibrary,
        '',
        schemaRefPointer,
        '',
        newNode.arrayItem, newNode.arrayItemType, true, true, dataPointer
      );
      if (newLayout) {
        jsf.layoutRefLibrary[refPointer] = newLayout;
      } else {
        delete jsf.layoutRefLibrary[refPointer];
      }
    }
  }
  return newNode;
}

/**
 * 'mapLayout' function
 *
 * Creates a new layout by running each element in an existing layout through
 * an iteratee. Recursively maps within array elements 'items' and 'tabs'.
 * The iteratee is invoked with four arguments: (value, index, layout, path)
 *
 * The returned layout may be longer (or shorter) then the source layout.
 *
 * If an item from the source layout returns multiple items (as '*' usually will),
 * this function will keep all returned items in-line with the surrounding items.
 *
 * If an item from the source layout causes an error and returns null, it is
 * skipped without error, and the function will still return all non-null items.
 *
 * @param {any[]} layout - the layout to map
 * @param {(v: any, i?: number, l?: any, p?: string) => any}
 *   function - the funciton to invoke on each element
 * @param {any = ''} layoutPointer - the layoutPointer to layout, inside rootLayout
 * @param {any[] = layout} rootLayout - the root layout, which conatins layout
 * @return {[type]}
 */
export function mapLayout(
  layout: any[],
  fn: (v: any, i?: number, p?: string, l?: any) => any,
  layoutPointer: string = '',
  rootLayout: any[] = layout
): any[] {
  let indexPad: number = 0;
  let newLayout: any[] = [];
  forEach(layout, (item, index) => {
    let realIndex = +index + indexPad;
    let newLayoutPointer = layoutPointer + '/' + realIndex;
    let newNode: any = copy(item);
    let itemsArray: any[] = [];
    if (isObject(item)) {
      if (hasOwn(item, 'tabs')) {
        item.items = item.tabs;
        delete item.tabs;
      }
      if (hasOwn(item, 'items')) {
        itemsArray = isArray(item.items) ? item.items : [item.items];
      }
    }
    if (itemsArray.length) {
      newNode.items = mapLayout(itemsArray, fn, newLayoutPointer + '/items', rootLayout);
    }
    newNode = fn(newNode, realIndex, newLayoutPointer, rootLayout);
    if (!isDefined(newNode)) {
      indexPad--;
    } else {
      if (isArray(newNode)) { indexPad += newNode.length - 1; }
      newLayout = newLayout.concat(newNode);
    }
  });
  return newLayout;
};

/**
 * 'getLayoutNode' function
 * Copy a new layoutNode from layoutRefLibrary
 *
 * @param {any} refNode -
 * @param {any} layoutRefLibrary -
 * @return {any} copied layoutNode
 */
export function getLayoutNode(refNode: any, layoutRefLibrary: any) {
  const newLayoutNode = _.cloneDeep(layoutRefLibrary[refNode.$ref]);
  JsonPointer.forEachDeep(newLayoutNode, (subNode, pointer) => {

    // Reset all _id's in newLayoutNode to unique values
    if (hasOwn(subNode, '_id')) { subNode._id = _.uniqueId(); }

    // If adding a recursive item, prefix current dataPointer
    // and layoutPointer to all pointers in new layoutNode
    if (refNode.recursiveReference) {
      if (hasOwn(subNode, 'dataPointer')) {
        subNode.dataPointer = refNode.dataPointer + subNode.dataPointer;
      }
      if (hasOwn(subNode, 'layoutPointer')) {
        subNode.layoutPointer = refNode.layoutPointer.slice(0, -2) + subNode.layoutPointer;
      }
    }
  });
  return newLayoutNode;
}

/**
 * 'buildTitleMap' function
 *
 * @param {any} titleMap -
 * @param {any} enumList -
 * @param {boolean = true} fieldRequired -
 * @param {boolean = true} flatList -
 * @return { { name: string, value: any }[] }
 *   || { { group: string, items: { name: string, value: any }[] }[] }
 */
export function buildTitleMap(
  titleMap: any, enumList: any, fieldRequired: boolean = true, flatList: boolean = true
): TitleMapItem[] {
  let newTitleMap: TitleMapItem[] = [];
  let hasEmptyValue = false;
  if (titleMap) {
    if (isArray(titleMap)) {
      if (enumList) {
        for (let i of Object.keys(titleMap)) {
          if (isObject(titleMap[i])) { // JSON Form style
            const value: any = titleMap[i].value;
            if (enumList.indexOf(value) !== -1) {
              const name: string = titleMap[i].name;
              newTitleMap.push({ name, value });
              if (value === undefined || value === null) { hasEmptyValue = true; }
            }
          } else if (isString(titleMap[i])) { // React Jsonschema Form style
            if (i < enumList.length) {
              const name: string = titleMap[i];
              const value: any = enumList[i];
              newTitleMap.push({ name, value });
              if (value === undefined || value === null) { hasEmptyValue = true; }
            }
          }
        }
      } else { // If array titleMap and no enum list, just return the titleMap - Angular Schema Form style
        newTitleMap = titleMap;
        if (!fieldRequired) {
          hasEmptyValue = !!newTitleMap
            .filter(i => i.value === undefined || i.value === null)
            .length;
        }
      }
    } else if (enumList) { // Alternate JSON Form style, with enum list
      for (let i of Object.keys(enumList)) {
        let value: any = enumList[i];
        if (hasOwn(titleMap, value)) {
          let name: string = titleMap[value];
          newTitleMap.push({ name, value });
          if (value === undefined || value === null) { hasEmptyValue = true; }
        }
      }
    } else { // Alternate JSON Form style, without enum list
      for (let value of Object.keys(titleMap)) {
        let name: string = titleMap[value];
        newTitleMap.push({ name, value });
        if (value === undefined || value === null) { hasEmptyValue = true; }
      }
    }
  } else if (enumList) { // Build map from enum list alone
    for (let i of Object.keys(enumList)) {
      let name: string = enumList[i];
      let value: any = enumList[i];
      newTitleMap.push({ name, value});
      if (value === undefined || value === null) { hasEmptyValue = true; }
    }
  } else { // If no titleMap and no enum list, return default map of boolean values
    newTitleMap = [ { name: 'True', value: true }, { name: 'False', value: false } ];
  }

  // Does titleMap have groups?
  if (newTitleMap.some(title => hasOwn(title, 'group'))) {
    hasEmptyValue = false;

    // If flatList = true, flatten items & update name to group: name
    if (flatList) {
      newTitleMap = newTitleMap.reduce((groupTitleMap, title) => {
        if (hasOwn(title, 'group')) {
          if (isArray(title.items)) {
            groupTitleMap = [
              ...groupTitleMap,
              ...title.items.map(item =>
                ({ ...item, ...{ name: `${title.group}: ${item.name}` } })
              )
            ];
            if (title.items.some(item => item.value === undefined || item.value === null)) {
              hasEmptyValue = true;
            }
          }
          if (hasOwn(title, 'name') && hasOwn(title, 'value')) {
            title.name = `${title.group}: ${title.name}`;
            delete title.group;
            groupTitleMap.push(title);
            if (title.value === undefined || title.value === null) {
              hasEmptyValue = true;
            }
          }
        } else {
          groupTitleMap.push(title);
          if (title.value === undefined || title.value === null) {
            hasEmptyValue = true;
          }
        }
        return groupTitleMap;
      }, []);

    // If flatList = false, combine items from matching groups
    } else {
      newTitleMap = newTitleMap.reduce((groupTitleMap, title) => {
        if (hasOwn(title, 'group')) {
          if (title.group !== (groupTitleMap[groupTitleMap.length - 1] || {}).group) {
            groupTitleMap.push({ group: title.group, items: title.items || [] });
          }
          if (hasOwn(title, 'name') && hasOwn(title, 'value')) {
            groupTitleMap[groupTitleMap.length - 1].items
              .push({ name: title.name, value: title.value });
            if (title.value === undefined || title.value === null) {
              hasEmptyValue = true;
            }
          }
        } else {
          groupTitleMap.push(title);
          if (title.value === undefined || title.value === null) {
            hasEmptyValue = true;
          }
        }
        return groupTitleMap;
      }, []);
    }
  }
  if (!fieldRequired && !hasEmptyValue) {
    newTitleMap.unshift({ name: '<em>None</em>', value: null });
  }
  return newTitleMap;
}