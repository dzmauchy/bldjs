;; timer — Control Systems
;; inputs:  (runtime $ctx)
;; outputs: $out f64
(func $timer (export "timer") (type $fn_timer) (param $ctx i32) (result $out f64)
  (f64.load (local.get $ctx)))
