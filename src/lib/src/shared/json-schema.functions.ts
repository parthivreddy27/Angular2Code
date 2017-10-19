import * as _ from 'lodash';

import {
  getType, hasValue, inArray, isArray, isEmpty, isFunction, isNumber, isObject,
  isString
} from './validator.functions';
import {
  forEach, hasOwn, mergeFilteredObject, uniqueItems, commonItems
} from './utility.functions';
import { mergeSchemas } from './merge-schemas.function';
import { JsonPointer, Pointer } from './jsonpointer.functions';
import { JsonValidators } from './json.validators';

/**
 * JSON Schema function library:
 *
 * buildSchemaFromLayout:   TODO: Write this function
 *
 * buildSchemaFromData:
 *
 * getFromSchema:
 *
 * combineSchemas:
 *
 * removeRecursiveReferences:
 *
 * getInputType:
 *
 * checkInlineType:
 *
 * isInputRequired:
 *
 * updateInputOptions:
 *
 * getTitleMapFromOneOf:
 *
 * getControlValidators:
 *
 * resolveSchemaReferences:
 *
 * getSubSchema:
 *
 * combineAllOf:
 *
 * fixRequiredArrayProperties:
 */

/**
 * 'buildSchemaFromLayout' function
 *
 * TODO: Build a JSON Schema from a JSON Form layout
 *
 * @param {any[]} layout - The JSON Form layout
 * @return {JSON Schema} - The new JSON Schema
 */
export function buildSchemaFromLayout(layout: any[]): any {
  return;
  // let newSchema: any = { };
  // const walkLayout = (layoutItems: any[], callback: Function): any[] => {
  //   let returnArray: any[] = [];
  //   for (let layoutItem of layoutItems) {
  //     const returnItem: any = callback(layoutItem);
  //     if (returnItem) { returnArray = returnArray.concat(callback(layoutItem)); }
  //     if (layoutItem.items) {
  //       returnArray = returnArray.concat(walkLayout(layoutItem.items, callback));
  //     }
  //   }
  //   return returnArray;
  // };
  // walkLayout(layout, layoutItem => {
  //   let itemKey: string;
  //   if (typeof layoutItem === 'string') {
  //     itemKey = layoutItem;
  //   } else if (layoutItem.key) {
  //     itemKey = layoutItem.key;
  //   }
  //   if (!itemKey) { return; }
  //   //
  // });
}

/**
 * 'buildSchemaFromData' function
 *
 * Build a JSON Schema from a data object
 *
 * @param {any} data - The data object
 * @return {JSON Schema} - The new JSON Schema
 */
export function buildSchemaFromData(
  data: any, requireAllFields = false, isRoot = true
): any {
  let newSchema: any = {};
  const getFieldType = (value: any): string => {
    const fieldType = getType(value, 'strict');
    return { integer: 'number', null: 'string' }[fieldType] || fieldType;
  };
  const buildSubSchema = (value) =>
    buildSchemaFromData(value, requireAllFields, false);
  if (isRoot) { newSchema.$schema = 'http://json-schema.org/draft-06/schema#'; }
  newSchema.type = getFieldType(data);
  if (newSchema.type === 'object') {
    newSchema.properties = {};
    if (requireAllFields) { newSchema.required = []; }
    for (let key of Object.keys(data)) {
      newSchema.properties[key] = buildSubSchema(data[key]);
      if (requireAllFields) { newSchema.required.push(key); }
    }
  } else if (newSchema.type === 'array') {
    newSchema.items = data.map(buildSubSchema);
    // If all items are the same type, use an object for items instead of an array
    if ((new Set(data.map(getFieldType))).size === 1) {
      newSchema.items = newSchema.items.reduce((a, b) => ({ ...a, ...b }), {});
    }
    if (requireAllFields) { newSchema.minItems = 1; }
  }
  return newSchema;
}

/**
 * 'getFromSchema' function
 *
 * Uses a JSON Pointer for a value within a data object to retrieve
 * the schema for that value within schema for the data object.
 *
 * The optional third parameter can also be set to return something else:
 * 'schema' (default): the schema for the value indicated by the data pointer
 * 'parentSchema': the schema for the value's parent object or array
 * 'schemaPointer': a pointer to the value's schema within the object's schema
 * 'parentSchemaPointer': a pointer to the schema for the value's parent object or array
 *
 * @param {JSON Schema} schema - The schema to get the sub-schema from
 * @param {Pointer} dataPointer - JSON Pointer (string or array)
 * @param {boolean = false} returnContainer - Return containing object instead?
 * @return {schema} - The located sub-schema
 */
