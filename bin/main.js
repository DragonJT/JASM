"use strict";
//copied quite a lot from https://github.com/ColinEberhardt/chasm
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
class JFunction {
    constructor(index, name, args) {
        this.code = [];
        this.funcIndex = index;
        this.args = args;
        this.name = name;
        for (var i = 0; i < args.length; i++)
            args[i].localIndex = i;
    }
    F32Const(value) {
        this.code.push(Opcodes.f32_const);
        this.code.push(...ieee754(value));
    }
    F32Add() {
        this.code.push(Opcodes.f32_add);
    }
    F32Mul() {
        this.code.push(Opcodes.f32_mul);
    }
    Call(callableFunction) {
        this.code.push(Opcodes.call);
        this.code.push(...unsignedLEB128(callableFunction.funcIndex));
    }
    GetLocal(name) {
        this.code.push(Opcodes.get_local);
        this.code.push(...unsignedLEB128(this.args.find(a => a.name == name).localIndex));
    }
    Encode() {
        const localCount = 0;
        const locals = localCount > 0 ? [encodeLocal(localCount, Valtype.f32)] : [];
        return encodeVector([...encodeVector(locals), ...this.code, Opcodes.end]);
    }
}
class JImportFunction {
    constructor(index, name1, name2, args, body) {
        this.funcIndex = index;
        this.name1 = name1;
        this.name2 = name2;
        this.args = args;
        for (var i = 0; i < args.length; i++)
            args[i].localIndex = i;
        this.body = body;
    }
    Encode() {
        return [
            ...encodeString(this.name1),
            ...encodeString(this.name2),
            ExportType.func,
            ...unsignedLEB128(this.funcIndex)
        ];
    }
}
class JArg {
    constructor(type, name) {
        this.localIndex = -1;
        this.type = type;
        this.name = name;
    }
}
class JASM {
    constructor() {
        this.importFunctions = [];
        this.functions = [];
        this.index = 0;
    }
    JImportFunction(name1, name2, args, body) {
        var f = new JImportFunction(this.index, name1, name2, args, body);
        this.importFunctions.push(f);
        this.index++;
        return f;
    }
    JFunction(name, args) {
        var f = new JFunction(this.index, name, args);
        this.functions.push(f);
        this.index++;
        return f;
    }
    ImportObject() {
        var importObject = {};
        for (var f of this.importFunctions) {
            if (importObject[f.name1] == undefined)
                importObject[f.name1] = {};
            importObject[f.name1][f.name2] = new Function(...f.args.map(a => a.name), f.body);
        }
        return importObject;
    }
    Emit() {
        // the type section is a vector of function types
        // TODO: optimise - some of the functions might have the same type signature
        const importFuncTypes = this.importFunctions.map(f => [
            functionType,
            ...encodeVector(f.args.map(a => a.type)),
            emptyArray
        ]);
        const funcTypes = this.functions.map(f => [
            functionType,
            ...encodeVector(f.args.map(a => a.type)),
            emptyArray
        ]);
        const typeSection = createSection(Section.type, encodeVector([...importFuncTypes, ...funcTypes]));
        // the function section is a vector of type indices that indicate the type of each function
        // in the code section
        const funcSection = createSection(Section.func, encodeVector(this.functions.map((_, index) => unsignedLEB128(index + this.importFunctions.length))));
        const importSection = createSection(Section.import, encodeVector(this.importFunctions.map(f => f.Encode())));
        // the export section is a vector of exported functions
        const exportSection = createSection(Section.export, encodeVector([
            [
                ...encodeString("run"),
                ExportType.func,
                this.functions.find(f => f.name === "main").funcIndex,
            ]
        ]));
        // the code section contains vectors of functions
        const codeSection = createSection(Section.code, encodeVector(this.functions.map(f => f.Encode())));
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
}
//========================
var jasm = new JASM();
var env_print = jasm.JImportFunction("env", "print", [new JArg(Valtype.f32, 'i')], 'console.log(i);');
var env_print2 = jasm.JImportFunction("env", "print2", [new JArg(Valtype.f32, 'i')], 'console.log("helloworld:"+i);');
var main = jasm.JFunction("main", []);
var func2 = jasm.JFunction("func2", [new JArg(Valtype.f32, 'i'), new JArg(Valtype.f32, 'ii')]);
func2.GetLocal('i');
func2.GetLocal('ii');
func2.F32Mul();
func2.Call(env_print2);
main.F32Const(3);
main.F32Const(5);
main.Call(func2);
main.F32Const(2);
main.F32Const(4.5);
main.Call(func2);
var wasm = jasm.Emit();
WebAssembly.instantiate(wasm, jasm.ImportObject()).then((obj) => {
    var exports = obj.instance.exports;
    exports.run();
});
