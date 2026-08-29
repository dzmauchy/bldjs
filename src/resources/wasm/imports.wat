;; Shared memory and host services used by every assembled generator.
(import "env" "memory" (memory 1 1 shared))
(import "host" "now" (func $now (type $fn_now)))
(import "host" "sin" (func $host_sin (type $fn_host_sin)))
