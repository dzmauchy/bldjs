%% Per-block inference rules, loaded after the type library.
%%
%% `infer_block/3` looks up `block(Id, Vars, Ins, Outs)` facts generated
%% from catalog XML (type vars, inputs, outputs, optional constraints).

:- use_module(type).
:- dynamic block/4.

infer_block(Id, Grounded, Result) :-
    block(Id, Vars, Ins, Outs),
    infer_spec(Vars, Ins, Outs, Grounded, Result).
