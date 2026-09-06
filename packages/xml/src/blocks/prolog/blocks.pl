%% Block catalog and inference dispatcher, loaded after types.pl.
%%
%%   catalog(Id, Name).
%%   ns(Id, Name, Parent).
%%   block(Id, Name, Icon, Attrs).
%%   input(Block, Id, Name, Type, Attrs).
%%   output(Block, Id, Name, Type, Attrs).
%%   param(Block, Name, Kind, Attrs).
%%
%% Attrs may include ns/1, kind/1, description/1, runnable, generator,
%% combiner, var(Name, Constraint), vararg, constraint/1, dynamic.

:- use_module(type).
:- use_module(library(lists)).

:- dynamic block/4.
:- dynamic input/5.
:- dynamic output/5.
:- dynamic param/4.
:- dynamic ns/3.

catalog(cs, 'Control Systems').

ns('com.dauch.cs', 'Control Systems', none).
ns('com.dauch.cs.gen', 'Gen', 'com.dauch.cs').
ns('com.dauch.cs.gpio', 'GPIO', 'com.dauch.cs').
ns('com.dauch.cs.tf', 'Transform', 'com.dauch.cs').
ns('com.dauch.cs.sink', 'Sink', 'com.dauch.cs').

block(timer, 'Timer', timer, [
    ns('com.dauch.cs.gen'),
    kind('Start'),
    runnable,
    generator,
    description('Push source. Accepts (double) -> unit and writes timestamps while running.')
]).
param(timer, period, integer_range, [
    description('Quantization period in milliseconds'),
    min(1), max(1000), step(1), default(10)
]).
input(timer, in, in, fn([double], unit), []).

block(random, 'Random', random, [
    ns('com.dauch.cs.gen'),
    kind('Start'),
    runnable,
    generator,
    description('Push source. Writes a random sample in [0, 1) at the quantization period.')
]).
param(random, period, integer_range, [
    description('Quantization period in milliseconds'),
    min(1), max(1000), step(1), default(10)
]).
input(random, in, in, fn([double], unit), []).

block(constant, 'Constant', constant, [
    ns('com.dauch.cs.gen'),
    kind('Start'),
    runnable,
    generator,
    description('Push source. Writes a constant sample at the quantization period.')
]).
param(constant, value, double_range, [
    description('Constant sample value'),
    min(-100), max(100), step(0.1), default(1)
]).
param(constant, period, integer_range, [
    description('Quantization period in milliseconds'),
    min(1), max(1000), step(1), default(10)
]).
input(constant, in, in, fn([double], unit), []).

block(sin, 'Sin', sin, [
    ns('com.dauch.cs.tf'),
    kind('Process'),
    description('Transformer. Maps each sample with sin. (double) -> unit → (double) -> unit.')
]).
input(sin, in, in, fn([double], unit), []).
output(sin, out, out, fn([double], unit), []).

block(cos, 'Cos', cos, [
    ns('com.dauch.cs.tf'),
    kind('Process'),
    description('Transformer. Maps each sample with cos. (double) -> unit → (double) -> unit.')
]).
input(cos, in, in, fn([double], unit), []).
output(cos, out, out, fn([double], unit), []).

block(overshoot, 'Overshoot', overshoot, [
    ns('com.dauch.cs.tf'),
    kind('Process'),
    description('Transformer. Maps time samples through a second-order underdamped unit-step response.')
]).
param(overshoot, 'ζ', double_range, [
    description('Damping ratio ζ'),
    min(0.05), max(0.95), step(0.01), default(0.5)
]).
param(overshoot, 'ω', double_range, [
    description('Natural frequency ω (rad/s)'),
    min(0.1), max(20), step(0.1), default(1)
]).
input(overshoot, in, in, fn([double], unit), []).
output(overshoot, out, out, fn([double], unit), []).

block(product, 'Product', product, [
    ns('com.dauch.cs.tf'),
    kind('Process'),
    combiner,
    description('Combiner. Returns n factor consumers.')
]).
param(product, n, integer_range, [
    description('Output count'),
    min(1), max(8), step(1), default(2)
]).
param(product, def, double_range, [
    description('Default value of each output'),
    min(-100), max(100), step(0.1), default(1)
]).
input(product, in, in, fn([double], unit), []).
output(product, out, out, array(fn([double], unit)), [dynamic]).

block(gpio_in, 'GPIO In', gpio_in, [
    ns('com.dauch.cs.gpio'),
    kind('Start'),
    runnable,
    generator,
    description('Digital input. Pushes the pin level (0 or 1) when the pin changes.')
]).
param(gpio_in, pin, integer_range, [
    description('GPIO pin number'),
    min(0), max(31), step(1), default(0)
]).
input(gpio_in, in, in, fn([double], unit), []).

block(gpio_out, 'GPIO Out', gpio_out, [
    ns('com.dauch.cs.gpio'),
    kind('Output'),
    description('Digital output. Consumes each sample and writes the pin.')
]).
param(gpio_out, pin, integer_range, [
    description('GPIO pin number'),
    min(0), max(31), step(1), default(1)
]).
output(gpio_out, out, out, fn([double], unit), []).

block(scope, 'Scope', scope, [
    ns('com.dauch.cs.sink'),
    kind('Output'),
    description('Plot sink. Returns a dynamically sized array[(double) -> unit].')
]).
param(scope, n, integer_range, [
    description('Time window width in seconds'),
    min(10), max(600), step(1), default(30)
]).
param(scope, m, integer_range, [
    description('Quantizer period in milliseconds'),
    min(10), max(1000), step(1), default(10)
]).
output(scope, out, out, array(fn([double], unit)), [dynamic]).

infer_block(Id, Grounded, Result) :-
    block(Id, _, _, Attrs),
    findall(var(Name, Constraint), member(var(Name, Constraint), Attrs), Vars),
    findall(in(Name, Ty, Constraint, Flag), input_spec(Id, Name, Ty, Constraint, Flag), Ins),
    findall(out(Name, Ty, Constraint), output_spec(Id, Name, Ty, Constraint), Outs),
    infer_spec(Vars, Ins, Outs, Grounded, Result).

input_spec(Block, Name, Ty, Constraint, Flag) :-
    input(Block, _, Name, Ty, Attrs),
    port_constraint(Attrs, Constraint),
    ( memberchk(vararg, Attrs) -> Flag = vararg ; Flag = once ).

output_spec(Block, Name, Ty, Constraint) :-
    output(Block, _, Name, Ty, Attrs),
    port_constraint(Attrs, Constraint).

port_constraint(Attrs, Constraint) :-
    memberchk(constraint(Constraint), Attrs), !.
port_constraint(_, none).