export function getFromSchema(
  schema: any, dataPointer: Pointer, returnType: string = 'schema'
): any {
  const dataPointerArray: any[] = JsonPointer.parse(dataPointer);
  if (dataPointerArray === null) {
    console.error(`getFromSchema error: Invalid JSON Pointer: ${dataPointer}`);
    return null;
  }
  let subSchema = schema;
  const schemaPointer = [];
  const length = dataPointerArray.length;
  if (returnType.slice(0, 6) === 'parent') { dataPointerArray.length--; }
  for (let i = 0; i < length; ++i) {
    const parentSchema = subSchema;
    const key = dataPointerArray[i];
    let subSchemaFound = false;
    if (typeof subSchema !== 'object') {
      console.error(`getFromSchema error: Unable to find "${key}" key in schema.`);
      console.error(schema);
      console.error(dataPointer);
      return null;
    }
    if (subSchema.type === 'array' && (!isNaN(key) || key === '-')) {
      if (hasOwn(subSchema, 'items')) {
        if (isObject(subSchema.items)) {
          subSchemaFound = true;
          subSchema = subSchema.items;
          schemaPointer.push('items');
        } else if (isArray(subSchema.items)) {
          if (!isNaN(key) && subSchema.items.length >= +key) {
            subSchemaFound = true;
            subSchema = subSchema.items[+key];
            schemaPointer.push('items', key);
          }
        }
      }
      if (!subSchemaFound && isObject(subSchema.additionalItems)) {
        subSchemaFound = true;
        subSchema = subSchema.additionalItems;
        schemaPointer.push('additionalItems');
      } else if (subSchema.additionalItems !== false) {
        subSchemaFound = true;
        subSchema = { };
        schemaPointer.push('additionalItems');
      }
    } else if (subSchema.type === 'object') {
      if (isObject(subSchema.properties) && hasOwn(subSchema.properties, key)) {
        subSchemaFound = true
        subSchema = subSchema.properties[key];
        schemaPointer.push('properties', key);
      } else if (isObject(subSchema.additionalProperties)) {
        subSchemaFound = true
        subSchema = subSchema.additionalProperties;
        schemaPointer.push('additionalProperties');
      } else if (subSchema.additionalProperties !== false) {
        subSchemaFound = true
        subSchema = { };
        schemaPointer.push('additionalProperties');
      }
    }
    if (!subSchemaFound) {
      console.error(`getFromSchema error: Unable to find "${key}" item in schema.`);
      console.error(schema);
      console.error(dataPointer);
      return;
    }
  }
  return returnType.slice(-7) === 'Pointer' ? schemaPointer : subSchema;
}

/**
 * 'combineSchemas' function
 *
 * Attempt to combine two schemas from an allOf array into a single schema
 * with the same rules.
 *
 * @param {any} schema1 -
 * @param {any} schema2 -
 * @return {any} -
 */
