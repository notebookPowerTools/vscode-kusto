// Definition of schema object in the context of language services. This model is exposed to consumers of this library.
var dotnetTypeToKustoType = {
    'System.SByte': 'bool',
    'System.Byte': 'uint8',
    'System.Int16': 'int16',
    'System.UInt16': 'uint16',
    'System.Int32': 'int',
    'System.UInt32': 'uint',
    'System.Int64': 'long',
    'System.UInt64': 'ulong',
    'System.String': 'string',
    'System.Single': 'float',
    'System.Double': 'real',
    'System.DateTime': 'datetime',
    'System.TimeSpan': 'timespan',
    'System.Guid': 'guid',
    'System.Boolean': 'bool',
    'Newtonsoft.Json.Linq.JArray': 'dynamic',
    'Newtonsoft.Json.Linq.JObject': 'dynamic',
    'Newtonsoft.Json.Linq.JToken': 'dynamic',
    'System.Object': 'dynamic',
    'System.Data.SqlTypes.SqlDecimal': 'decimal'
};
// export var getCslTypeNameFromClrType = function (clrType) { return dotnetTypeToKustoType[clrType] || clrType; };
function getCslTypeNameFromClrType(clrType) { return dotnetTypeToKustoType[clrType] || clrType; };
exports.getCslTypeNameFromClrType = getCslTypeNameFromClrType;
var kustoTypeToEntityDataType = {
    object: 'Object',
    bool: 'Boolean',
    uint8: 'Byte',
    int16: 'Int16',
    uint16: 'UInt16',
    int: 'Int32',
    uint: 'UInt32',
    long: 'Int64',
    ulong: 'UInt64',
    float: 'Single',
    real: 'Double',
    decimal: 'Decimal',
    datetime: 'DateTime',
    string: 'String',
    dynamic: 'Dynamic',
    timespan: 'TimeSpan'
};
exports.getEntityDataTypeFromCslType = function (cslType) { return kustoTypeToEntityDataType[cslType] || cslType; };
exports.getCallName = function (fn) {
    return fn.name + "(" + fn.inputParameters.map(function (p) { return "{" + p.name + "}"; }).join(',') + ")";
};
exports.getExpression = function (fn) {
    return "let " + fn.name + " = " + getInputParametersAsCslString(fn.inputParameters) + " " + fn.body;
};
var getInputParametersAsCslString = function (inputParameters) {
    return "(" + inputParameters.map(function (inputParameter) { return getInputParameterAsCslString(inputParameter); }).join(',') + ")";
};
exports.getInputParametersAsCslString = getInputParametersAsCslString;
var getInputParameterAsCslString = function (inputParameter) {
    // If this is a tabular parameter
    if (inputParameter.columns && inputParameter.columns.length > 0) {
        var attributesAsString = inputParameter.columns
            .map(function (col) { return col.name + ":" + (col.cslType || getCslTypeNameFromClrType(col.type)); })
            .join(',');
        return inputParameter.name + ":" + (attributesAsString === '' ? '*' : attributesAsString);
    }
    else {
        return inputParameter.name + ":" + (inputParameter.cslType || getCslTypeNameFromClrType(inputParameter.type));
    }
};
