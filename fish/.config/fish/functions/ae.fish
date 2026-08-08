function ae
    if not command -sq auto-editor
        printf 'ae: auto-editor not found\n' >&2
        return 1
    end

    if not command -sq fzf
        printf 'ae: fzf not found\n' >&2
        return 1
    end

    if not command -sq ffprobe
        printf 'ae: ffprobe not found\n' >&2
        return 1
    end

    set -l file

    if test (count $argv) -gt 0
        if not string match -qr '^-' -- $argv[1]
            set file $argv[1]
            set -e argv[1]
        end
    end

    argparse h/help t/threshold= m/margin= s/smooth= l/levels p/preview raw dead speech open= close= hold= -- $argv
    or return 1

    if set -q _flag_help
        printf '%s\n' \
            'usage: ae [file] [--preview] [--levels] [--speech|--dead|--raw]' \
            '       [--threshold N] [--open N] [--close N] [--hold LENGTH]' \
            '       [--margin LEAD[,TAIL]] [--smooth MINCUT[,MINCLIP]]' \
            '' \
            'defaults:' \
            '  --speech  open=0.01995 close=0.0126 hold=90ms margin=15ms,15ms smooth=50ms,100ms' \
            '  --dead    threshold=0.004 margin=0.1s smooth=0.1s,0.06s'
        return 0
    end

    set -l mode gate
    set -l threshold 0.004
    set -l open_threshold 0.01995
    set -l close_threshold 0.0126
    set -l hold 90ms
    set -l margin 15ms,15ms
    set -l smooth 50ms,100ms

    if set -q _flag_dead
        set mode raw
        set margin 0.1s
        set smooth 0.1s,0.06s
    end

    if set -q _flag_raw
        set mode raw
    end

    if set -q _flag_speech
        set mode gate
    end

    if set -q _flag_threshold
        if test "$mode" = raw
            set threshold $_flag_threshold[1]
        else
            set close_threshold $_flag_threshold[1]
            if not set -q _flag_open
                set open_threshold (python3 -c 'import sys; close = float(sys.argv[1]); print(min(close * 1.584893192, 1.0))' "$close_threshold")
            end
        end
    end

    if set -q _flag_open
        set open_threshold $_flag_open[1]
    end

    if set -q _flag_close
        set close_threshold $_flag_close[1]
    end

    if set -q _flag_hold
        set hold $_flag_hold[1]
    end

    if set -q _flag_margin
        set margin $_flag_margin[1]
    end

    if set -q _flag_smooth
        set smooth $_flag_smooth[1]
    end

    if test -z "$file"
        if test (count $argv) -gt 0
            set file $argv[1]
        else
            set -l entries (python3 -c '
from pathlib import Path
import json
import subprocess
import time

def ago(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s ago"
    if seconds < 3600:
        return f"{seconds // 60}m ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    if seconds < 604800:
        return f"{seconds // 86400}d ago"
    if seconds < 2592000:
        return f"{seconds // 604800}w ago"
    if seconds < 31536000:
        return f"{seconds // 2592000}mo ago"
    return f"{seconds // 31536000}y ago"

now = time.time()
files = []
for path in Path(".").iterdir():
    if path.is_file():
        try:
            stat = path.stat()
        except OSError:
            continue

        probe = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
        )

        if probe.returncode != 0:
            continue

        try:
            data = json.loads(probe.stdout or "{}")
        except json.JSONDecodeError:
            continue

        streams = data.get("streams", [])
        if not any(stream.get("codec_type") in {"video", "audio"} for stream in streams):
            continue

        files.append((stat.st_mtime, path.name))

for mtime, name in sorted(files, reverse=True):
    age = max(0, int(now - mtime))
    print(f"{ago(age):>8}  {name}\t{name}")
')

            if test (count $entries) -eq 0
                printf 'ae: no files in current directory\n' >&2
                return 1
            end

            set -l selected (printf '%s\n' $entries | fzf --height 40% --reverse --prompt='ae > ' --delimiter='\t' --with-nth=1)

            if test -z "$selected"
                return 130
            end

            set file (string split -m1 \t -- $selected)[2]
        end
    end

    if test -z "$file"
        printf 'ae: no file selected\n' >&2
        return 1
    end

    if set -q _flag_levels
        command auto-editor levels "$file"
        return $status
    end

    if test "$mode" = raw
        set -l edit audio:$threshold

        if set -q _flag_preview
            command auto-editor "$file" --preview --edit $edit --margin $margin --smooth $smooth
            return $status
        end

        command auto-editor "$file" --export resolve -o preedit.fcpxml --edit $edit --margin $margin --smooth $smooth
        return $status
    end

    set -l margin_parts (string split , -- $margin)
    set -l lead $margin_parts[1]
    set -l tail $margin_parts[1]
    if test (count $margin_parts) -ge 2
        set tail $margin_parts[2]
    end

    set -l smooth_parts (string split , -- $smooth)
    set -l mincut $smooth_parts[1]
    set -l minclip $smooth_parts[1]
    if test (count $smooth_parts) -ge 2
        set minclip $smooth_parts[2]
    end

    set -l cut_ranges (python3 -c '
import subprocess
import sys

file, open_threshold, close_threshold, hold, lead, tail, mincut, minclip = sys.argv[1:]
open_threshold = float(open_threshold)
close_threshold = float(close_threshold)

if open_threshold < close_threshold:
    raise SystemExit("ae: open threshold must be greater than or equal to close threshold")

def parse_length(value):
    if value.endswith("ms"):
        return float(value[:-2]) / 1000.0
    if value.endswith(("sec", "secs")):
        value = value[:-3] if value.endswith("sec") else value[:-4]
        return float(value)
    if value.endswith(("second", "seconds")):
        value = value[:-6] if value.endswith("second") else value[:-7]
        return float(value)
    if value.endswith("s"):
        return float(value[:-1])
    return float(value)

def to_frames(value, chunk):
    return max(0, int(round(parse_length(value) / chunk)))

def smooth(bits, mincut_frames, minclip_frames):
    prev = None
    current = bits[:]
    while prev != current:
        prev = current[:]
        nxt = prev[:]
        start = 0
        active = False

        for i, item in enumerate(prev):
            if item:
                if not active:
                    start = i
                    active = True
                if i == len(prev) - 1 and i - start < minclip_frames:
                    for j in range(start, len(prev)):
                        nxt[j] = False
            elif active:
                if i - start < minclip_frames:
                    for j in range(start, i):
                        nxt[j] = False
                active = False

        start = 0
        active = False

        for i, item in enumerate(prev):
            if not item:
                if not active:
                    start = i
                    active = True
                if i == len(prev) - 1 and i - start < mincut_frames:
                    for j in range(start, len(prev)):
                        nxt[j] = True
            elif active:
                if i - start < mincut_frames:
                    for j in range(start, i):
                        nxt[j] = True
                active = False

        current = nxt
    return current

levels_proc = subprocess.run(
    ["auto-editor", "levels", file],
    capture_output=True,
    text=True,
    check=True,
)

levels = []
for line in levels_proc.stdout.splitlines():
    line = line.strip()
    if not line or line.startswith("@"):
        continue
    levels.append(float(line))

if not levels:
    raise SystemExit(0)

duration_proc = subprocess.run(
    [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nk=1:nw=1",
        file,
    ],
    capture_output=True,
    text=True,
    check=True,
)

duration = float(duration_proc.stdout.strip())
chunk = duration / len(levels)
hold_frames = to_frames(hold, chunk)
lead_frames = to_frames(lead, chunk)
tail_frames = to_frames(tail, chunk)
mincut_frames = to_frames(mincut, chunk)
minclip_frames = to_frames(minclip, chunk)

segments = []
active = False
start = 0
below = 0

for i, level in enumerate(levels):
    if not active:
        if level >= open_threshold:
            active = True
            start = i
            below = 0
    else:
        if level < close_threshold:
            below += 1
            if below > hold_frames:
                segments.append((start, i))
                active = False
                below = 0
        else:
            below = 0

if active:
    segments.append((start, len(levels)))

bits = [False] * len(levels)
for start, end in segments:
    start = max(0, start - lead_frames)
    end = min(len(levels), end + tail_frames)
    for i in range(start, end):
        bits[i] = True

bits = smooth(bits, mincut_frames, minclip_frames)

cut_start = None
for i, item in enumerate(bits):
    if not item and cut_start is None:
        cut_start = i
    elif item and cut_start is not None:
        print(f"{cut_start * chunk:.6f}sec,{i * chunk:.6f}sec")
        cut_start = None

if cut_start is not None:
    print(f"{cut_start * chunk:.6f}sec,{len(bits) * chunk:.6f}sec")
' "$file" "$open_threshold" "$close_threshold" "$hold" "$lead" "$tail" "$mincut" "$minclip")
    or return 1

    set -l command auto-editor "$file"

    if set -q _flag_preview
        set command $command --preview
    else
        set command $command --export resolve -o preedit.fcpxml
    end

    set command $command --edit none

    for cut_range in $cut_ranges
        set command $command --cut $cut_range
    end

    command $command
end