export function combineSchemas(schema1, schema2) {
  if (isEmpty(schema1)) { return _.cloneDeep(schema2); }
  if (isEmpty(schema2)) { return _.cloneDeep(schema1); }
  if (!isObject(schema1) || !isObject(schema2)) {
    return { 'allOf': [schema1, schema2] };
  }
  const combinedSchema = _.cloneDeep(schema1);
  for (let key of Object.keys(schema2)) {
    let value1 = schema1[key];
    let value2 = schema2[key];
    if (!hasOwn(combinedSchema, key) || _.isEqual(value1, value2)) {
      combinedSchema[key] = value2;
    } else {
      let combined = true;
      switch (key) {
        case 'enum': case 'type': case 'anyOf': case 'oneOf':
        case 'additionalProperties':
          // If arrays, keep items common to both arrays
          if (isArray(value1) && isArray(value2)) {
            combinedSchema[key] = value1.filter(item1 =>
              value2.findIndex(item2 => _.isEqual(item1, item2)) > -1
            );
          // If objects, combine
          } else if (isObject(value1) && isObject(value2)) {
            combinedSchema[key] = combineSchemas(value1, value2);
          // If object + array, combine object with each array item
          } else if (isArray(value1) && isObject(value2)) {
            combinedSchema[key] = value1.map(item => combineSchemas(item, value2));
          } else if (isObject(value1) && isArray(value2)) {
            combinedSchema[key] = value2.map(item => combineSchemas(item, value1));
          } else {
            combined = false;
          }
        break;
        case 'allOf': case 'required':
          // If arrays, include all unique items from both arrays
          if (isArray(value1) && isArray(value2)) {
            combinedSchema[key] = [...value1, ...value2.filter(item2 =>
              value1.findIndex(item1 => _.isEqual(item2, item1)) === -1
            )];
          } else {
            combined = false;
          }
        break;
        case 'multipleOf':
          // If numbers, set to least common multiple
          if (isNumber(value1) && isNumber(value2)) {
            const gcd = (x, y) => !y ? x : gcd(y, x % y);
            const lcm = (x, y) => (x * y) / gcd(x, y);
            combinedSchema[key] = lcm(value1, value2);
          } else {
            combined = false;
          }
        break;
        case 'maximum': case 'exclusiveMaximum': case 'maxLength':
        case 'maxItems': case 'maxProperties':
          // If numbers, set to lowest value
          if (isNumber(value1) && isNumber(value2)) {
            combinedSchema[key] = Math.min(value1, value2);
          } else {
            combined = false;
          }
        break;
        case 'minimum': case 'exclusiveMinimum': case 'minLength':
        case 'minItems': case 'minProperties':
          // If numbers, set to highest value
          if (isNumber(value1) && isNumber(value2)) {
            combinedSchema[key] = Math.max(value1, value2);
          } else {
            combined = false;
          }
        break;
        case 'uniqueItems':
          // Set true if either true
          combinedSchema[key] = !!value1 || !!value2;
        break;
        default:
          combined = false;
      }
      if (!combined) {
        return { 'allOf': [schema1, schema2] };
      }
    }
  }
  return combinedSchema;
};

/**
 * 'removeRecursiveReferences' function
 *
 * Checks a JSON Pointer against a map of recursive references and returns
 * a JSON Pointer to the shallowest equivalent location in the same object.
 *
 * Using this functions enables an object to be constructed with unlimited
 * recursion, while maintaing a fixed set of metadata, such as field data types.
 * The object can grow as large as it wants, and deeply recursed nodes can
 * just refer to the metadata for their shallow equivalents, instead of having
 * to add additional redundant metadata for each recursively added node.
 *
 * Example:
 *
 * pointer:         '/stuff/and/more/and/more/and/more/and/more/stuff'
 * recursiveRefMap: [['/stuff/and/more/and/more', '/stuff/and/more/']]
 * returned:        '/stuff/and/more/stuff'
 *
 * @param  {Pointer} pointer -
 * @param  {Map<string, string>} recursiveRefMap -
 * @param  {Map<string, number>} arrayMap - optional
 * @return {string} -
 */
export function removeRecursiveReferences(
  pointer: Pointer, recursiveRefMap: Map<string, string>,
  arrayMap: Map<string, any> = new Map()
): string {
  if (!pointer) { return ''; }
  let genericPointer =
    JsonPointer.toGenericPointer(JsonPointer.compile(pointer), arrayMap);
  if (genericPointer.indexOf('/') === -1) { return genericPointer; }
  let possibleReferences = true;
  while (possibleReferences) {
    possibleReferences = false;
    recursiveRefMap.forEach((toPointer, fromPointer) => {
      if (JsonPointer.isSubPointer(toPointer, fromPointer)) {
        while (JsonPointer.isSubPointer(fromPointer, genericPointer, true)) {
          genericPointer = JsonPointer.toGenericPointer(
            toPointer + genericPointer.slice(fromPointer.length), arrayMap
          );
          possibleReferences = true;
        }
      }
    });
  }
  return genericPointer;
}

/**
 * 'getInputType' function
 *
 * @param {any} schema
 * @return {string}
 */
