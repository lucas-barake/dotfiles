function caffeinate
    if test (count $argv) -ge 2; and test "$argv[1]" = "-h"
        set -l hours $argv[2]

        if not string match -rq '^[0-9]+$' -- $hours
            printf 'caffeinate: invalid hour value: %s\n' $hours >&2
            return 1
        end

        set -l seconds (math "$hours * 3600")
        set -e argv[1..2]
        command caffeinate -t $seconds $argv
        return $status
    end

    command caffeinate $argv
end
