%% Type catalog and inference library.
%%
%% Consult this file first, then `blocks.pl`. Trealla already ships
%% `library(atts)`; type variables are attributed variables.
%%
%% Catalog facts:
%%   catalog(Id, Name).
%%   type(Name, Description).
%%   var(Type, Name, Constraint).
%%   parent(Child, Parent).
%%
%% Type terms: double, array(T), fn(Args, Ret), v(Name), top, ...

:- module(type, [
    catalog/2,
    type/2,
    var/3,
    parent/2,
    attr_unify_hook/2,
    verify_attributes/3,
    setup_var/2,
    constrain/2,
    constrain_join/2,
    unify_type/2,
    compatible/2,
    meet/3,
    join/3,
    read_type/2,
    connectable/1,
    ground_ty/1,
    infer_spec/5,
    ancestor/2,
    assert_parent/2
]).

:- use_module(library(atts)).
:- use_module(library(lists)).

:- attribute type/1.
:- dynamic parent/2.

catalog(types, 'Types').

type(double, '64-bit IEEE float').
type(float, '32-bit IEEE float').
type(int, '32-bit signed integer').
type(int64, '64-bit signed integer').
type(uint, '32-bit unsigned integer').
type(uint64, '64-bit unsigned integer').
type(string, 'UTF-8 string').
type(bool, 'boolean').
type(byte, 'unsigned 8-bit integer').
type(char, 'Unicode code point').
type(unit, 'unit').
type(array, 'homogeneous array').
var(array, 'T', none).

ancestor(A, B) :-
    parent(A, B).

%% Trealla library(atts) is SICStus-shaped. Bridge to SWI's
%% attr_unify_hook(+AttValue, +Other) as requested by the catalog.

verify_attributes(Var, Other, Goals) :-
    ( get_attr(Var, type, AttValue) ->
        Goals = [attr_unify_hook(AttValue, Other)]
    ; Goals = []
    ).

%% attr_unify_hook(+AttValue, +Other)
%% Called when an attributed type variable is unified.
attr_unify_hook(AttValue, Other) :-
    ( var(Other) ->
        ( get_attr(Other, type, OtherAtt) ->
            meet(AttValue, OtherAtt, Merged),
            put_attr(Other, type, Merged)
        ; put_attr(Other, type, AttValue)
        )
    ; meet(AttValue, Other, Merged),
      ( var(Other) ->
          put_attr(Other, type, Merged)
      ; true
      )
    ).

%% setup_var(?Var, +Constraint)
%% Constraint is `none` or a Prolog term such as extends(rec(Var)).
setup_var(Var, none) :-
    put_attr(Var, type, top).
setup_var(Var, Constraint) :-
    Constraint \= none,
    put_attr(Var, type, constraint(Constraint)).

%% constrain(+VarOrType, +Type)
%% Accumulate Type onto a type variable (meet / intersection).
constrain(Var, Type) :-
    var(Var),
    !,
    ( get_attr(Var, type, Old) ->
        meet(Old, Type, New),
        put_attr(Var, type, New)
    ; put_attr(Var, type, Type)
    ).
constrain(Existing, Type) :-
    unify_type(Existing, Type).

%% constrain_join(+VarOrType, +Type)
%% Like constrain/2 but joins (union) successive groundings — varargs.
constrain_join(Var, Type) :-
    var(Var),
    !,
    ( get_attr(Var, type, Old) ->
        join(Old, Type, New),
        put_attr(Var, type, New)
    ; put_attr(Var, type, Type)
    ).
constrain_join(Existing, Type) :-
    unify_type(Existing, Type).

%% unify_type(?A, ?B)
unify_type(A, B) :-
    A == B, !.
unify_type(A, B) :-
    var(A), !,
    constrain(A, B).
unify_type(A, B) :-
    var(B), !,
    constrain(B, A).
unify_type(array(T), array(U)) :-
    !,
    unify_type(T, U).
unify_type(fn(As, R), fn(Bs, S)) :-
    !,
    unify_args(As, Bs),
    unify_type(R, S).
unify_type(tuple(As), tuple(Bs)) :-
    !,
    unify_args(As, Bs).
unify_type(union(A, B), T) :-
    !,
    ( unify_type(A, T) ; unify_type(B, T) ).
unify_type(T, union(A, B)) :-
    !,
    unify_type(union(A, B), T).
unify_type(inter(A, B), T) :-
    !,
    unify_type(A, T),
    unify_type(B, T).
unify_type(T, inter(A, B)) :-
    !,
    ( unify_type(T, A) ; unify_type(T, B) ).
