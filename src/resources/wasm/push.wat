;; Push a sample into the shared ring buffer (count at 4, samples at 16).
(func $push (param $v f64)
  (local $i i32)
  (local.set $i (i32.load (i32.const 4)))
  (f64.store offset=16
    (i32.mul (i32.rem_u (local.get $i) (i32.const 480)) (i32.const 8))
    (local.get $v))
  (i32.store (i32.const 4) (i32.add (local.get $i) (i32.const 1))))
