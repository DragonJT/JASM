
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

const codeFromProc = () => {
    const code: number[] = [];

    code.push(Opcodes.f32_const);
    code.push(...ieee754(4.5))
    code.push(Opcodes.call);
    code.push(...unsignedLEB128(0));

    const localCount = 0;
    const locals = localCount > 0 ? [encodeLocal(localCount, Valtype.f32)] : [];
    return encodeVector([...encodeVector(locals), ...code, Opcodes.end]);
};

class JFunction{
  name:String;
  args:Valtype[];

  constructor(name:String, args:Valtype[]){
    this.args = args;
    this.name = name;
  }
}

interface Emitter {
  (functions:JFunction[]): Uint8Array;
}

function emitter(functions:JFunction[]){
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
  const typeSection = createSection(
    Section.type,
    encodeVector([printFunctionType, ...funcTypes])
  );

  // the function section is a vector of type indices that indicate the type of each function
  // in the code section
  const funcSection = createSection(
    Section.func,
    encodeVector(functions.map((_, index) => index + 1 /* type index */))
  );

  // the import section is a vector of imported functions
  const printFunctionImport = [
    ...encodeString("env"),
    ...encodeString("print"),
    ExportType.func,
    0x00 // type index
  ];

  const importSection = createSection(
    Section.import,
    encodeVector([printFunctionImport])
  );

  // the export section is a vector of exported functions
  const exportSection = createSection(
    Section.export,
    encodeVector([
      [
        ...encodeString("run"),
        ExportType.func,
        functions.findIndex(f => f.name === "main") + 1
      ]
    ])
  );

  // the code section contains vectors of functions
  const codeSection = createSection(
    Section.code,
    encodeVector(functions.map(f => codeFromProc()))
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
};

//========================

var functions = [new JFunction("main", [])];
var wasm = emitter(functions);

const importObject = {
    env: {
      print(i:number) {
        console.log(i);
      },
    },
  };

WebAssembly.instantiate(wasm, importObject).then(
    (obj) => {
        var exports = obj.instance.exports as any;
        exports.run();
    }
);