unify_type(fn(As, unit), array(fn(As, unit))) :-
    !.
unify_type(A, B) :-
    parent(A, B), !.
unify_type(A, B) :-
    A = B.

unify_args([], []) :- !.
unify_args([A|As], [B|Bs]) :-
    unify_type(A, B),
    unify_args(As, Bs).

%% compatible(+Formal, +Actual)
%% Actual may be passed where Formal is required. The source (Actual)
%% must not still contain free type variables.
compatible(Formal, Actual) :-
    copy_term(Formal-Actual, F-A),
    read_type(A, AR),
    ground_ty(AR),
    unify_type(F, A).

%% meet(+A, +B, -M)  greatest lower bound (intersection)
%% Nested intersections are not distributed here; JS `intersectionOf` flattens.
meet(top, T, T) :- !.
meet(T, top, T) :- !.
meet(T, T, T) :- !.
meet(constraint(C), T, R) :-
    !,
    satisfy_constraint(C, T),
    meet(top, T, R).
meet(T, constraint(C), R) :-
    !,
    meet(constraint(C), T, R).
meet(array(T), array(U), array(V)) :-
    !,
    meet(T, U, V).
meet(fn(As, R), fn(Bs, S), fn(As, P)) :-
    As == Bs, !,
    meet(R, S, P).
meet(A, B, A) :-
    parent(A, B), !.
meet(A, B, B) :-
    parent(B, A), !.
meet(A, B, inter(A, B)).

%% join(+A, +B, -J)  least upper bound (union)
%% Nested unions are not distributed here; JS `unionOf` flattens.
join(top, T, T) :- !.
join(T, top, T) :- !.
join(T, T, T) :- !.
join(A, B, B) :-
    parent(A, B), !.
join(A, B, A) :-
    parent(B, A), !.
join(A, B, union(A, B)).

satisfy_constraint(?(C), Actual) :-
    !,
    ( read_type(Actual, T), ground_ty(T) ->
        satisfy_constraint(C, Actual)
    ; true
    ).
satisfy_constraint(extends(Bound), Actual) :-
    copy_term(Bound, Bound1),
    ( parent(Actual, Bound1) ->
        true
    ; Bound1 = Actual
    ; unify_type(Actual, Bound1)
    ).
satisfy_constraint(comparable(Term), Actual) :-
    comparable_bound(Term, Bound),
    ( unify_type(Actual, Bound) ->
        true
    ; join(Actual, Bound, _)
    ).
satisfy_constraint(super(T), Actual) :-
    super_type(T, Super),
    unify_type(Actual, Super).

comparable_bound(?(X), Bound) :-
    !,
    comparable_bound(X, Bound).
comparable_bound(super(T), Bound) :-
    !,
    super_type(T, Bound).
comparable_bound(Bound, Bound).

super_type(T, Super) :-
    read_type(T, TT),
    ( parent(TT, Parent) ->
        Super = Parent
    ; Super = TT
    ).

%% read_type(+Term, -Type)
%% Project an attributed variable to its accumulated type term.
%% Unconstrained variables become `top` (a type hole in XML).
read_type(Term, Type) :-
    var(Term), !,
    ( get_attr(Term, type, T0), T0 \= top ->
        read_type(T0, Type)
    ; Type = top
    ).
read_type(array(A), array(B)) :-
    !,
    read_type(A, B).
read_type(fn(As, R), fn(Bs, S)) :-
    !,
    maplist(read_type, As, Bs),
    read_type(R, S).
read_type(tuple(As), tuple(Bs)) :-
    !,
    maplist(read_type, As, Bs).
read_type(inter(A, B), inter(C, D)) :-
    !,
    read_type(A, C),
    read_type(B, D).
read_type(union(A, B), union(C, D)) :-
    !,
    read_type(A, C),
    read_type(B, D).
read_type(constraint(_), top) :- !.
read_type(T, T).

connectable(Term) :-
    read_type(Term, Type),
    ground_ty(Type).

ground_ty(T) :-
    var(T), !, fail.
ground_ty(top) :-
    !, fail.
ground_ty(constraint(_)) :-
    !, fail.
ground_ty(array(T)) :-
    !,
    ground_ty(T).
ground_ty(fn(As, R)) :-
    !,
    maplist(ground_ty, As),
    ground_ty(R).
ground_ty(tuple(As)) :-
    !,
    maplist(ground_ty, As).
ground_ty(inter(A, B)) :-
    !,
    ground_ty(A),
    ground_ty(B).
ground_ty(union(A, B)) :-
    !,
    ground_ty(A),
    ground_ty(B).
