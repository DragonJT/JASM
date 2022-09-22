"use strict";
const ieee754 = (n) => {
    var data = new Float32Array([n]);
    var buffer = new ArrayBuffer(data.byteLength);
    var floatView = new Float32Array(buffer).set(data);
    return new Uint8Array(buffer);
};
const encodeString = (str) => [
    str.length,
    ...str.split("").map(s => s.charCodeAt(0))
];
const signedLEB128 = (n) => {
    const buffer = [];
    let more = true;
    const isNegative = n < 0;
    const bitCount = Math.ceil(Math.log2(Math.abs(n))) + 1;
    while (more) {
        let byte = n & 0x7f;
        n >>= 7;
        if (isNegative) {
            n = n | -(1 << (bitCount - 8));
        }
        if ((n === 0 && (byte & 0x40) === 0) || (n === -1 && (byte & 0x40) !== 0x40)) {
            more = false;
        }
        else {
            byte |= 0x80;
        }
        buffer.push(byte);
    }
    return buffer;
};
const unsignedLEB128 = (n) => {
    const buffer = [];
    do {
        let byte = n & 0x7f;
        n >>>= 7;
        if (n !== 0) {
            byte |= 0x80;
        }
        buffer.push(byte);
    } while (n !== 0);
    return buffer;
};
//=============================
const flatten = (arr) => [].concat.apply([], arr);
// https://webassembly.github.io/spec/core/binary/modules.html#sections
var Section;
(function (Section) {
    Section[Section["custom"] = 0] = "custom";
    Section[Section["type"] = 1] = "type";
    Section[Section["import"] = 2] = "import";
    Section[Section["func"] = 3] = "func";
    Section[Section["table"] = 4] = "table";
    Section[Section["memory"] = 5] = "memory";
    Section[Section["global"] = 6] = "global";
    Section[Section["export"] = 7] = "export";
    Section[Section["start"] = 8] = "start";
    Section[Section["element"] = 9] = "element";
    Section[Section["code"] = 10] = "code";
    Section[Section["data"] = 11] = "data";
})(Section || (Section = {}));
// https://webassembly.github.io/spec/core/binary/types.html
var Valtype;
(function (Valtype) {
    Valtype[Valtype["i32"] = 127] = "i32";
    Valtype[Valtype["f32"] = 125] = "f32";
})(Valtype || (Valtype = {}));
// https://webassembly.github.io/spec/core/binary/types.html#binary-blocktype
var Blocktype;
(function (Blocktype) {
    Blocktype[Blocktype["void"] = 64] = "void";
})(Blocktype || (Blocktype = {}));
// https://webassembly.github.io/spec/core/binary/instructions.html
var Opcodes;
(function (Opcodes) {
    Opcodes[Opcodes["block"] = 2] = "block";
    Opcodes[Opcodes["loop"] = 3] = "loop";
    Opcodes[Opcodes["br"] = 12] = "br";
    Opcodes[Opcodes["br_if"] = 13] = "br_if";
    Opcodes[Opcodes["end"] = 11] = "end";
    Opcodes[Opcodes["call"] = 16] = "call";
    Opcodes[Opcodes["get_local"] = 32] = "get_local";
    Opcodes[Opcodes["set_local"] = 33] = "set_local";
    Opcodes[Opcodes["i32_store_8"] = 58] = "i32_store_8";
    Opcodes[Opcodes["i32_const"] = 65] = "i32_const";
    Opcodes[Opcodes["f32_const"] = 67] = "f32_const";
    Opcodes[Opcodes["i32_eqz"] = 69] = "i32_eqz";
    Opcodes[Opcodes["i32_eq"] = 70] = "i32_eq";
    Opcodes[Opcodes["f32_eq"] = 91] = "f32_eq";
    Opcodes[Opcodes["f32_lt"] = 93] = "f32_lt";
    Opcodes[Opcodes["f32_gt"] = 94] = "f32_gt";
    Opcodes[Opcodes["i32_and"] = 113] = "i32_and";
    Opcodes[Opcodes["f32_add"] = 146] = "f32_add";
    Opcodes[Opcodes["f32_sub"] = 147] = "f32_sub";
    Opcodes[Opcodes["f32_mul"] = 148] = "f32_mul";
    Opcodes[Opcodes["f32_div"] = 149] = "f32_div";
    Opcodes[Opcodes["i32_trunc_f32_s"] = 168] = "i32_trunc_f32_s";
})(Opcodes || (Opcodes = {}));
const binaryOpcode = {
    "+": Opcodes.f32_add,
    "-": Opcodes.f32_sub,
    "*": Opcodes.f32_mul,
    "/": Opcodes.f32_div,
    "==": Opcodes.f32_eq,
    ">": Opcodes.f32_gt,
    "<": Opcodes.f32_lt,
    "&&": Opcodes.i32_and
};
// http://webassembly.github.io/spec/core/binary/modules.html#export-section
var ExportType;
(function (ExportType) {
    ExportType[ExportType["func"] = 0] = "func";
    ExportType[ExportType["table"] = 1] = "table";
    ExportType[ExportType["mem"] = 2] = "mem";
    ExportType[ExportType["global"] = 3] = "global";
})(ExportType || (ExportType = {}));
// http://webassembly.github.io/spec/core/binary/types.html#function-types
const functionType = 0x60;
const emptyArray = 0x0;
// https://webassembly.github.io/spec/core/binary/modules.html#binary-module
const magicModuleHeader = [0x00, 0x61, 0x73, 0x6d];
const moduleVersion = [0x01, 0x00, 0x00, 0x00];
// https://webassembly.github.io/spec/core/binary/conventions.html#binary-vec
// Vectors are encoded with their length followed by their element sequence
const encodeVector = (data) => [
    ...unsignedLEB128(data.length),
    ...flatten(data)
];
// https://webassembly.github.io/spec/core/binary/modules.html#code-section
const encodeLocal = (count, type) => [
    ...unsignedLEB128(count),
    type
];
// https://webassembly.github.io/spec/core/binary/modules.html#sections
// sections are encoded by their type followed by their vector contents
const createSection = (sectionType, data) => [
    sectionType,
    ...encodeVector(data)
];
const codeFromProc = () => {
    const code = [];
    code.push(Opcodes.f32_const);
    code.push(...ieee754(4.5));
    code.push(Opcodes.call);
    code.push(...unsignedLEB128(0));
    const localCount = 0;
    const locals = localCount > 0 ? [encodeLocal(localCount, Valtype.f32)] : [];
    return encodeVector([...encodeVector(locals), ...code, Opcodes.end]);
};
class JFunction {
    constructor(name, args) {
        this.args = args;
        this.name = name;
    }
}
function emitter(functions) {
    // Function types are vectors of parameters and return types. Currently
    // WebAssembly only supports single return values
    const printFunctionType = [
        functionType,
        ...encodeVector([Valtype.f32]),
        emptyArray
    ];
    // TODO: optimise - some of the procs might have the same type signature
    const funcTypes = functions.map(f => [
        functionType,
        ...encodeVector(f.args),
        emptyArray
    ]);
    // the type section is a vector of function types
    const typeSection = createSection(Section.type, encodeVector([printFunctionType, ...funcTypes]));
    // the function section is a vector of type indices that indicate the type of each function
    // in the code section
    const funcSection = createSection(Section.func, encodeVector(functions.map((_, index) => index + 1 /* type index */)));
    // the import section is a vector of imported functions
    const printFunctionImport = [
        ...encodeString("env"),
        ...encodeString("print"),
        ExportType.func,
        0x00 // type index
    ];
    const importSection = createSection(Section.import, encodeVector([printFunctionImport]));
    // the export section is a vector of exported functions
    const exportSection = createSection(Section.export, encodeVector([
        [
            ...encodeString("run"),
            ExportType.func,
            functions.findIndex(f => f.name === "main") + 1
        ]
    ]));
    // the code section contains vectors of functions
    const codeSection = createSection(Section.code, encodeVector(functions.map(f => codeFromProc())));
    return Uint8Array.from([
        ...magicModuleHeader,
        ...moduleVersion,
        ...typeSection,
        ...importSection,
        ...funcSection,
        ...exportSection,
        ...codeSection
    ]);
}
;
//========================
var functions = [new JFunction("main", [])];
var wasm = emitter(functions);
const importObject = {
    env: {
        print(i) {
            console.log(i);
        },
    },
};
WebAssembly.instantiate(wasm, importObject).then((obj) => {
    var exports = obj.instance.exports;
    exports.run();
});
