#!/usr/bin/env node

const g = require('graphql')
const fs = require('fs')

const schema = require('./introspection-query.json')
const query = g.parse(fs.readFileSync('./courses.graphql', 'utf8'))

const t = require('@babel/types')
const generate = require('@babel/generator').default

const typesByName = {};
const unionsByName = {};
schema.data.__schema.types.forEach(t => {
  if (t.kind === 'UNION') {
    unionsByName[t.name] = t
    return
  }
  if (t.kind !== 'OBJECT') {
    return
  }
  typesByName[t.name] = t
  t.fieldsByName = {}
  if (!t.fields) {
    console.log('no fields', t.name)
    return
  }
  t.fields.forEach(field => {
    t.fieldsByName[field.name] = field
  })
});

const objectPropertiesToFlow = (type, selections) => {
  return selections.map(selection => {
    if (selection.kind !== 'Field') {
      console.log('not field selection', selection)
      return null
    }
    const name = selection.name.value
    if (!type.fieldsByName[name]) {
      console.warn('Unknown field: ' + name)
      return t.objectTypeProperty(t.identifier(name),
      t.anyTypeAnnotation()
        )
    }
    const typeField = type.fieldsByName[name];
    return t.objectTypeProperty(t.identifier(name), typeToFlow(typeField.type, selection))
  }).filter(Boolean)
};

const unionToFlow = (type, selections) => {
  // const type = typesByName[typeName]
  return t.objectTypeAnnotation(
    [].concat(...selections.map(selection => {
      if (selection.kind === 'Field' && selection.name.value === '__typename') {
        return [t.objectTypeProperty(t.identifier(selection.name.value), t.genericTypeAnnotation(t.identifier('string')))]
      }
      if (selection.kind !== 'InlineFragment') {
        console.log('union selectors must be inline fragment', selection)
        return []
      }
      const typeName = selection.typeCondition.name.value
      if (!typesByName[typeName]) {
        console.warn('Unknown selected type: ' + typeName)
        return []
      }
      return objectPropertiesToFlow(typesByName[typeName], selection.selectionSet.selections)
    }))
  )
};

const typeToFlow = (type, selection) => {
  if (type.kind === 'SCALAR') {
    switch (type.name) {
      case 'Boolean':
        return t.genericTypeAnnotation(t.identifier('boolean'))
      case 'ID':
      case 'String':
        return t.genericTypeAnnotation(t.identifier('string'))
      case 'Int':
      case 'Float':
        return t.genericTypeAnnotation(t.identifier('number'))
      case 'JSONString':
        return t.genericTypeAnnotation(t.identifier('Object'))
      default:
        console.log('scalar', type.name)
        return t.anyTypeAnnotation();
    }
  }
  if (type.kind === 'LIST') {
    return t.arrayTypeAnnotation(
      typeToFlow(type.ofType, selection)
    )
  }
  if (type.kind === 'UNION') {
    const union = unionsByName[type.name]
    if (!selection.selectionSet) {
      console.log('no selection set on field', field)
      return t.anyTypeAnnotation()
    }
    return unionToFlow(union, selection.selectionSet.selections)
  }
  if (type.kind !== 'OBJECT') {
    console.log('not object', field)
    return t.anyTypeAnnotation()
  }
  const tname = type.name
  if (!typesByName[tname]) {
    console.log('unknowne referenced type', tname)
    return t.anyTypeAnnotation();
  }
  const childType = typesByName[tname];
  if (!selection.selectionSet) {
    console.log('no selection set on field', field)
    return t.anyTypeAnnotation()
  }
  return querySelectionToObjectType(selection.selectionSet.selections, childType)
};

// const toType = (field, selection) => {
//   if (field.type.kind === 'SCALAR') {
//     switch (field.type.name) {
//       case 'Boolean':
//         return t.genericTypeAnnotation(t.identifier('boolean'))
//       case 'String':
//         return t.genericTypeAnnotation(t.identifier('string'))
//       case 'Int':
//       case 'Float':
//         return t.genericTypeAnnotation(t.identifier('number'))
//       default:
//         console.log('scalar', field.type.name)
//         return t.anyTypeAnnotation();
//     }
//   }
//   if (field.type.kind === 'LIST') {
//     return t.arrayTypeAnnotation(
//       querySelectionToObjectType(selection.selectionSet.selections, typesByName[field.type.ofType.name])
//     )
//   }
//   if (field.type.kind !== 'OBJECT') {
//     console.log('not object', field)
//     return t.anyTypeAnnotation()
//   }
//   const tname = field.type.name
//   if (!typesByName[tname]) {
//     console.log('unknowne referenced type', tname)
//     return t.anyTypeAnnotation();
//   }
//   const childType = typesByName[tname];
//   if (!selection.selectionSet) {
//     console.log('no selection set on field', field)
//     return t.anyTypeAnnotation()
//   }
//   return querySelectionToObjectType(selection.selectionSet.selections, childType)
// };

const querySelectionToObjectType = (selections, type) => {
  // const type = typesByName[typeName]
  return t.objectTypeAnnotation(
    objectPropertiesToFlow(type, selections)
  )
};

console.log(generate(querySelectionToObjectType(query.definitions[0].selectionSet.selections, typesByName.Query)).code)