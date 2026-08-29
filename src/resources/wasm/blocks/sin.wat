;; sin — Control Systems
;; inputs:  (runtime $ctx), $in f64
;; outputs: $out f64
(func $sin (export "sin") (type $fn_sin) (param $ctx i32) (param $in f64) (result $out f64)
  (call $host_sin (local.get $in)))
