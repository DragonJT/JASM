//copied quite a lot from https://github.com/ColinEberhardt/chasm

const ieee754 = (n: number) => {
    var data = new Float32Array([n]);
    var buffer = new ArrayBuffer(data.byteLength);
    var floatView = new Float32Array(buffer).set(data);
    return new Uint8Array(buffer);
};

const encodeString = (str: string) => [
    str.length,
    ...str.split("").map(s => s.charCodeAt(0))
];

const signedLEB128 = (n: number) => {
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
        } else {
            byte |= 0x80;
        }
        buffer.push(byte);
    }
    return buffer;
};

const unsignedLEB128 = (n: number) => {
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

const flatten = (arr: any[]) => [].concat.apply([], arr);

// https://webassembly.github.io/spec/core/binary/modules.html#sections
enum Section {
    custom = 0,
    type = 1,
    import = 2,
    func = 3,
    table = 4,
    memory = 5,
    global = 6,
    export = 7,
    start = 8,
    element = 9,
    code = 10,
    data = 11
}

// https://webassembly.github.io/spec/core/binary/types.html
enum Valtype {
    i32 = 0x7f,
    f32 = 0x7d
}

// https://webassembly.github.io/spec/core/binary/types.html#binary-blocktype
enum Blocktype {
    void = 0x40
}

// https://webassembly.github.io/spec/core/binary/instructions.html
enum Opcodes {
    block = 0x02,
    loop = 0x03,
    br = 0x0c,
    br_if = 0x0d,
    end = 0x0b,
    call = 0x10,
    get_local = 0x20,
    set_local = 0x21,
    i32_store_8 = 0x3a,
    i32_const = 0x41,
    f32_const = 0x43,
    i32_eqz = 0x45,
    i32_eq = 0x46,
    f32_eq = 0x5b,
    f32_lt = 0x5d,
    f32_gt = 0x5e,
    i32_and = 0x71,
    f32_add = 0x92,
    f32_sub = 0x93,
    f32_mul = 0x94,
    f32_div = 0x95,
    i32_trunc_f32_s = 0xa8
}

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
enum ExportType {
    func = 0x00,
    table = 0x01,
    mem = 0x02,
    global = 0x03
}

// http://webassembly.github.io/spec/core/binary/types.html#function-types
const functionType = 0x60;

const emptyArray = 0x0;

// https://webassembly.github.io/spec/core/binary/modules.html#binary-module
const magicModuleHeader = [0x00, 0x61, 0x73, 0x6d];
const moduleVersion = [0x01, 0x00, 0x00, 0x00];

// https://webassembly.github.io/spec/core/binary/conventions.html#binary-vec
// Vectors are encoded with their length followed by their element sequence
const encodeVector = (data: any[]) => [
    ...unsignedLEB128(data.length),
    ...flatten(data)
];

// https://webassembly.github.io/spec/core/binary/modules.html#code-section
const encodeLocal = (count: number, type: Valtype) => [
    ...unsignedLEB128(count),
    type
];

// https://webassembly.github.io/spec/core/binary/modules.html#sections
// sections are encoded by their type followed by their vector contents
const createSection = (sectionType: Section, data: any[]) => [
    sectionType,
    ...encodeVector(data)
];

interface ICallableFunction{
    funcIndex:number;
}

class JFunction implements ICallableFunction {
    funcIndex:number;
    name: String;
    args: JArg[];
    code: number[] = [];

    constructor(index:number, name: String, args: JArg[]) {
        this.funcIndex = index;
        this.args = args;
        this.name = name;
        for(var i=0;i<args.length;i++)
            args[i].localIndex = i;
    }

    F32Const(value:number){
        this.code.push(Opcodes.f32_const);
        this.code.push(...ieee754(value));
    }

    F32Add(){
        this.code.push(Opcodes.f32_add);
    }

    F32Mul(){
        this.code.push(Opcodes.f32_mul);
    }

    Call(callableFunction:ICallableFunction){
        this.code.push(Opcodes.call);
        this.code.push(...unsignedLEB128(callableFunction.funcIndex));
    }

    GetLocal(name:string){
        this.code.push(Opcodes.get_local);
        this.code.push(...unsignedLEB128(this.args.find(a=>a.name == name)!.localIndex));
    }

    Encode(): number[] {
        const localCount = 0;
        const locals = localCount > 0 ? [encodeLocal(localCount, Valtype.f32)] : [];
        return encodeVector([...encodeVector(locals), ...this.code, Opcodes.end]);
    }
}

class JImportFunction implements ICallableFunction{
    funcIndex: number;
    name1: string;
    name2: string;
    args: JArg[];
    body:string;

    constructor(index:number, name1: string, name2: string, args:JArg[], body:string) {
        this.funcIndex = index;
        this.name1 = name1;
        this.name2 = name2;
        this.args = args;
        for(var i=0;i<args.length;i++)
            args[i].localIndex = i;
        this.body = body;
    }

    Encode(): number[] {
        return [
            ...encodeString(this.name1),
            ...encodeString(this.name2),
            ExportType.func,
            ...unsignedLEB128(this.funcIndex)];
    }
}

interface ILocal{
    localIndex:number;
}

class JArg implements ILocal{
    type:Valtype;
    name:string;
    localIndex = -1;

    constructor(type:Valtype, name:string){
        this.type = type;
        this.name = name;
    }
}

class JASM {
    private importFunctions: JImportFunction[] = [];
    private functions: JFunction[] = [];
    private index = 0;

    JImportFunction(name1:string, name2:string, args:JArg[], body:string):JImportFunction{
        var f = new JImportFunction(this.index, name1, name2, args, body);
        this.importFunctions.push(f);
        this.index++;
        return f;
    }

    JFunction(name:string, args:JArg[]){
        var f = new JFunction(this.index, name, args);
        this.functions.push(f);
        this.index++;
        return f;
    }

    ImportObject():any{
        var importObject:any = {};
        for(var f of this.importFunctions){
            if(importObject[f.name1] == undefined)
                importObject[f.name1] = {};
            importObject[f.name1][f.name2] = new Function(...f.args.map(a=>a.name), f.body);
        }
        return importObject;
    }

    Emit(): Uint8Array {

        // the type section is a vector of function types
        // TODO: optimise - some of the functions might have the same type signature
        const importFuncTypes = this.importFunctions.map(f=>[
            functionType,
            ...encodeVector(f.args.map(a=>a.type)),
            emptyArray
        ]);
        const funcTypes = this.functions.map(f => [
            functionType,
            ...encodeVector(f.args.map(a=>a.type)),
            emptyArray
        ]);
        const typeSection = createSection(
            Section.type,
            encodeVector([...importFuncTypes, ...funcTypes])
        );

        // the function section is a vector of type indices that indicate the type of each function
        // in the code section
        const funcSection = createSection(
            Section.func,
            encodeVector(this.functions.map((_, index) => unsignedLEB128(index + this.importFunctions.length)))
        );

        const importSection = createSection(
            Section.import,
            encodeVector(this.importFunctions.map(f => f.Encode()))
        );

        // the export section is a vector of exported functions
        const exportSection = createSection(
            Section.export,
            encodeVector([
                [
                    ...encodeString("run"),
                    ExportType.func,
                    this.functions.find(f => f.name === "main")!.funcIndex,
                ]
            ])
        );

        // the code section contains vectors of functions
        const codeSection = createSection(
            Section.code,
            encodeVector(this.functions.map(f => f.Encode()))
        );

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

WebAssembly.instantiate(wasm, jasm.ImportObject()).then(
    (obj) => {
        var exports = obj.instance.exports as any;
        exports.run();
    }
);