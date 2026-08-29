;; quantizer — Control Systems
;; inputs:  (runtime $ctx), $in f64
;; outputs: $out f64
;; Parks from $ctx.delay_ns when the worker run-loop asks it to wait.
(func $quantizer (export "quantizer") (type $fn_quantizer) (param $ctx i32) (param $in f64) (result $out f64)
  (local.get $in))
