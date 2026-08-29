;; oscilloscope — Control Systems
;; inputs:  (runtime $ctx), $in f64
;; outputs: (none)
(func $oscilloscope (export "oscilloscope") (type $fn_oscilloscope) (param $ctx i32) (param $in f64)
  (call $push (local.get $in)))
