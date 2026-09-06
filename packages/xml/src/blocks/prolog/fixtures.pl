%% Test-only blocks. Associated as fixtures.pl; not part of the builtin palette.

catalog(fixtures, 'Test Fixtures').

ns(types, 'Types', none).
ns(flow, 'Flow', none).

block(b_Int, 'Int', i32, [ns(types), kind('Data')]).
output(b_Int, value, value, int, []).

block(b_Int64, 'Int64', i64, [ns(types), kind('Data')]).
output(b_Int64, value, value, int64, []).

block(b_Float, 'Float', f32, [ns(types), kind('Data')]).
output(b_Float, value, value, float, []).

block(b_Double, 'Double', f64, [ns(types), kind('Data')]).
output(b_Double, value, value, double, []).

block(b_String, 'String', string, [ns(types), kind('Data')]).
output(b_String, value, value, string, []).

block(b_Bool, 'Bool', bool, [ns(types), kind('Data')]).
output(b_Bool, value, value, bool, []).

block(b_array_of, array, list, [
    ns(types),
    kind('Process'),
    description('Vararg elements become array[T]'),
    var('T', none)
]).
input(b_array_of, elems, elems, v('T'), [vararg]).
output(b_array_of, result, result, array(v('T')), []).

block(b_array_get, 'array.get', list, [
    ns(types),
    kind('Process'),
    var('T', none)
]).
input(b_array_get, array, array, array(v('T')), []).
input(b_array_get, index, index, int, []).
output(b_array_get, elem, elem, v('T'), []).

block(b_start, 'Start', start, [
    ns(flow),
    kind('Start'),
    description('Entry point for a flow'),
    var('T', none)
]).
output(b_start, out, out, v('T'), []).

block(b_process, 'Process', process, [
    ns(flow),
    kind('Process'),
    description('Do some work'),
    var('T', none)
]).
input(b_process, in, in, v('T'), []).
output(b_process, out, out, v('T'), []).

block(b_decision, 'Decision', decision, [
    ns(flow),
    kind('Decision'),
    description('Branch on a condition'),
    var('T', none)
]).
input(b_decision, in, in, v('T'), []).
output(b_decision, true, true, v('T'), []).
output(b_decision, false, false, v('T'), []).

block(b_data, 'Data', data, [
    ns(flow),
    kind('Data'),
    description('Read or write data'),
    var('T', none)
]).
input(b_data, in, in, v('T'), []).
output(b_data, out, out, v('T'), []).

block(b_output, 'Output', output, [
    ns(flow),
    kind('Output'),
    description('Emit a result'),
    var('T', none)
]).
input(b_output, in, in, v('T'), []).

block(b_identity, 'Identity', identity, [
    ns(flow),
    kind('Process'),
    description('Pass a value through, unifying T'),
    var('T', none)
]).
input(b_identity, in, in, v('T'), []).
output(b_identity, out, out, v('T'), []).
