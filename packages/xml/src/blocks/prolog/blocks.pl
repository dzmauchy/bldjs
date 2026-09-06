%% Per-block inference rules, loaded after the type library.
%%
%% Catalog XML is compiled to `block(Id, Vars, Ins, Outs)` facts and
%% consulted after this file. `infer_block/3` looks a block up by id
%% and runs the shared `infer_spec/5` checker from `type`.

:- use_module(type).
:- dynamic block/4.

infer_block(Id, Grounded, Result) :-
    block(Id, Vars, Ins, Outs),
    infer_spec(Vars, Ins, Outs, Grounded, Result).