export function getInputType(schema: any, layoutNode: any = null): string {
  // x-schema-form = Angular Schema Form compatibility
  // widget & component = React Jsonschema Form compatibility
  let controlType = JsonPointer.getFirst([
    [schema, '/x-schema-form/type'],
    [schema, '/x-schema-form/widget/component'],
    [schema, '/x-schema-form/widget'],
    [schema, '/widget/component'],
    [schema, '/widget']
  ]);
  if (isString(controlType)) { return checkInlineType(controlType, schema, layoutNode); }
  let schemaType = schema.type;
  if (schemaType) {
    if (isArray(schemaType)) { // If multiple types listed, use most inclusive type
      schemaType =
        inArray('object', schemaType) && hasOwn(schema, 'properties') ? 'object' :
        inArray('array', schemaType) && hasOwn(schema, 'items') ? 'array' :
        inArray('string', schemaType) ? 'string' :
        inArray('number', schemaType) ? 'number' :
        inArray('integer', schemaType) ? 'integer' :
        inArray('boolean', schemaType) ? 'boolean' : 'null';
    }
    if (schemaType === 'boolean') { return 'checkbox'; }
    if (schemaType === 'object') {
      return hasOwn(schema, 'properties') ? 'section' :
        hasOwn(schema, '$ref') ? '$ref' :
        JsonPointer.has(schema, '/additionalProperties/$ref') ? '$ref' : null;
    }
    if (schemaType === 'array') {
      let itemsObject = JsonPointer.getFirst([
        [schema, '/items'],
        [schema, '/additionalItems']
      ]) || {};
      return hasOwn(itemsObject, 'enum') && schema.maxItems !== 1 ?
        checkInlineType('checkboxes', schema, layoutNode) : 'array';
    }
    if (schemaType === 'null') { return 'hidden'; }
    if (hasOwn(schema, 'enum') ||
      hasOwn(layoutNode, 'titleMap') ||
      getTitleMapFromOneOf(schema, null, true)
    ) { return 'select'; }
    if (schemaType === 'number' || schemaType === 'integer') {
      return (schemaType === 'integer' || hasOwn(schema, 'multipleOf')) &&
        hasOwn(schema, 'maximum') && hasOwn(schema, 'minimum') ? 'range' : schemaType;
    }
    if (schemaType === 'string') {
      return {
        'color': 'color',
        'date': 'date',
        'date-time': 'datetime-local',
        'email': 'email',
        'uri': 'url',
      }[schema.format] || 'text';
    }
  }
  return hasOwn(schema, '$ref') ? '$ref' : 'text';
}

/**
 * 'checkInlineType' function
 *
 * Checks layout and schema nodes for 'inline: true', and converts
 * 'radios' or 'checkboxes' to 'radios-inline' or 'checkboxes-inline'
 *
 * @param {string} controlType -
 * @param {JSON Schema} schema -
 * @return {string}
 */
export function checkInlineType(
  controlType: string, schema: any, layoutNode: any = null
): string {
  if (!isString(controlType) || (
    controlType.slice(0, 8) !== 'checkbox' && controlType.slice(0, 5) !== 'radio'
  )) {
    return controlType;
  }
  if (
    JsonPointer.getFirst([
      [layoutNode, '/inline'],
      [layoutNode, '/options/inline'],
      [schema, '/inline'],
      [schema, '/x-schema-form/inline'],
      [schema, '/x-schema-form/options/inline'],
      [schema, '/x-schema-form/widget/inline'],
      [schema, '/x-schema-form/widget/component/inline'],
      [schema, '/x-schema-form/widget/component/options/inline'],
      [schema, '/widget/inline'],
      [schema, '/widget/component/inline'],
      [schema, '/widget/component/options/inline'],
    ]) === true
  ) {
    return controlType.slice(0, 5) === 'radio' ?
      'radios-inline' : 'checkboxes-inline';
  } else {
    return controlType;
  }
}

/**
 * 'isInputRequired' function
 *
 * Checks a JSON Schema to see if an item is required
 *
 * @param {schema} schema - the schema to check
 * @param {string} pointer - the pointer to the item to check
 * @return {boolean} - true if the item is required, false if not
 */
export function isInputRequired(schema: any, schemaPointer: string): boolean {
  if (!isObject(schema)) {
    console.error('isInputRequired error: Input schema must be an object.');
    return false;
  }
  const listPointerArray = JsonPointer.parse(schemaPointer);
  if (isArray(listPointerArray)) {
    if (!listPointerArray.length) { return schema.required === true; }
    const keyName = listPointerArray.pop();
    const nextToLastKey = listPointerArray[listPointerArray.length - 1];
    if (['properties', 'additionalProperties', 'patternProperties', 'items', 'additionalItems']
      .includes(nextToLastKey)
    ) {
      listPointerArray.pop();
    }
    const parentSchema = JsonPointer.get(schema, listPointerArray) || {};
    if (isArray(parentSchema.required)) {
      return parentSchema.required.includes(keyName);
    }
    if (parentSchema.type === 'array') {
      return hasOwn(parentSchema, 'minItems') &&
        isNumber(keyName) &&
        +parentSchema.minItems > +keyName;
    }
  }
  return false;
};

/**
 * 'updateInputOptions' function
 *
 * @param {any} layoutNode
 * @param {any} schema
 * @return {void}
 */