ground_ty(_).

assert_parent(Child, Parent) :-
    ( parent(Child, Parent) ->
        true
    ; assertz(parent(Child, Parent))
    ).

%% infer_spec(+VarSpecs, +Ins, +Outs, +Grounded, -Result)
%% VarSpecs = [var(Name, Constraint), ...]
%% Ins      = [in(Name, Type, Constraint, vararg|once), ...]
%% Outs     = [out(Name, Type, Constraint), ...]
%% Grounded = [g(Name, single, Type), g(Name, join, [Type, ...]), ...]
%% Type terms use v(Name) for the block's type variables.
infer_spec(VarSpecs, Ins, Outs, Grounded, result(Compats, InReads, OutReads, VarReads)) :-
    setup_env(VarSpecs, Env),
    maplist(check_in(Env, Grounded), Ins, Compats),
    maplist(bind_out(Env), Outs),
    maplist(read_in_port(Env), Ins, InReads),
    maplist(read_out_port(Env), Outs, OutReads),
    maplist(read_var_bind, Env, VarReads).

setup_env(VarSpecs, Env) :-
    maplist(make_var, VarSpecs, Env),
    maplist(apply_var_constraint(Env), VarSpecs).

make_var(var(Name, _), Name-Var) :-
    setup_var(Var, none).

apply_var_constraint(_Env, var(_Name, none)) :- !.
apply_var_constraint(Env, var(Name, Constraint)) :-
    memberchk(Name-Var, Env),
    instantiate(Constraint, Env, C1),
    put_attr(Var, type, constraint(C1)).

check_in(Env, Grounded, in(Name, Type, Constraint, Vararg), compat(Name, Ok)) :-
    instantiate(Type, Env, Formal),
    apply_port_constraint(Formal, Constraint, Env),
    ( memberchk(g(Name, Kind, Payload), Grounded) ->
        ground_ok(Vararg, Formal, Env, Kind, Payload, Ok)
    ; Ok = true
    ).

ground_ok(vararg, Formal, Env, join, Payload, Ok) :-
    !,
    ( maplist(join_one(Formal, Env), Payload) -> Ok = true ; Ok = false ).
ground_ok(_Vararg, Formal, Env, join, Payload, Ok) :-
    !,
    ( maplist(once_one(Formal, Env), Payload) -> Ok = true ; Ok = false ).
ground_ok(vararg, Formal, Env, single, Payload, Ok) :-
    !,
    ground_ok(vararg, Formal, Env, join, [Payload], Ok).
ground_ok(_Vararg, Formal, Env, single, Payload, Ok) :-
    instantiate(Payload, Env, Actual),
    ( constrain(Formal, Actual) -> Ok = true ; Ok = false ).

join_one(Formal, Env, Item) :-
    instantiate(Item, Env, Actual),
    constrain_join(Formal, Actual).

once_one(Formal, Env, Item) :-
    instantiate(Item, Env, Actual),
    constrain(Formal, Actual).

bind_out(Env, out(_Name, Type, Constraint)) :-
    instantiate(Type, Env, Formal),
    apply_port_constraint(Formal, Constraint, Env).

apply_port_constraint(_Formal, none, _Env) :- !.
apply_port_constraint(Formal, Constraint, Env) :-
    instantiate(Constraint, Env, C1),
    ( var(Formal) ->
        constrain(Formal, constraint(C1))
    ; satisfy_constraint(C1, Formal)
    ).

read_in_port(Env, in(Name, Type, _, _), in(Name, Ty)) :-
    instantiate(Type, Env, Formal),
    read_type(Formal, Ty).

read_out_port(Env, out(Name, Type, _), out(Name, Ty, Conn)) :-
    instantiate(Type, Env, Formal),
    read_type(Formal, Ty),
    ( connectable(Formal) -> Conn = true ; Conn = false ).

read_var_bind(Name-Var, var(Name, Ty)) :-
    read_type(Var, Ty).

instantiate(v(Name), Env, Var) :-
    atom(Name),
    memberchk(Name-Var, Env), !.
instantiate([], _Env, []) :- !.
instantiate([H|T], Env, [H1|T1]) :-
    !,
    instantiate(H, Env, H1),
    instantiate(T, Env, T1).
instantiate(Term, Env, Out) :-
    nonvar(Term),
    \+ atomic(Term),
    Term =.. [F|Args],
    F \= v,
    maplist(instantiate_one(Env), Args, Args1),
    Out =.. [F|Args1], !.
instantiate(Term, _Env, Term).

instantiate_one(Env, A, B) :-
    instantiate(A, Env, B).
