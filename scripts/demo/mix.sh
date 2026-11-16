#!/usr/bin/env bash
# Final mix: music bed ducked under the narration.  mix.sh joined.mp4 music.wav out.mp4   (needs ffmpeg 6+)
set -euo pipefail
ffmpeg -y -loglevel error -i "$1" -i "$2" -filter_complex '[0:a]asplit=2[voice][key];[1:a]volume=0.8[m];[m][key]sidechaincompress=threshold=0.02:ratio=9:attack=15:release=500[duck];[voice][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.95[a]' -map 0:v -map '[a]' -c:v copy -c:a aac -b:a 192k -movflags +faststart "$3"
