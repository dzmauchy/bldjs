;; Park the worker with memory.atomic.wait32 on the shared wait word.
(func $park (param $ns i64)
  (if (i64.gt_s (local.get $ns) (i64.const 0))
    (then
      (drop (memory.atomic.wait32 (i32.const 8) (i32.const 0) (local.get $ns))))))