export function updateInputOptions(layoutNode: any, schema: any, jsf: any) {
  if (!isObject(layoutNode) || !isObject(layoutNode.options)) { return; }
  const templatePointer = JsonPointer.get(
    jsf, ['dataMap', layoutNode.dataPointer, 'templatePointer']
  );

  // If a validator is available for a layout option,
  // and not already set in the formGroup template, set it
  // if (templatePointer) {
  //   Object.keys(layoutNode.options)
  //     .filter(option => isFunction(JsonValidators[option]))
  //     .filter(option => !hasOwn(schema, option) || (
  //       schema[option] !== layoutNode.options[option] &&
  //       !(option.slice(0, 3) === 'min' && schema[option] <= layoutNode.options[option]) &&
  //       !(option.slice(0, 3) === 'max' && schema[option] >= layoutNode.options[option])
  //     ))
  //     .forEach(option => jsf.formGroupTemplate = JsonPointer.set(
  //       jsf.formGroupTemplate,
  //       templatePointer + '/validators/' + option,
  //       [ layoutNode.options[option] ]
  //     ));
  // }

  // Set all option values in layoutNode.options
  let newOptions: any = { };
  const fixUiKeys = key => key.slice(0, 3).toLowerCase() === 'ui:' ? key.slice(3) : key;
  mergeFilteredObject(newOptions, jsf.globalOptions.formDefaults, [], fixUiKeys);
  [ [ JsonPointer.get(schema, '/ui:widget/options'), [] ],
    [ JsonPointer.get(schema, '/ui:widget'), [] ],
    [ schema, [
      'additionalProperties', 'additionalItems', 'properties', 'items',
      'required', 'type', 'x-schema-form', '$ref'
    ] ],
    [ JsonPointer.get(schema, '/x-schema-form/options'), [] ],
    [ JsonPointer.get(schema, '/x-schema-form'), ['items', 'options'] ],
    [ layoutNode, [
      '_id', '$ref', 'arrayItem', 'arrayItemType', 'dataPointer',
      'dataType', 'items', 'key', 'layoutPointer', 'name', 'options',
      'recursiveReference', 'type', 'widget'
    ] ],
    [ layoutNode.options, [] ],
  ].forEach(([ object, excludeKeys ]) =>
    mergeFilteredObject(newOptions, object, excludeKeys, fixUiKeys)
  );
  if (!hasOwn(newOptions, 'titleMap')) {
    let newTitleMap: any = null;
    newTitleMap = getTitleMapFromOneOf(schema, newOptions.flatList);
    if (newTitleMap) { newOptions.titleMap = newTitleMap; }
    if (!hasOwn(newOptions, 'titleMap') && !hasOwn(newOptions, 'enum') && hasOwn(schema, 'items')) {
      if (JsonPointer.has(schema, '/items/titleMap')) {
        newOptions.titleMap = schema.items.titleMap;
      } else if (JsonPointer.has(schema, '/items/enum')) {
        newOptions.enum = schema.items.enum;
        if (!hasOwn(newOptions, 'enumNames') && JsonPointer.has(schema, '/items/enumNames')) {
          newOptions.enum = schema.items.enumNames;
        }
      } else if (JsonPointer.has(schema, '/items/oneOf')) {
        newTitleMap = getTitleMapFromOneOf(schema.items, newOptions.flatList);
        if (newTitleMap) { newOptions.titleMap = newTitleMap; }
      }
    }
  }

  // If schema type is integer, enforce by setting multipleOf = 1
  if (schema.type === 'integer' && !hasValue(layoutNode.options.multipleOf)) {
    newOptions.multipleOf = 1;
  }

  // Copy any typeahead word lists to options.typeahead.source
  if (JsonPointer.has(newOptions, '/autocomplete/source')) {
    newOptions.typeahead = newOptions.autocomplete;
  } else if (JsonPointer.has(newOptions, '/tagsinput/source')) {
    newOptions.typeahead = newOptions.tagsinput;
  } else if (JsonPointer.has(newOptions, '/tagsinput/typeahead/source')) {
    newOptions.typeahead = newOptions.tagsinput.typeahead;
  }

  layoutNode.options = newOptions;

  // const nodeValue = JsonPointer.getFirst([
  //   [ jsf.initialValues, layoutNode.dataPointer ],
  //   [ layoutNode, '/options/value' ],
  //   [ layoutNode, '/options/default' ]
  // ]);
  // if (hasValue(nodeValue)) {
  //   layoutNode.value = nodeValue;
  //   delete layoutNode.options.value;
  //   delete layoutNode.options.default;
  //
  //   // If field value is set in layoutNode, and no input data, update template value
  //   if (templatePointer && schema.type !== 'array' && schema.type !== 'object') {
  //     let templateValue = JsonPointer.get(
  //       jsf.formGroupTemplate, templatePointer + '/value/value'
  //     );
  //     if (hasValue(nodeValue) && nodeValue !== templateValue) {
  //       jsf.formGroupTemplate = JsonPointer.set(
  //         jsf.formGroupTemplate, templatePointer + '/value/value', nodeValue
  //       );
  //     }
  //   }
  // }
}

