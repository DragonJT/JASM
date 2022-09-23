///<reference path="./Emitter.ts"/>

var jasm = new JASM();
var env_print = jasm.ImportFunction("env", "print", [new JArg(Valtype.f32, 'i')], 'console.log(i);');
var env_print2 = jasm.ImportFunction("env", "print2", [new JArg(Valtype.f32, 'i')], 'console.log("helloworld:"+i);');
var main = jasm.Function("main", []);

var func2_i = new JArg(Valtype.f32, 'i');
var func2_ii = new JArg(Valtype.f32, 'ii');
var func2 = jasm.Function("func2", [func2_i, func2_ii]);

func2.GetLocal(func2_i);
func2.GetLocal(func2_ii);
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