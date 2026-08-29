;; Read the stop flag published by the host (i32.atomic.load at offset 0).
(func $stopped (result $flag i32)
  (i32.atomic.load (i32.const 0)))