/**
 * 'getTitleMapFromOneOf' function
 *
 * @param {schema} schema
 * @param {boolean} flatList
 * @param {boolean} validateOnly
 * @return {validators}
 */
export function getTitleMapFromOneOf(
  schema: any = {}, flatList: boolean = null, validateOnly: boolean = false
) {
  let titleMap = null;
  if (isArray(schema.oneOf) && schema.oneOf.every(item => item.title)) {
    if (schema.oneOf.every(item => isArray(item.enum) && item.enum.length === 1)) {
      if (validateOnly) { return true; }
      titleMap = schema.oneOf.map(item => ({ name: item.title, value: item.enum[0] }));
    } else if (schema.oneOf.every(item => item.const)) {
      if (validateOnly) { return true; }
      titleMap = schema.oneOf.map(item => ({ name: item.title, value: item.const }));
    }

    // if flatList !== false and some items have colons, make grouped map
    if (flatList !== false &&
      (titleMap || []).filter(title => ((title || {}).name || '').indexOf(': ')).length > 1
    ) {

      // Split name on first colon to create grouped map (name -> group: name)
      const newTitleMap = titleMap.map(title => {
        let [group, name] = title.name.split(/: (.+)/);
        return group && name ? { ...title, group, name } : title;
      });

      // If flatList === true or some groups have multiple items, use grouped map
      if (flatList === true || newTitleMap.some((title, index) => index &&
        hasOwn(title, 'group') && title.group === newTitleMap[index - 1].group
      )) {
        titleMap = newTitleMap;
      }
    }
  }
  return validateOnly ? false : titleMap;
}

/**
 * 'getControlValidators' function
 *
 * @param {schema} schema
 * @return {validators}
 */
export function getControlValidators(schema: any) {
  if (!isObject(schema)) { return null; }
  let validators: any = { };
  if (hasOwn(schema, 'type')) {
    switch (schema.type) {
      case 'string':
        forEach(['pattern', 'format', 'minLength', 'maxLength'], (prop) => {
          if (hasOwn(schema, prop)) { validators[prop] = [schema[prop]]; }
        });
      break;
      case 'number': case 'integer':
        forEach(['Minimum', 'Maximum'], (ucLimit) => {
          let eLimit = 'exclusive' + ucLimit;
          let limit = ucLimit.toLowerCase();
          if (hasOwn(schema, limit)) {
            let exclusive = hasOwn(schema, eLimit) && schema[eLimit] === true;
            validators[limit] = [schema[limit], exclusive];
          }
        });
        forEach(['multipleOf', 'type'], (prop) => {
          if (hasOwn(schema, prop)) { validators[prop] = [schema[prop]]; }
        });
      break;
      case 'object':
        forEach(['minProperties', 'maxProperties', 'dependencies'], (prop) => {
          if (hasOwn(schema, prop)) { validators[prop] = [schema[prop]]; }
        });
      break;
      case 'array':
        forEach(['minItems', 'maxItems', 'uniqueItems'], (prop) => {
          if (hasOwn(schema, prop)) { validators[prop] = [schema[prop]]; }
        });
      break;
    }
  }
  if (hasOwn(schema, 'enum')) { validators.enum = [schema.enum]; }
  return validators;
}

/**
 * 'resolveSchemaReferences' function
 *
 * Find all $ref links in schema and save links and referenced schemas in
 * schemaRefLibrary, schemaRecursiveRefMap, and dataRecursiveRefMap
 *
 * @param {schema} schema
 * @return {void}
 */
export function resolveSchemaReferences(
  schema: any, schemaRefLibrary: any, schemaRecursiveRefMap: Map<string, string>,
  dataRecursiveRefMap: Map<string, string>, arrayMap: Map<string, number>
): any {
  if (!isObject(schema)) {
    console.error('resolveSchemaReferences error: schema must be an object.');
    return;
  }
  const refLinks = new Set<string>();
  const refMapSet = new Set<string>();
  const refMap = new Map<string, string>();
  const recursiveRefMap = new Map<string, string>();
  const refLibrary: any = {};

  // Search schema for all $ref links, and build full refLibrary
  JsonPointer.forEachDeep(schema, (subSchema, subSchemaPointer) => {
    if (hasOwn(subSchema, '$ref') && isString(subSchema['$ref'])) {
      const refPointer = JsonPointer.compile(subSchema['$ref']);
      refLinks.add(refPointer);
      refMapSet.add(subSchemaPointer + '~~' + refPointer);
      refMap.set(subSchemaPointer, refPointer);
    }
  });
  refLinks.forEach(ref => refLibrary[ref] = getSubSchema(schema, ref));

  // Follow all ref links and save in refMapSet,
  // to find any multi-link recursive refernces
  let checkRefLinks = true;
  while (checkRefLinks) {
    checkRefLinks = false;
    Array.from(refMap).forEach(([fromRef1, toRef1]) => Array.from(refMap)
      .filter(([fromRef2, toRef2]) =>
        JsonPointer.isSubPointer(toRef1, fromRef2, true) &&
        !JsonPointer.isSubPointer(toRef2, toRef1, true) &&
        !refMapSet.has(fromRef1 + fromRef2.slice(toRef1.length) + '~~' + toRef2)
      )
      .forEach(([fromRef2, toRef2]) => {
        refMapSet.add(fromRef1 + fromRef2.slice(toRef1.length) + '~~' + toRef2);
        checkRefLinks = true;
      })
    );
  }

  // Build full recursiveRefMap
  // First pass - save all internally recursive refs from refMapSet
  Array.from(refMapSet)
    .map(refLink => refLink.split('~~'))
    .filter(([fromRef, toRef]) => JsonPointer.isSubPointer(toRef, fromRef))
    .forEach(([fromRef, toRef]) => recursiveRefMap.set(fromRef, toRef));
  // Second pass - create recursive versions of any other refs that link to recursive refs
  Array.from(refMap)
    .filter(([fromRef1, toRef1]) => Array.from(recursiveRefMap.keys())
      .every(fromRef2 => !JsonPointer.isSubPointer(fromRef1, fromRef2, true))
    )
    .forEach(([fromRef1, toRef1]) => Array.from(recursiveRefMap)
      .filter(([fromRef2, toRef2]) =>
        !recursiveRefMap.has(fromRef1 + fromRef2.slice(toRef1.length)) &&
        JsonPointer.isSubPointer(toRef1, fromRef2, true) &&
        !JsonPointer.isSubPointer(toRef1, fromRef1, true)
      )
      .forEach(([fromRef2, toRef2]) => recursiveRefMap.set(
        fromRef1 + fromRef2.slice(toRef1.length),
        fromRef1 + toRef2.slice(toRef1.length)
      ))
    );

  // Create compiled schema by replacing all non-recursive $ref links with
  // thieir linked schemas and, where possible, combining schemas in allOf arrays.
  let compiledSchema = { ...schema };
  delete compiledSchema.definitions;
  compiledSchema =
    getSubSchema(compiledSchema, '', refLibrary, recursiveRefMap);

  // Make sure all remaining schema $refs are recursive, and build final
  // schemaRefLibrary, schemaRecursiveRefMap, dataRecursiveRefMap, & arrayMap
  JsonPointer.forEachDeep(compiledSchema, (subSchema, subSchemaPointer) => {
    if (isString(subSchema['$ref'])) {
      let refPointer = JsonPointer.compile(subSchema['$ref']);
      if (!JsonPointer.isSubPointer(refPointer, subSchemaPointer, true)) {
        refPointer = removeRecursiveReferences(subSchemaPointer, recursiveRefMap);
        JsonPointer.set(compiledSchema, subSchemaPointer, { $ref: `#${refPointer}` });
      }
      schemaRefLibrary[refPointer] =
        getSubSchema(compiledSchema, refPointer, schemaRefLibrary, recursiveRefMap);
      schemaRecursiveRefMap.set(subSchemaPointer, refPointer);
      const fromDataRef = JsonPointer.toDataPointer(subSchemaPointer, compiledSchema);
      const toDataRef = JsonPointer.toDataPointer(refPointer, compiledSchema);
      if (fromDataRef && toDataRef) {
        dataRecursiveRefMap.set(fromDataRef, toDataRef);
      }
    }
    if (subSchema.type === 'array' &&
      (hasOwn(subSchema, 'items') || hasOwn(subSchema, 'additionalItems'))
    ) {
      const dataPointer = JsonPointer.toDataPointer(subSchemaPointer, compiledSchema);
      const tupleItems = isArray(subSchema.items) ? subSchema.items.length : 0;
      arrayMap.set(dataPointer, tupleItems);
    }
  }, true);
  return compiledSchema;
}

/**
 * 'getSubSchema' function
 *
 * @param {schema} schema
 * @param {Pointer} pointer
 * @param {object} schemaRefLibrary
 * @param {Map<string, string>} schemaRecursiveRefMap
 * @param {boolean = true} compile
 * @param {Pointer = pointer} initialPointer
 * @return {schema}
 */
export function getSubSchema(
  schema: any, pointer: Pointer, schemaRefLibrary: any = null,
  schemaRecursiveRefMap: Map<string, string> = null, usedPointers: string[] = []
): any {
  if (!schemaRefLibrary || !schemaRecursiveRefMap) {
    return JsonPointer.getCopy(schema, pointer);
  }
  if (typeof pointer !== 'string') { pointer = JsonPointer.compile(pointer); }
  usedPointers = [ ...usedPointers, pointer ];
  let newSchema: any = null;
  if (pointer === '') {
    newSchema = _.cloneDeep(schema);
  } else {
    const shortPointer = removeRecursiveReferences(pointer, schemaRecursiveRefMap);
    if (shortPointer !== pointer) { usedPointers = [ ...usedPointers, shortPointer ]; }
    newSchema = JsonPointer.getFirstCopy([
      [schemaRefLibrary, [shortPointer]],
      [schema, pointer],
      [schema, shortPointer]
    ]);
  }
  return JsonPointer.forEachDeepCopy(newSchema, (subSchema, subPointer) => {
    if (isObject(subSchema)) {

      // Replace non-recursive subSchemas
      if (isString(subSchema.$ref)) {
        const refPointer = JsonPointer.compile(subSchema.$ref);
        if (refPointer.length && usedPointers.every(ptr =>
          !JsonPointer.isSubPointer(refPointer, ptr, true)
        )) {
          const refSchema = getSubSchema(
            schema, refPointer, schemaRefLibrary, schemaRecursiveRefMap, usedPointers
          );
          if (Object.keys(subSchema).length === 1) {
            return refSchema;
          } else {
            subSchema = _.cloneDeep(subSchema);
            delete subSchema.$ref;
            return mergeSchemas(subSchema, refSchema);
          }
        }
      }

      // Combine allOf subSchemas
      if (isArray(subSchema.allOf)) { return combineAllOf(subSchema); }

      // Fix incorrectly placed array object required lists
      if (subSchema.type === 'array' && isArray(subSchema.required)) {
        return fixRequiredArrayProperties(subSchema);
      }
    }
    return subSchema;
  }, true, pointer);
}

/**
 * 'combineAllOf' function
 *
 * Attempt to convert an allOf schema object into
 * a non-allOf schema object with equivalent rules.
 *
 * @param {any} schema - allOf schema object
 * @return {any} - converted schema object
 */
export function combineAllOf(schema: any): any {
  if (!isObject(schema) || !isArray(schema.allOf)) { return schema; }
  let mergedSchema = mergeSchemas(...schema.allOf);
  if (Object.keys(schema).length > 1) {
    const extraKeys = { ...schema };
    delete extraKeys.allOf;
    mergedSchema = mergeSchemas(mergedSchema, extraKeys);
  }
  return mergedSchema;
}

/**
 * 'fixRequiredArrayProperties' function
 *
 * Fixes an incorrectly placed required list inside an array schema, by moving
 * it into items.properties or additionalItems.properties, where it belongs.
 *
 * @param {any} schema - allOf schema object
 * @return {any} - converted schema object
 */
export function fixRequiredArrayProperties(schema: any): any {
  if (schema.type === 'array' && isArray(schema.required)) {
    let itemsObject = hasOwn(schema.items, 'properties') ? 'items' :
      hasOwn(schema.additionalItems, 'properties') ? 'additionalItems' : null;
    if (itemsObject && !hasOwn(schema[itemsObject], 'required') && (
      hasOwn(schema[itemsObject], 'additionalProperties') ||
      schema.required.every(key => hasOwn(schema[itemsObject].properties, key))
    )) {
      schema = _.cloneDeep(schema);
      schema[itemsObject].required = schema.required;
      delete schema.required;
    }
  }
  return schema;
}